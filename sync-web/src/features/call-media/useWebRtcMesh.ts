import { useCallback, useEffect, useRef, useState } from "react";
import { emitSignal, onSocketEvent } from "@/lib/realtime/socket";
import {
  SignalEvent,
  type PeerDescriptor,
  type PeerJoinedPayload,
  type PeerLeftPayload,
  type SignalData,
  type SignalPayload,
} from "@/lib/realtime/events";

/**
 * A full-mesh WebRTC session.
 *
 * Every participant holds one peer connection to every other participant, and
 * media travels browser-to-browser — it never passes through this
 * application's servers, which see only the SDP and ICE needed to introduce
 * two peers to each other.
 *
 * A mesh is the right shape for a handful of people and the wrong shape for a
 * crowd: each browser uploads its camera once per other participant, so cost
 * grows with the square of the room. `MESH_LIMIT` is where this stops being
 * honest and the UI says so.
 */
export const MESH_LIMIT = 6;

/**
 * Public STUN only.
 *
 * STUN lets two browsers discover their public addresses, which is enough on
 * most home and mobile networks. It is NOT enough behind a symmetric NAT or a
 * strict corporate firewall — those need a TURN relay, which this deployment
 * does not run. Connections that cannot be made surface as FAILED rather than
 * as a silently black tile.
 */
const ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];

/** How a single peer connection is faring. */
export const PeerState = {
  CONNECTING: "CONNECTING",
  CONNECTED: "CONNECTED",
  RECONNECTING: "RECONNECTING",
  FAILED: "FAILED",
} as const;
export type PeerState = (typeof PeerState)[keyof typeof PeerState];

/** Mic and camera switches, as a participant has set them. */
export interface MediaFlags {
  micOn: boolean;
  cameraOn: boolean;
}

export interface RemotePeer extends PeerDescriptor, MediaFlags {
  stream: MediaStream | null;
  state: PeerState;
}

/**
 * Until a peer says otherwise it is shown as on — what an older client that
 * never reports its state would be showing anyway.
 */
const UNKNOWN_MEDIA: MediaFlags = { micOn: true, cameraOn: true };

interface Connection {
  pc: RTCPeerConnection;
  descriptor: PeerDescriptor;
  /** Candidates that arrived before the remote description was set. */
  pendingCandidates: RTCIceCandidateInit[];
  /** The polite peer yields when both sides offer at once. */
  isPolite: boolean;
  makingOffer: boolean;
}

export interface MeshState {
  peers: RemotePeer[];
  /** Set when the room is larger than a mesh can carry well. */
  overCapacity: boolean;
}

type UseWebRtcMeshOptions = {
  callId: string | null;
  /** The local camera/mic. Tracks are published as soon as it exists. */
  localStream: MediaStream | null;
  /** Our own mic/camera switches, announced to every peer as they change. */
  localMedia: MediaFlags;
  /** Peers the server reported when this socket joined the room. */
  initialPeers: PeerDescriptor[] | null;
  enabled: boolean;
};

export function useWebRtcMesh(options: UseWebRtcMeshOptions): MeshState {
  const { callId, localStream, localMedia, initialPeers, enabled } = options;
  const { micOn, cameraOn } = localMedia;

  const [peers, setPeers] = useState<RemotePeer[]>([]);

  const connections = useRef(new Map<string, Connection>());
  const remoteStreams = useRef(new Map<string, MediaStream>());
  const remoteMedia = useRef(new Map<string, MediaFlags>());
  /** Peers seen leaving, so a join reply read late cannot bring them back. */
  const departed = useRef(new Set<string>());
  const localStreamRef = useRef<MediaStream | null>(null);
  localStreamRef.current = localStream;
  const localMediaRef = useRef<MediaFlags>({ micOn, cameraOn });
  localMediaRef.current = { micOn, cameraOn };

  // --- state plumbing ------------------------------------------------------

  const publish = useCallback(() => {
    setPeers(
      [...connections.current.values()].map(connection => ({
        ...connection.descriptor,
        ...UNKNOWN_MEDIA,
        ...remoteMedia.current.get(connection.descriptor.peerId),
        stream: remoteStreams.current.get(connection.descriptor.peerId) ?? null,
        state: toPeerState(connection.pc),
      })),
    );
  }, []);

  const send = useCallback(
    (to: string, data: SignalData) => {
      if (!callId) return;
      emitSignal(SignalEvent.SIGNAL, { callId, to, data });
    },
    [callId],
  );

  const announceMedia = useCallback(
    (to: string) => send(to, { kind: "media", ...localMediaRef.current }),
    [send],
  );

  // --- connection lifecycle ------------------------------------------------

  /**
   * Puts our current tracks on every negotiated sender.
   *
   * Each connection carries one audio and one video transceiver, both
   * negotiated send-and-receive from the start, even with nothing to send yet.
   * A camera that is granted late is then just `replaceTrack` — no second
   * round of negotiation, which is what used to leave a late joiner unseen.
   */
  const attachLocalTracks = useCallback(async (pc: RTCPeerConnection) => {
    const stream = localStreamRef.current;
    for (const transceiver of pc.getTransceivers()) {
      if (transceiver.currentDirection === "stopped") continue;
      const kind = transceiver.receiver.track.kind;
      const track =
        stream?.getTracks().find(candidate => candidate.kind === kind) ?? null;
      if (transceiver.sender.track === track) continue;
      await transceiver.sender.replaceTrack(track).catch(() => undefined);
    }
  }, []);

  const makeOffer = useCallback(
    async (connection: Connection) => {
      const { pc } = connection;
      try {
        connection.makingOffer = true;
        await pc.setLocalDescription();
        if (pc.localDescription?.type === "offer") {
          send(connection.descriptor.peerId, {
            kind: "offer",
            sdp: pc.localDescription.toJSON(),
          });
        }
      } catch {
        // The peer can still reach us; nothing is left half-applied.
      } finally {
        connection.makingOffer = false;
      }
    },
    [send],
  );

  const createConnection = useCallback(
    (descriptor: PeerDescriptor, isPolite: boolean): Connection => {
      const existing = connections.current.get(descriptor.peerId);
      if (existing) {
        // We answered this peer before learning who it was; now we know.
        if (!existing.descriptor.userId && descriptor.userId) {
          existing.descriptor = descriptor;
          publish();
        }
        return existing;
      }

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      const connection: Connection = {
        pc,
        descriptor,
        pendingCandidates: [],
        isPolite,
        makingOffer: false,
      };
      connections.current.set(descriptor.peerId, connection);

      // The offering side lays out the media lines; the answering side takes
      // the ones it is offered and attaches to those instead.
      if (!isPolite) {
        const stream = localStreamRef.current;
        for (const kind of ["audio", "video"] as const) {
          const track =
            stream?.getTracks().find(candidate => candidate.kind === kind) ??
            null;
          pc.addTransceiver(track ?? kind, { direction: "sendrecv" });
        }
      }

      // Any change that needs a fresh offer — the first one, or an ICE
      // restart — goes through here, on either side.
      pc.onnegotiationneeded = () => {
        void makeOffer(connection);
      };

      pc.ontrack = event => {
        // Built from the tracks, not the sender's stream: a transceiver that
        // started with nothing to send arrives with no stream at all. A new
        // object each time, so the tile re-attaches it.
        const previous = remoteStreams.current.get(descriptor.peerId);
        const others =
          previous
            ?.getTracks()
            .filter(track => track.kind !== event.track.kind) ?? [];
        remoteStreams.current.set(
          descriptor.peerId,
          new MediaStream([...others, event.track]),
        );
        publish();
      };

      pc.onicecandidate = event => {
        if (event.candidate) {
          send(descriptor.peerId, {
            kind: "ice",
            candidate: event.candidate.toJSON(),
          });
        }
      };

      pc.onconnectionstatechange = () => {
        // One fresh gathering pass before a failure is treated as final.
        if (pc.connectionState === "failed") pc.restartIce();
        // Said again once connected, in case the first word arrived before
        // the other side knew who we were.
        if (pc.connectionState === "connected")
          announceMedia(descriptor.peerId);
        publish();
      };

      announceMedia(descriptor.peerId);
      publish();
      return connection;
    },
    [publish, send, announceMedia, makeOffer],
  );

  const closeConnection = useCallback(
    (peerId: string) => {
      const connection = connections.current.get(peerId);
      if (!connection) return;

      connection.pc.ontrack = null;
      connection.pc.onicecandidate = null;
      connection.pc.onconnectionstatechange = null;
      connection.pc.onnegotiationneeded = null;
      connection.pc.close();

      connections.current.delete(peerId);
      remoteStreams.current.delete(peerId);
      remoteMedia.current.delete(peerId);
      publish();
    },
    [publish],
  );

  // --- signalling ----------------------------------------------------------

  /*
   * Listening starts as soon as there is a call, not once the room join has
   * rendered. The peers already here offer the instant the server announces
   * us, and that offer can land before React has caught up with the join —
   * dropped, it left both tiles "connecting" for good. The server only relays
   * to a socket it has admitted, so nothing arrives here early by mistake.
   */
  useEffect(() => {
    if (!callId) return;

    async function drainCandidates(connection: Connection): Promise<void> {
      const queued = connection.pendingCandidates.splice(0);
      for (const candidate of queued) {
        await connection.pc.addIceCandidate(candidate).catch(() => undefined);
      }
    }

    async function handleSignal(payload: SignalPayload): Promise<void> {
      const { from, data } = payload;

      // A straggler from someone already gone would otherwise reopen a tile.
      if (departed.current.has(from)) return;

      // State, not negotiation: it must never open a connection on its own,
      // or an early word from a newcomer would mint a nameless peer.
      if (data.kind === "media") {
        remoteMedia.current.set(from, {
          micOn: data.micOn !== false,
          cameraOn: data.cameraOn !== false,
        });
        publish();
        return;
      }

      // A signal from someone we have not met means we are the newcomer, so
      // we take the polite role and answer rather than counter-offer. Who
      // they are is filled in when the join's peer list catches up.
      const connection =
        connections.current.get(from) ??
        createConnection(
          { peerId: from, userId: "", name: "", isOrganizer: false },
          true,
        );

      const { pc } = connection;

      try {
        if (data.kind === "ice") {
          if (pc.remoteDescription) await pc.addIceCandidate(data.candidate);
          else connection.pendingCandidates.push(data.candidate);
          return;
        }

        if (data.kind === "answer") {
          await pc.setRemoteDescription(data.sdp);
          await drainCandidates(connection);
          publish();
          return;
        }

        // An offer arriving while we are mid-offer is glare. The polite peer
        // accepts it; the impolite one ignores it and its own offer stands.
        const collision =
          connection.makingOffer || pc.signalingState !== "stable";
        if (collision && !connection.isPolite) return;

        await pc.setRemoteDescription(data.sdp);
        await drainCandidates(connection);

        // Send on every line we were offered, camera or not yet, so a device
        // granted later needs no renegotiation.
        for (const transceiver of pc.getTransceivers()) {
          if (transceiver.currentDirection !== "stopped")
            transceiver.direction = "sendrecv";
        }
        await attachLocalTracks(pc);

        await pc.setLocalDescription();
        if (pc.localDescription) {
          send(from, { kind: "answer", sdp: pc.localDescription.toJSON() });
        }
        publish();
      } catch {
        publish();
      }
    }

    const offSignal = onSocketEvent<SignalPayload>(
      SignalEvent.SIGNAL,
      payload => {
        if (payload.callId !== callId) return;
        void handleSignal(payload);
      },
    );

    const offJoined = onSocketEvent<PeerJoinedPayload>(
      SignalEvent.PEER_JOINED,
      payload => {
        if (payload.callId !== callId) return;
        departed.current.delete(payload.peerId);

        // The ESTABLISHED peer offers to the newcomer — its transceivers make
        // the connection ask for negotiation. One side offering is what keeps
        // two browsers from talking over each other.
        createConnection(payload, false);
      },
    );

    const offLeft = onSocketEvent<PeerLeftPayload>(
      SignalEvent.PEER_LEFT,
      payload => {
        if (payload.callId !== callId) return;
        departed.current.add(payload.peerId);
        remoteMedia.current.delete(payload.peerId);
        closeConnection(payload.peerId);
      },
    );

    return () => {
      offSignal();
      offJoined();
      offLeft();
    };
  }, [callId, createConnection, closeConnection, attachLocalTracks, send, publish]);

  // --- peers already present when we joined --------------------------------

  useEffect(() => {
    if (!enabled || !initialPeers) return;
    // We are the newcomer: wait to be offered to, taking the polite role.
    for (const peer of initialPeers) {
      if (!departed.current.has(peer.peerId)) createConnection(peer, true);
    }
  }, [enabled, initialPeers, createConnection]);

  // --- publish local tracks once the camera is granted ---------------------

  useEffect(() => {
    for (const connection of connections.current.values())
      void attachLocalTracks(connection.pc);
  }, [localStream, attachLocalTracks]);

  // --- tell every peer when our mic or camera changes ---------------------

  useEffect(() => {
    for (const peerId of connections.current.keys()) announceMedia(peerId);
  }, [micOn, cameraOn, announceMedia]);

  // --- teardown ------------------------------------------------------------

  useEffect(() => {
    if (enabled) return;
    for (const peerId of [...connections.current.keys()])
      closeConnection(peerId);
  }, [enabled, closeConnection]);

  useEffect(() => {
    const open = connections.current;
    const streams = remoteStreams.current;
    const media = remoteMedia.current;
    return () => {
      for (const connection of open.values()) connection.pc.close();
      open.clear();
      streams.clear();
      media.clear();
    };
  }, []);

  return { peers, overCapacity: peers.length + 1 > MESH_LIMIT };
}

function toPeerState(pc: RTCPeerConnection): PeerState {
  switch (pc.connectionState) {
    case "connected":
      return "CONNECTED";
    case "failed":
      return "FAILED";
    case "disconnected":
      return "RECONNECTING";
    default:
      return "CONNECTING";
  }
}
