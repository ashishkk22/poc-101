import { io, type Socket } from 'socket.io-client';
import { config } from '../config/env';
import type { SubscribeResult } from './events';

/**
 * A single shared Socket.IO connection.
 *
 * The connection carries no ambient authority: it authenticates with the same
 * session cookie as the HTTP API, and joining a call room is a separate
 * server-side decision made per subscribe.
 */
let socket: Socket | null = null;

export function getSocket(): Socket {
  if (socket) return socket;

  socket = io(config.apiBaseUrl, {
    path: config.realtimePath,
    withCredentials: true,
    transports: ['websocket', 'polling'],
    autoConnect: false,
    reconnectionAttempts: Number.POSITIVE_INFINITY,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
  });

  return socket;
}

export function connectSocket(): Socket {
  const active = getSocket();
  if (!active.connected) active.connect();
  return active;
}

export function disconnectSocket(): void {
  if (!socket) return;
  socket.removeAllListeners();
  socket.disconnect();
  socket = null;
}

/**
 * Asks the server to join a call room; it may refuse, and refusal is final.
 *
 * On success the ack carries the peers already in the room, which is what the
 * mesh uses to decide who to offer to.
 */
export function subscribeToCall(callId: string): Promise<SubscribeResult> {
  return new Promise((resolve) => {
    const active = getSocket();
    if (!active.connected) {
      resolve({ ok: false, code: 'NOT_CONNECTED' });
      return;
    }

    const timeout = setTimeout(() => resolve({ ok: false, code: 'TIMEOUT' }), 5000);
    active.emit('call:subscribe', { callId }, (ack: SubscribeResult) => {
      clearTimeout(timeout);
      resolve(ack ?? { ok: false, code: 'NO_ACK' });
    });
  });
}

/** Fire-and-forget emit used by signalling and captions. */
export function emitSignal(event: string, payload: unknown): void {
  const active = socket;
  if (!active?.connected) return;
  active.emit(event, payload);
}

/** Subscribes to a raw socket event, returning an unsubscribe function. */
export function onSocketEvent<T>(event: string, handler: (payload: T) => void): () => void {
  const active = getSocket();
  active.on(event, handler as (...args: unknown[]) => void);
  return () => active.off(event, handler as (...args: unknown[]) => void);
}

export function unsubscribeFromCall(callId: string): void {
  const active = socket;
  if (!active?.connected) return;
  active.emit('call:unsubscribe', { callId });
}
