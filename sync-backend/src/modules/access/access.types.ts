import { type ErrorCode } from '../../shared/errors/index.js';
import { type CallStatus, type InvitationStatus } from '../../generated/prisma/enums.js';

/** Minimal projections the policies reason over — never whole Prisma rows. */
export interface CallView {
  id: string;
  organizerId: string;
  title: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  timezone: string;
  status: CallStatus;
  providerCallId: string | null;
}

export interface InvitationView {
  id: string;
  callId: string;
  participantId: string;
  status: InvitationStatus;
  issuedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

export type DenialCode = Extract<
  ErrorCode,
  | 'AUTHENTICATION_REQUIRED'
  | 'FORBIDDEN'
  | 'INVITE_NOT_FOUND'
  | 'INVITE_REVOKED'
  | 'INVITE_EXPIRED'
  | 'PARTICIPANT_MISMATCH'
  | 'CALL_NOT_FOUND'
  | 'CALL_CANCELLED'
  | 'CALL_NOT_JOINABLE'
  | 'JOIN_WINDOW_NOT_OPEN'
  | 'JOIN_WINDOW_CLOSED'
  | 'TRANSCRIPT_ACCESS_DENIED'
  | 'RESOURCE_NOT_FOUND'
>;

export interface Allowed<T> {
  allowed: true;
  value: T;
}

export interface Denied {
  allowed: false;
  code: DenialCode;
  /** Server-side explanation. Logged and audited; never returned verbatim. */
  reason: string;
  /**
   * The call and invitation the denial relates to, when the engine got far
   * enough to identify them. Used only to attribute the audit row — it is
   * never surfaced to the denied caller.
   */
  callId?: string;
  invitationId?: string;
}

export type Decision<T> = Allowed<T> | Denied;

export const allow = <T>(value: T): Allowed<T> => ({ allowed: true, value });

export const deny = (
  code: DenialCode,
  reason: string,
  context: { callId?: string; invitationId?: string } = {},
): Denied => ({
  allowed: false,
  code,
  reason,
  ...context,
});

/** The subject of a successful join authorization. */
export interface JoinGrant {
  invitation: InvitationView;
  call: CallView;
  participantId: string;
}

/**
 * The subject of a successful call entry, by either route.
 *
 * Two things can authorize entry, and only these two: owning the call, or
 * holding a live invitation to it. The route the caller used — a join link or
 * their signed-in identity — changes nothing about the decision.
 */
export interface CallEntryGrant {
  call: CallView;
  /** The user entering. For the organizer this is their own id. */
  participantId: string;
  relation: CallRelation;
  /** Present when entry rests on an invitation; null for the organizer. */
  invitation: InvitationView | null;
}

/** Relationship a user has to a call, derived server-side only. */
export const CallRelation = {
  ORGANIZER: 'ORGANIZER',
  PARTICIPANT: 'PARTICIPANT',
  NONE: 'NONE',
} as const;

export type CallRelation = (typeof CallRelation)[keyof typeof CallRelation];
