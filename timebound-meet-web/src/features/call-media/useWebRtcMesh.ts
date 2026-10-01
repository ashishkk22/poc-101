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

export interface RemotePeer extends PeerDescriptor {
  stream: MediaStream | null;
  state: PeerState;
}

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
  /** Peers the server reported when this socket joined the room. */
  initialPeers: PeerDescriptor[] | null;
  enabled: boolean;
};

export function useWebRtcMesh(options: UseWebRtcMeshOptions): MeshState {
  const { callId, localStream, initialPeers, enabled } = options;

  const [peers, setPeers] = useState<RemotePeer[]>([]);

  const connections = useRef(new Map<string, Connection>());
  const remoteStreams = useRef(new Map<string, MediaStream>());
  const localStreamRef = useRef<MediaStream | null>(null);
  localStreamRef.current = localStream;

  // --- state plumbing ------------------------------------------------------

  const publish = useCallback(() => {
    setPeers(
      [...connections.current.values()].map(connection => ({
        ...connection.descriptor,
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

  // --- connection lifecycle ------------------------------------------------

  const createConnection = useCallback(
    (descriptor: PeerDescriptor, isPolite: boolean): Connection => {
      const existing = connections.current.get(descriptor.peerId);
      if (existing) return existing;

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      const connection: Connection = {
        pc,
        descriptor,
        pendingCandidates: [],
        isPolite,
        makingOffer: false,
      };
      connections.current.set(descriptor.peerId, connection);

      // Our own tracks go out on this connection.
      const stream = localStreamRef.current;
      if (stream) {
        for (const track of stream.getTracks()) pc.addTrack(track, stream);
      }

      pc.ontrack = event => {
        const [incoming] = event.streams;
        if (incoming) remoteStreams.current.set(descriptor.peerId, incoming);
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
        publish();
      };

      publish();
      return connection;
    },
    [publish, send],
  );

  const closeConnection = useCallback(
    (peerId: string) => {
      const connection = connections.current.get(peerId);
      if (!connection) return;

      connection.pc.ontrack = null;
      connection.pc.onicecandidate = null;
      connection.pc.onconnectionstatechange = null;
      connection.pc.close();

      connections.current.delete(peerId);
      remoteStreams.current.delete(peerId);
      publish();
    },
    [publish],
  );

  // --- signalling ----------------------------------------------------------

  useEffect(() => {
    if (!enabled || !callId) return;

    async function drainCandidates(connection: Connection): Promise<void> {
      const queued = connection.pendingCandidates.splice(0);
      for (const candidate of queued) {
        await connection.pc.addIceCandidate(candidate).catch(() => undefined);
      }
    }

    async function makeOffer(connection: Connection): Promise<void> {
      try {
        connection.makingOffer = true;
        const offer = await connection.pc.createOffer();
        await connection.pc.setLocalDescription(offer);
        send(connection.descriptor.peerId, { kind: "offer", sdp: offer });
      } catch {
        // The peer can still reach us; nothing is left half-applied.
      } finally {
        connection.makingOffer = false;
      }
    }

    async function handleSignal(payload: SignalPayload): Promise<void> {
      const { from, data } = payload;

      // A signal from someone we have not met means we are the newcomer, so
      // we take the polite role and answer rather than counter-offer.
      const connection =
        connections.current.get(from) ??
        createConnection(
          { peerId: from, userId: "", name: "Participant", isOrganizer: false },
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

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        send(from, { kind: "answer", sdp: answer });
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

        // The ESTABLISHED peer offers to the newcomer. One side offering is what
        // keeps two browsers from talking over each other.
        const connection = createConnection(payload, false);
        void makeOffer(connection);
      },
    );

    const offLeft = onSocketEvent<PeerLeftPayload>(
      SignalEvent.PEER_LEFT,
      payload => {
        if (payload.callId !== callId) return;
        closeConnection(payload.peerId);
      },
    );

    return () => {
      offSignal();
      offJoined();
      offLeft();
    };
  }, [enabled, callId, createConnection, closeConnection, send, publish]);

  // --- peers already present when we joined --------------------------------

  useEffect(() => {
    if (!enabled || !initialPeers) return;
    // We are the newcomer: wait to be offered to, taking the polite role.
    for (const peer of initialPeers) createConnection(peer, true);
  }, [enabled, initialPeers, createConnection]);

  // --- publish local tracks once the camera is granted ---------------------

  useEffect(() => {
    if (!localStream) return;

    for (const connection of connections.current.values()) {
      const senders = connection.pc.getSenders();
      for (const track of localStream.getTracks()) {
        const existing = senders.find(
          sender => sender.track?.kind === track.kind,
        );
        if (existing) void existing.replaceTrack(track);
        else connection.pc.addTrack(track, localStream);
      }
    }
  }, [localStream]);

  // --- teardown ------------------------------------------------------------

  useEffect(() => {
    if (enabled) return;
    for (const peerId of [...connections.current.keys()])
      closeConnection(peerId);
  }, [enabled, closeConnection]);

  useEffect(() => {
    const open = connections.current;
    const streams = remoteStreams.current;
    return () => {
      for (const connection of open.values()) connection.pc.close();
      open.clear();
      streams.clear();
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
