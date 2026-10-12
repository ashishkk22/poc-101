/**
 * Realtime is a NOTIFICATION channel, never an authorization channel.
 *
 * Every payload here is safe to deliver to an already-authorized room member,
 * and every client action prompted by one of these events is re-authorized
 * server-side when the client acts on it.
 */
export const RealtimeEvent = {
  INVITATION_REVOKED: 'INVITATION_REVOKED',
  CALL_ENDED: 'CALL_ENDED',
  FORCED_DISCONNECT: 'FORCED_DISCONNECT',
  CAPTION_STATUS_CHANGED: 'CAPTION_STATUS_CHANGED',
  PARTICIPANT_JOINED: 'PARTICIPANT_JOINED',
  PARTICIPANT_LEFT: 'PARTICIPANT_LEFT',
} as const;

export type RealtimeEvent = (typeof RealtimeEvent)[keyof typeof RealtimeEvent];

export interface InvitationRevokedPayload {
  type: typeof RealtimeEvent.INVITATION_REVOKED;
  callId: string;
  invitationId: string;
  participantId: string;
  revokedAt: string;
}

export interface CallEndedPayload {
  type: typeof RealtimeEvent.CALL_ENDED;
  callId: string;
  reason: 'ENDED' | 'CANCELLED';
}

export interface ForcedDisconnectPayload {
  type: typeof RealtimeEvent.FORCED_DISCONNECT;
  callId: string;
  participantId: string;
  reason: string;
}

export interface CaptionStatusChangedPayload {
  type: typeof RealtimeEvent.CAPTION_STATUS_CHANGED;
  callId: string;
  status: 'AVAILABLE' | 'DEGRADED';
}

/**
 * Roster changes.
 *
 * Carries only what someone already in the room may see anyway — a display
 * name and when they arrived. No email, no device id, no session internals.
 * Missing one of these costs a stale roster, never stale authorization.
 */
export interface ParticipantJoinedPayload {
  type: typeof RealtimeEvent.PARTICIPANT_JOINED;
  callId: string;
  participantId: string;
  name: string;
  isOrganizer: boolean;
  joinedAt: string;
}

export interface ParticipantLeftPayload {
  type: typeof RealtimeEvent.PARTICIPANT_LEFT;
  callId: string;
  participantId: string;
  name: string;
}

export type RealtimePayload =
  | InvitationRevokedPayload
  | CallEndedPayload
  | ForcedDisconnectPayload
  | CaptionStatusChangedPayload
  | ParticipantJoinedPayload
  | ParticipantLeftPayload;

/**
 * WebRTC signalling.
 *
 * The server is a relay and an authorizer here, never a participant: it never
 * sees decrypted media, and it forwards a blob only between two sockets it has
 * already confirmed belong to the same call room. The payload is opaque on
 * purpose — SDP and ICE are the browsers' business.
 */
export const SignalEvent = {
  PEER_JOINED: 'webrtc:peer-joined',
  PEER_LEFT: 'webrtc:peer-left',
  SIGNAL: 'webrtc:signal',
  CAPTION: 'captions:utterance',
} as const;

export type SignalEvent = (typeof SignalEvent)[keyof typeof SignalEvent];

/** One browser tab. A person on two devices is two peers, deliberately. */
export interface PeerDescriptor {
  peerId: string;
  userId: string;
  name: string;
  isOrganizer: boolean;
}

export interface PeerJoinedPayload extends PeerDescriptor {
  callId: string;
}

export interface PeerLeftPayload {
  callId: string;
  peerId: string;
  userId: string;
}

export interface SignalPayload {
  callId: string;
  /** Sender, filled in by the server — never trusted from the client. */
  from: string;
  /** Opaque to the server: an SDP offer/answer, an ICE candidate or mic/camera state. */
  data: unknown;
}

/**
 * A caption line, recognised on the speaker's own device.
 *
 * Interim results are replaced as they firm up; only `isFinal` lines are kept
 * in the running transcript.
 */
export interface CaptionUtterancePayload {
  callId: string;
  userId: string;
  name: string;
  text: string;
  isFinal: boolean;
  at: string;
}

export const rooms = {
  user: (userId: string) => `user:${userId}`,
  call: (callId: string) => `call:${callId}`,
  /** Sockets sending media in a call: the WebRTC mesh, a subset of `call`. */
  media: (callId: string) => `call:${callId}:media`,
  session: (attendanceSessionId: string) => `session:${attendanceSessionId}`,
} as const;
