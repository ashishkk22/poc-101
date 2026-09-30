/**
 * Frontend mirrors of the backend DTOs.
 *
 * These are hand-maintained against the API contract — not generated from
 * Prisma, and never importing backend internals. If the backend publishes an
 * OpenAPI document later, this file is the one to replace.
 */

export type CallStatus = "DRAFT" | "SCHEDULED" | "LIVE" | "ENDED" | "CANCELLED";
export type InvitationStatus = "ACTIVE" | "REVOKED" | "EXPIRED";
export type AttendanceStatus = "NOT_JOINED" | "ACTIVE" | "COMPLETED";
export type AttendanceSessionStatus =
  | "CONNECTED"
  | "LEFT"
  | "REVOKED"
  | "WINDOW_CLOSED"
  | "CALL_ENDED"
  | "DISCONNECTED";
export type TranscriptStatus =
  | "PENDING"
  | "PROCESSING"
  | "READY"
  | "FAILED"
  | "DELETED";
export type AuditOutcome = "SUCCESS" | "DENIED" | "FAILURE";

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

export type CallRole = "ORGANIZER" | "PARTICIPANT" | "NONE";

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
  status: "ACTIVE";
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

export type CallRoleFilter = "organizer" | "participant" | "any";

export interface ListCallsQuery extends PaginationQuery {
  status?: CallStatus;
  startAfter?: string;
  startBefore?: string;
  role?: CallRoleFilter;
}

export interface ListInvitationsQuery extends PaginationQuery {
  status?: InvitationStatus;
}

export type LeaveReason = "USER_LEFT" | "TAB_CLOSED" | "NETWORK_LOST";
