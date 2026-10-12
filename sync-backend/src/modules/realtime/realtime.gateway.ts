import { createAdapter } from '@socket.io/redis-adapter';
import { type Server as HttpServer } from 'node:http';
import { Server as SocketIOServer, type Socket } from 'socket.io';
import { REALTIME } from '../../config/constants.js';
import { allowedOrigins } from '../../config/env.js';
import { logger } from '../../infrastructure/logger/logger.js';
import { getSubscriber, redis } from '../../infrastructure/redis/redis.js';
import { systemClock } from '../../shared/time/clock.js';
import { authorizeRealtimeCallRoom } from '../access/index.js';
import { resolveSession } from '../auth/current-user.js';
import { captionLineRepository } from '../transcripts/caption-line.repository.js';
import { type AuthenticatedUser } from '../auth/auth.types.js';
import {
  rooms,
  SignalEvent,
  type CaptionUtterancePayload,
  type PeerDescriptor,
  type RealtimePayload,
  type SignalPayload,
} from './realtime.events.js';

interface SocketData {
  user: AuthenticatedUser;
  /** Calls this socket has been admitted to, for cheap sender checks. */
  calls: Set<string>;
}

let io: SocketIOServer | null = null;

/**
 * Socket.IO gateway.
 *
 * Two rules govern everything here:
 *
 *  1. A connection carries NO ambient authority. Authentication identifies the
 *     socket's user; joining a call room is a separate, database-backed
 *     authorization check.
 *  2. Realtime is never the source of truth. Events delivered here are hints
 *     that prompt a client to act; the action itself is re-authorized over
 *     HTTP. If this entire subsystem is down, security is unchanged.
 */
export function createRealtimeGateway(httpServer: HttpServer): SocketIOServer {
  const server = new SocketIOServer(httpServer, {
    path: REALTIME.socketPath,
    cors: { origin: allowedOrigins, credentials: true },
    serveClient: false,
  });

  // Redis adapter so events fan out across every API replica.
  server.adapter(createAdapter(redis.duplicate(), redis.duplicate()));

  server.use(async (socket, next) => {
    const session = await resolveSession(socket.request.headers);
    if (!session) {
      next(new Error('AUTHENTICATION_REQUIRED'));
      return;
    }
    (socket.data as SocketData).user = session.user;
    (socket.data as SocketData).calls = new Set();
    // Personal room: targeted events need no call-level membership.
    await socket.join(rooms.user(session.user.id));
    next();
  });

  server.on('connection', (socket: Socket) => {
    const { user } = socket.data as SocketData;
    logger.debug({ userId: user.id, socketId: socket.id }, 'socket connected');

    socket.on('call:subscribe', async (payload: unknown, ack?: (result: unknown) => void) => {
      const callId =
        typeof payload === 'object' && payload !== null && 'callId' in payload
          ? String((payload as { callId: unknown }).callId)
          : null;

      if (!callId) {
        ack?.({ ok: false, code: 'VALIDATION_ERROR' });
        return;
      }

      // Server-side membership validation — the client's claim is irrelevant.
      const decision = await authorizeRealtimeCallRoom({
        userId: user.id,
        callId,
        now: systemClock.now(),
      });

      if (!decision.allowed) {
        logger.warn({ userId: user.id, callId, code: decision.code }, 'realtime subscribe denied');
        ack?.({ ok: false, code: decision.code });
        return;
      }

      await socket.join(rooms.call(callId));
      (socket.data as SocketData).calls.add(callId);

      // Existing members, so the newcomer knows who to offer to. The
      // convention is that the ESTABLISHED peer sends the offer, which is what
      // keeps two browsers from offering each other at once.
      const peers = await listPeers(server, callId, socket.id);

      ack?.({ ok: true, peers, self: describePeer(socket, decision.value.relation === 'ORGANIZER') });

      socket.to(rooms.call(callId)).emit(SignalEvent.PEER_JOINED, {
        callId,
        ...describePeer(socket, decision.value.relation === 'ORGANIZER'),
      });
    });

    socket.on('call:unsubscribe', async (payload: unknown) => {
      const callId =
        typeof payload === 'object' && payload !== null && 'callId' in payload
          ? String((payload as { callId: unknown }).callId)
          : null;
      if (!callId) return;

      await socket.leave(rooms.call(callId));
      (socket.data as SocketData).calls.delete(callId);
      announceDeparture(server, socket, callId);
    });

    /**
     * Signalling relay.
     *
     * Two checks, both server-side: the sender must already be in the call
     * room, and so must the recipient. `from` is stamped by the server, so a
     * client cannot forge who a signal came from.
     */
    socket.on(SignalEvent.SIGNAL, async (payload: unknown) => {
      const message = payload as { callId?: unknown; to?: unknown; data?: unknown };
      const callId = typeof message?.callId === 'string' ? message.callId : null;
      const to = typeof message?.to === 'string' ? message.to : null;
      if (!callId || !to) return;

      if (!(socket.data as SocketData).calls.has(callId)) {
        logger.warn({ userId: user.id, callId }, 'signal from a socket outside the call room');
        return;
      }

      if (!(await isPeerInCall(server, to, callId))) return;

      const relayed: SignalPayload = { callId, from: socket.id, data: message.data };
      server.to(to).emit(SignalEvent.SIGNAL, relayed);
    });

    /**
     * Caption relay.
     *
     * Recognition happens on the speaker's own device; the server forwards the
     * text to the room and stamps the speaker, so a client cannot attribute a
     * line to somebody else.
     */
    socket.on(SignalEvent.CAPTION, (payload: unknown) => {
      const message = payload as { callId?: unknown; text?: unknown; isFinal?: unknown };
      const callId = typeof message?.callId === 'string' ? message.callId : null;
      const text = typeof message?.text === 'string' ? message.text.slice(0, 500) : null;
      if (!callId || !text) return;

      if (!(socket.data as SocketData).calls.has(callId)) return;

      const spokenAt = new Date();
      const isFinal = message.isFinal === true;

      const utterance: CaptionUtterancePayload = {
        callId,
        userId: user.id,
        name: user.name,
        text,
        isFinal,
        at: spokenAt.toISOString(),
      };

      socket.to(rooms.call(callId)).emit(SignalEvent.CAPTION, utterance);

      // Settled lines become the meeting's transcript. Interim guesses are
      // replaced as someone speaks, so writing them down would record every
      // half-finished thought. Storage is best-effort: a lost line costs a gap
      // in the write-up, never the live captions people are reading.
      if (!isFinal) return;

      void captionLineRepository
        .append({
          callId,
          speakerId: user.id,
          speakerName: user.name,
          text,
          spokenAt,
        })
        .catch((error) => logger.error({ err: error, callId }, 'failed to store caption line'));
    });

    socket.on('disconnecting', () => {
      // `socket.rooms` is still populated here; after 'disconnect' it is not.
      for (const callId of (socket.data as SocketData).calls) {
        announceDeparture(server, socket, callId);
      }
    });
  });

  subscribeToRedis(server);

  io = server;
  return server;
}

/** A socket, as its peers see it. Identity comes from the session, not the client. */
function describePeer(socket: Socket, isOrganizer: boolean): PeerDescriptor {
  const { user } = socket.data as SocketData;
  return { peerId: socket.id, userId: user.id, name: user.name, isOrganizer };
}

/**
 * Everyone already in the room, excluding the caller.
 *
 * Goes through the adapter, so it sees sockets held by other API replicas too.
 */
async function listPeers(
  server: SocketIOServer,
  callId: string,
  exceptSocketId: string,
): Promise<PeerDescriptor[]> {
  const sockets = await server.in(rooms.call(callId)).fetchSockets();

  return sockets
    .filter((remote) => remote.id !== exceptSocketId)
    .map((remote) => {
      const data = remote.data as SocketData;
      return {
        peerId: remote.id,
        userId: data.user.id,
        name: data.user.name,
        // Recomputed by each client from the roster; not authoritative here.
        isOrganizer: false,
      };
    });
}

/** Confirms a relay target is genuinely a member of that call's room. */
async function isPeerInCall(
  server: SocketIOServer,
  peerId: string,
  callId: string,
): Promise<boolean> {
  const [target] = await server.in(peerId).fetchSockets();
  return Boolean(target?.rooms.has(rooms.call(callId)));
}

function announceDeparture(server: SocketIOServer, socket: Socket, callId: string): void {
  const { user } = socket.data as SocketData;
  server
    .to(rooms.call(callId))
    .emit(SignalEvent.PEER_LEFT, { callId, peerId: socket.id, userId: user.id });
}

/** Bridges Redis Pub/Sub into the room fan-out. */
function subscribeToRedis(server: SocketIOServer): void {
  const subscriber = getSubscriber();

  void subscriber.subscribe(REALTIME.revocationChannel).catch((error) => {
    logger.error({ err: error }, 'failed to subscribe to realtime channel');
  });

  subscriber.on('message', (channel, raw) => {
    if (channel !== REALTIME.revocationChannel) return;

    let payload: RealtimePayload;
    try {
      payload = JSON.parse(raw) as RealtimePayload;
    } catch {
      logger.warn('discarded malformed realtime payload');
      return;
    }

    dispatch(server, payload);
  });
}

/**
 * Targets the narrowest room that makes sense for each event. Nothing
 * participant-specific is ever broadcast to the whole call.
 */
function dispatch(server: SocketIOServer, payload: RealtimePayload): void {
  switch (payload.type) {
    case 'INVITATION_REVOKED':
    case 'FORCED_DISCONNECT': {
      // Only the affected participant is told, and they are removed from the
      // call room so subsequent call-wide events no longer reach them.
      server.to(rooms.user(payload.participantId)).emit(payload.type, payload);
      evictFromCall(server, payload.participantId, payload.callId);
      break;
    }
    case 'CALL_ENDED':
    case 'CAPTION_STATUS_CHANGED':
    case 'PARTICIPANT_JOINED':
    case 'PARTICIPANT_LEFT': {
      // Room-wide, and the room is only joinable after a database-backed check.
      server.to(rooms.call(payload.callId)).emit(payload.type, payload);
      break;
    }
  }
}

/**
 * Takes a participant's sockets out of a call without their cooperation.
 *
 * Leaving the room is not enough on its own: the socket's admitted-calls set
 * is what the signal and caption relays check, and the peers still in the room
 * hold a media connection to it until they hear it has gone. Every replica
 * receives the Pub/Sub message, so each one handles only the sockets it holds.
 */
function evictFromCall(server: SocketIOServer, participantId: string, callId: string): void {
  const socketIds = server.sockets.adapter.rooms.get(rooms.user(participantId));
  if (!socketIds) return;

  for (const socketId of socketIds) {
    const socket = server.sockets.sockets.get(socketId);
    if (!socket || !(socket.data as SocketData).calls.delete(callId)) continue;

    void socket.leave(rooms.call(callId));
    announceDeparture(server, socket, callId);
  }
}

export function getRealtimeServer(): SocketIOServer | null {
  return io;
}

export async function closeRealtimeGateway(): Promise<void> {
  if (!io) return;
  await new Promise<void>((resolve) => io?.close(() => resolve()));
  io = null;
}
