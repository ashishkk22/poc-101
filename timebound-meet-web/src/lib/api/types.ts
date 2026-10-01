/**
 * Frontend mirrors of the backend DTOs.
 *
 * These are hand-maintained against the API contract — not generated from
 * Prisma, and never importing backend internals. If the backend publishes an
 * OpenAPI document later, this file is the one to replace.
 */

/**
 * Enumerations mirroring the backend.
 *
 * Written as frozen objects rather than TypeScript `enum`s for one practical
 * reason: these values arrive from the API as plain JSON strings. A TS `enum`
 * member is nominally typed, so every value crossing the wire would need a
 * cast. This pattern keeps the type a string union — `CallStatus.LIVE` is
 * literally `"LIVE"` — while giving call sites a named constant to compare
 * against instead of a loose literal. It is also the shape the backend uses.
 */
export const CallStatus = {
  DRAFT: "DRAFT",
  SCHEDULED: "SCHEDULED",
  LIVE: "LIVE",
  ENDED: "ENDED",
  CANCELLED: "CANCELLED",
} as const;
export type CallStatus = (typeof CallStatus)[keyof typeof CallStatus];

export const InvitationStatus = {
  ACTIVE: "ACTIVE",
  REVOKED: "REVOKED",
  EXPIRED: "EXPIRED",
} as const;
export type InvitationStatus =
  (typeof InvitationStatus)[keyof typeof InvitationStatus];

export const AttendanceStatus = {
  NOT_JOINED: "NOT_JOINED",
  ACTIVE: "ACTIVE",
  COMPLETED: "COMPLETED",
} as const;
export type AttendanceStatus =
  (typeof AttendanceStatus)[keyof typeof AttendanceStatus];

export const AttendanceSessionStatus = {
  CONNECTED: "CONNECTED",
  LEFT: "LEFT",
  REVOKED: "REVOKED",
  WINDOW_CLOSED: "WINDOW_CLOSED",
  CALL_ENDED: "CALL_ENDED",
  DISCONNECTED: "DISCONNECTED",
} as const;
export type AttendanceSessionStatus =
  (typeof AttendanceSessionStatus)[keyof typeof AttendanceSessionStatus];

export const TranscriptStatus = {
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
  READY: "READY",
  FAILED: "FAILED",
  DELETED: "DELETED",
} as const;
export type TranscriptStatus =
  (typeof TranscriptStatus)[keyof typeof TranscriptStatus];

/** Why a call stopped. Shared by the API, the realtime payloads and the UI. */
export const CallEndReason = {
  ENDED: "ENDED",
  CANCELLED: "CANCELLED",
} as const;
export type CallEndReason = (typeof CallEndReason)[keyof typeof CallEndReason];

/** Health of the provider's caption stream. */
export const CaptionStatus = {
  AVAILABLE: "AVAILABLE",
  DEGRADED: "DEGRADED",
} as const;
export type CaptionStatus = (typeof CaptionStatus)[keyof typeof CaptionStatus];

/** The only status a successful heartbeat reports. */
export const HeartbeatStatus = { ACTIVE: "ACTIVE" } as const;
export type HeartbeatStatus =
  (typeof HeartbeatStatus)[keyof typeof HeartbeatStatus];

export const AuditOutcome = {
  SUCCESS: "SUCCESS",
  DENIED: "DENIED",
  FAILURE: "FAILURE",
} as const;
export type AuditOutcome = (typeof AuditOutcome)[keyof typeof AuditOutcome];

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface Call {
  id: string;
  title: string;
  scheduledStart: string;
  scheduledEnd: string;
  timezone: string;
  status: CallStatus;
  organizerId: string;
  createdAt: string;
}

/** The reduced view a participant receives from the join endpoint. */
export interface JoinCall {
  id: string;
  title: string;
  scheduledStart: string;
  scheduledEnd: string;
  timezone: string;
  status: CallStatus;
}

export interface Invitation {
  id: string;
  callId: string;
  participantId: string;
  participant?: User;
  status: InvitationStatus;
  issuedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
}

/** Returned exactly once, at creation — the raw link exists nowhere else. */
export interface CreatedInvitation extends Invitation {
  joinUrl: string;
}

export interface RevokedInvitation {
  invitationId: string;
  status: InvitationStatus;
  revokedAt: string;
}

export interface AttendanceSession {
  id: string;
  deviceId: string;
  joinedAt: string;
  leftAt: string | null;
  leftReason: string | null;
  status: AttendanceSessionStatus;
}

export interface Attendance {
  id: string;
  callId: string;
  participantId: string;
  participant?: User;
  firstJoinedAt: string | null;
  lastLeftAt: string | null;
  totalConnectedSeconds: number;
  status: AttendanceStatus;
  sessions?: AttendanceSession[];
}

export interface Transcript {
  callId: string;
  status: TranscriptStatus;
  content?: string;
  generatedAt: string | null;
  expiresAt: string | null;
}

export interface AuditEvent {
  id: string;
  action: string;
  outcome: AuditOutcome;
  actorUserId: string | null;
  invitationId: string | null;
  requestId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

/** Opaque provider descriptor. The frontend consumes it, never interprets it. */
export interface ProviderSession {
  id: string;
  expiresAt: string;
}

export const CallRole = {
  ORGANIZER: "ORGANIZER",
  PARTICIPANT: "PARTICIPANT",
  NONE: "NONE",
} as const;
export type CallRole = (typeof CallRole)[keyof typeof CallRole];

export interface JoinResult {
  call: JoinCall;
  attendanceSession: AttendanceSession;
  providerSession: ProviderSession;
  /** Lets the client label the local participant without a second request. */
  role: CallRole;
}

/** Read-only answer to "what call is this link for?" — no session is created. */
export interface ResolvedLink {
  call: JoinCall;
  invitationId: string;
}

/** Who is in the room, as everyone in the room may see it. */
export interface CallParticipant {
  id: string;
  name: string;
  isOrganizer: boolean;
  joinedAt: string;
  /** Concurrent devices, so two tiles for one person are explicable. */
  connections: number;
}

/** An invitation as its own recipient sees it. */
export interface MyInvitation {
  id: string;
  status: InvitationStatus;
  issuedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
  call: {
    id: string;
    title: string;
    scheduledStart: string;
    scheduledEnd: string;
    timezone: string;
    status: CallStatus;
    organizerName: string;
  };
}

export interface HeartbeatResult {
  status: HeartbeatStatus;
  sessionId: string;
  serverTime: string;
  callEndsAt: string;
}

export interface LeaveResult {
  sessionId: string | null;
  status: string;
  totalConnectedSeconds: number;
  alreadyLeft: boolean;
}

/** Keyset pagination envelope: `{ items, nextCursor }`. */
export interface PaginatedResponse<T> {
  items: T[];
  nextCursor: string | null;
}

export interface PaginationQuery {
  cursor?: string;
  limit?: number;
}

export const CallRoleFilter = {
  ORGANIZER: "organizer",
  PARTICIPANT: "participant",
  ANY: "any",
} as const;
export type CallRoleFilter =
  (typeof CallRoleFilter)[keyof typeof CallRoleFilter];

export interface ListCallsQuery extends PaginationQuery {
  status?: CallStatus;
  startAfter?: string;
  startBefore?: string;
  role?: CallRoleFilter;
}

export interface ListInvitationsQuery extends PaginationQuery {
  status?: InvitationStatus;
}

export const LeaveReason = {
  USER_LEFT: "USER_LEFT",
  TAB_CLOSED: "TAB_CLOSED",
  NETWORK_LOST: "NETWORK_LOST",
} as const;
export type LeaveReason = (typeof LeaveReason)[keyof typeof LeaveReason];
