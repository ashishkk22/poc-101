/**
 * The Socket.IO event contract, mirrored from the backend.
 *
 * Realtime is a notification channel, never an authorization channel: every
 * action these events prompt is re-authorized over HTTP. If the socket never
 * connects, security is unchanged — only responsiveness suffers.
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

/** Roster changes: a display name and an arrival time, nothing more. */
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

export interface RealtimeEventMap {
  INVITATION_REVOKED: InvitationRevokedPayload;
  CALL_ENDED: CallEndedPayload;
  FORCED_DISCONNECT: ForcedDisconnectPayload;
  CAPTION_STATUS_CHANGED: CaptionStatusChangedPayload;
  PARTICIPANT_JOINED: ParticipantJoinedPayload;
  PARTICIPANT_LEFT: ParticipantLeftPayload;
}

/** Server-side ack for `call:subscribe`. Membership is decided by the server. */
export interface SubscribeAck {
  ok: boolean;
  code?: string;
}

/**
 * WebRTC signalling.
 *
 * The server relays these between two sockets it has already confirmed are in
 * the same call room, and stamps `from` itself — a client cannot forge who a
 * signal came from. The `data` blob is opaque to the server: SDP and ICE are
 * strictly the browsers' business, and no media ever passes through it.
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

export type SignalData =
  | { kind: 'offer'; sdp: RTCSessionDescriptionInit }
  | { kind: 'answer'; sdp: RTCSessionDescriptionInit }
  | { kind: 'ice'; candidate: RTCIceCandidateInit };

export interface SignalPayload {
  callId: string;
  from: string;
  data: SignalData;
}

/** A caption line, recognised on the speaker's own device. */
export interface CaptionUtterancePayload {
  callId: string;
  userId: string;
  name: string;
  text: string;
  isFinal: boolean;
  at: string;
}

/** What `call:subscribe` answers with once the server admits the socket. */
export interface SubscribeResult {
  ok: boolean;
  code?: string;
  peers?: PeerDescriptor[];
  self?: PeerDescriptor;
}
