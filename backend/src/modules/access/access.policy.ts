import { prisma, type DbClient } from '../../infrastructure/database/prisma.js';
import { hashToken, isWellFormedRawToken } from '../../shared/security/tokens.js';
import {
  isAfterCallWindow,
  isBeforeCallWindow,
  isCallWindowOpen,
} from '../../shared/time/window.js';
import {
  allow,
  CallRelation,
  deny,
  type CallEntryGrant,
  type CallView,
  type Decision,
  type InvitationView,
  type JoinGrant,
} from './access.types.js';

/**
 * THE AUTHORIZATION ENGINE.
 *
 * Every protected operation routes through this module. Routes never invent
 * their own checks, and no decision made here is ever cached: authorization is
 * re-evaluated against current server state on every single request, because a
 * revocation that lands one millisecond ago must be authoritative immediately.
 *
 * Only these functions may decide whether a caller can act on a call.
 */

const callSelect = {
  id: true,
  organizerId: true,
  title: true,
  scheduledStart: true,
  scheduledEnd: true,
  timezone: true,
  status: true,
  providerCallId: true,
} as const;

const invitationSelect = {
  id: true,
  callId: true,
  participantId: true,
  status: true,
  issuedAt: true,
  expiresAt: true,
  revokedAt: true,
} as const;

/**
 * Decides whether `userId` may join using `rawToken` at instant `now`.
 *
 * The checks run in the fixed order mandated by the specification. Ordering is
 * not cosmetic: participant ownership is verified before any call-state or
 * timing detail is allowed to influence the response, so a holder of someone
 * else's token learns nothing about that call's schedule.
 */
export async function authorizeJoin(input: {
  userId: string | undefined;
  rawToken: string;
  now: Date;
  db?: DbClient;
}): Promise<Decision<JoinGrant>> {
  const db = input.db ?? prisma;

  // 1. current user exists
  if (!input.userId) {
    return deny('AUTHENTICATION_REQUIRED', 'no authenticated user');
  }

  // Structural check before spending a query on an obviously malformed token.
  if (!isWellFormedRawToken(input.rawToken)) {
    return deny('INVITE_NOT_FOUND', 'malformed token');
  }

  // 2. invitation exists (looked up by hash; the raw token is never stored)
  const record = await db.invitation.findUnique({
    where: { tokenHash: hashToken(input.rawToken) },
    select: { ...invitationSelect, call: { select: callSelect } },
  });

  if (!record) {
    return deny('INVITE_NOT_FOUND', 'no invitation matches this token');
  }

  // 3. call exists
  if (!record.call) {
    return deny('CALL_NOT_FOUND', 'invitation references a missing call');
  }

  const invitation: InvitationView = {
    id: record.id,
    callId: record.callId,
    participantId: record.participantId,
    status: record.status,
    issuedAt: record.issuedAt,
    expiresAt: record.expiresAt,
    revokedAt: record.revokedAt,
  };
  const call: CallView = record.call;

  // Denials from here on can be attributed to a specific call/invitation,
  // which is what lets an organizer audit failed attempts against their call.
  const attribution = { callId: call.id, invitationId: invitation.id };

  // 4. invitation status
  if (invitation.status === 'REVOKED') {
    return deny('INVITE_REVOKED', 'invitation has been revoked', attribution);
  }
  if (invitation.status === 'EXPIRED') {
    return deny('INVITE_EXPIRED', 'invitation is marked expired', attribution);
  }

  // 5. invitation expiration — evaluated against the clock, not just the
  //    stored status, because the status column is updated lazily.
  if (invitation.expiresAt.getTime() <= input.now.getTime()) {
    return deny('INVITE_EXPIRED', 'invitation expiry has passed', attribution);
  }

  // 6. participant ownership
  if (invitation.participantId !== input.userId) {
    return deny(
      'PARTICIPANT_MISMATCH',
      'authenticated user is not the invited participant',
      attribution,
    );
  }

  // 7. call status
  if (call.status === 'CANCELLED') {
    return deny('CALL_CANCELLED', 'call is cancelled', attribution);
  }
  if (call.status === 'ENDED') {
    return deny('JOIN_WINDOW_CLOSED', 'call has ended', attribution);
  }
  if (call.status === 'DRAFT') {
    return deny('CALL_NOT_JOINABLE', 'call is still a draft', attribution);
  }

  // 8. current time against the call window.
  //
  //    Entry BEFORE the scheduled start is deliberately permitted: an invitee
  //    may arrive early and wait, exactly as they would walk into a meeting
  //    room ahead of time. What gates entry is holding a live invitation, not
  //    the clock.
  //
  //    The end of the window still closes the room, and is checked
  //    independently of call.status so that a lagging scheduler can never
  //    leave a call joinable past its scheduled end.
  if (isAfterCallWindow(call, input.now)) {
    return deny('JOIN_WINDOW_CLOSED', 'current time is at or past the scheduled end', attribution);
  }

  // 9. no further restriction applies
  return allow({ invitation, call, participantId: input.userId });
}

/**
 * Decides whether `userId` may ENTER `callId` on the strength of who they are.
 *
 * This is the same decision `authorizeJoin` makes, reached without a join
 * link. The organizer is admitted by ownership — they need no invitation to
 * their own call, and issuing one to them is refused elsewhere — and an
 * invitee is admitted by a live invitation. Every other rule (call state, the
 * end of the window, revocation, expiry) applies identically to both, so
 * holding the link and being signed in are interchangeable, never additive.
 */
export async function authorizeCallEntry(input: {
  userId: string | undefined;
  callId: string;
  now: Date;
  db?: DbClient;
}): Promise<Decision<CallEntryGrant>> {
  if (!input.userId) {
    return deny('AUTHENTICATION_REQUIRED', 'no authenticated user');
  }

  const { call, relation, invitation } = await resolveCallRelation({
    userId: input.userId,
    callId: input.callId,
    ...(input.db ? { db: input.db } : {}),
  });

  // An unrelated caller learns only that there is nothing here for them.
  if (!call || relation === CallRelation.NONE) {
    return deny('CALL_NOT_FOUND', 'call missing or caller is unrelated to it');
  }

  const attribution = {
    callId: call.id,
    ...(invitation ? { invitationId: invitation.id } : {}),
  };

  // Call state binds the organizer exactly as it binds a participant.
  if (call.status === 'CANCELLED') {
    return deny('CALL_CANCELLED', 'call is cancelled', attribution);
  }
  if (call.status === 'ENDED') {
    return deny('JOIN_WINDOW_CLOSED', 'call has ended', attribution);
  }
  if (call.status === 'DRAFT') {
    return deny('CALL_NOT_JOINABLE', 'call is still a draft', attribution);
  }
  if (isAfterCallWindow(call, input.now)) {
    return deny('JOIN_WINDOW_CLOSED', 'current time is at or past the scheduled end', attribution);
  }

  if (relation === CallRelation.ORGANIZER) {
    return allow({ call, participantId: input.userId, relation, invitation: null });
  }

  // Participant: the invitation row is the credential, checked live.
  if (!invitation) {
    return deny('INVITE_NOT_FOUND', 'no invitation for this participant', attribution);
  }
  if (invitation.status === 'REVOKED') {
    return deny('INVITE_REVOKED', 'invitation has been revoked', attribution);
  }
  if (invitation.status === 'EXPIRED') {
    return deny('INVITE_EXPIRED', 'invitation is marked expired', attribution);
  }
  if (invitation.expiresAt.getTime() <= input.now.getTime()) {
    return deny('INVITE_EXPIRED', 'invitation expiry has passed', attribution);
  }

  return allow({ call, participantId: input.userId, relation, invitation });
}

/** Server-derived relationship between a user and a call. */
export async function resolveCallRelation(input: {
  userId: string;
  callId: string;
  db?: DbClient;
}): Promise<{ call: CallView | null; relation: CallRelation; invitation: InvitationView | null }> {
  const db = input.db ?? prisma;

  const call = await db.call.findUnique({ where: { id: input.callId }, select: callSelect });
  if (!call) return { call: null, relation: CallRelation.NONE, invitation: null };

  if (call.organizerId === input.userId) {
    return { call, relation: CallRelation.ORGANIZER, invitation: null };
  }

  const invitation = await db.invitation.findUnique({
    where: { callId_participantId: { callId: input.callId, participantId: input.userId } },
    select: invitationSelect,
  });

  return {
    call,
    relation: invitation ? CallRelation.PARTICIPANT : CallRelation.NONE,
    invitation,
  };
}

/**
 * Read access to a call.
 *
 * An unrelated user gets CALL_NOT_FOUND rather than FORBIDDEN: enumerating
 * call IDs must not reveal which ones exist.
 */
export async function authorizeCallRead(input: {
  userId: string;
  callId: string;
  db?: DbClient;
}): Promise<Decision<{ call: CallView; relation: CallRelation }>> {
  const { call, relation } = await resolveCallRelation(input);

  if (!call || relation === CallRelation.NONE) {
    return deny('CALL_NOT_FOUND', 'call missing or caller is unrelated to it');
  }
  return allow({ call, relation });
}

/** Organizer-only management of a call (cancel, end, list invitations). */
export async function authorizeCallManage(input: {
  userId: string;
  callId: string;
  db?: DbClient;
}): Promise<Decision<{ call: CallView }>> {
  const { call, relation } = await resolveCallRelation(input);

  if (!call) return deny('CALL_NOT_FOUND', 'call does not exist');
  if (relation !== CallRelation.ORGANIZER) {
    // A participant knows the call exists, so FORBIDDEN leaks nothing there;
    // an unrelated caller must still get the not-found shape.
    return relation === CallRelation.PARTICIPANT
      ? deny('FORBIDDEN', 'caller is not the organizer')
      : deny('CALL_NOT_FOUND', 'call missing or caller is unrelated to it');
  }
  return allow({ call });
}

/**
 * Transcript read access: organizer or an invited participant.
 *
 * Ownership is derived from the invitation relationship, never from a
 * client-supplied identifier, and a revoked invitation still counts as having
 * been invited — revocation removes live access, not the record of
 * participation. The call-scoped relationship is what gates the read.
 */
export async function authorizeTranscriptRead(input: {
  userId: string;
  callId: string;
  db?: DbClient;
}): Promise<Decision<{ call: CallView; relation: CallRelation }>> {
  const { call, relation } = await resolveCallRelation(input);

  if (!call || relation === CallRelation.NONE) {
    return deny('RESOURCE_NOT_FOUND', 'call missing or caller is unrelated to it');
  }
  return allow({ call, relation });
}

/** Attendance roster: organizer only. */
export async function authorizeAttendanceRead(input: {
  userId: string;
  callId: string;
  db?: DbClient;
}): Promise<Decision<{ call: CallView }>> {
  return authorizeCallManage(input);
}

/** Audit log: organizer only. */
export async function authorizeAuditRead(input: {
  userId: string;
  callId: string;
  db?: DbClient;
}): Promise<Decision<{ call: CallView }>> {
  return authorizeCallManage(input);
}

/** Reading a single invitation: its organizer or its own participant. */
export async function authorizeInvitationRead(input: {
  userId: string;
  invitationId: string;
  db?: DbClient;
}): Promise<Decision<{ invitation: InvitationView; call: CallView; relation: CallRelation }>> {
  const db = input.db ?? prisma;

  const record = await db.invitation.findUnique({
    where: { id: input.invitationId },
    select: { ...invitationSelect, call: { select: callSelect } },
  });

  if (!record?.call) return deny('RESOURCE_NOT_FOUND', 'invitation does not exist');

  const invitation: InvitationView = {
    id: record.id,
    callId: record.callId,
    participantId: record.participantId,
    status: record.status,
    issuedAt: record.issuedAt,
    expiresAt: record.expiresAt,
    revokedAt: record.revokedAt,
  };

  if (record.call.organizerId === input.userId) {
    return allow({ invitation, call: record.call, relation: CallRelation.ORGANIZER });
  }
  if (invitation.participantId === input.userId) {
    return allow({ invitation, call: record.call, relation: CallRelation.PARTICIPANT });
  }

  return deny('RESOURCE_NOT_FOUND', 'caller is unrelated to this invitation');
}

/**
 * Revoking an invitation: organizer of the owning call only.
 *
 * Ownership is walked current user -> invitation -> call -> organizer. No
 * organizerId or participantId from the request is consulted.
 */
export async function authorizeInvitationRevoke(input: {
  userId: string;
  invitationId: string;
  db?: DbClient;
}): Promise<Decision<{ invitation: InvitationView; call: CallView }>> {
  const decision = await authorizeInvitationRead(input);

  if (!decision.allowed) return decision;
  if (decision.value.relation !== CallRelation.ORGANIZER) {
    return deny('RESOURCE_NOT_FOUND', 'caller is not the organizer of this invitation');
  }

  return allow({ invitation: decision.value.invitation, call: decision.value.call });
}

/**
 * Authorization for realtime room membership.
 *
 * Socket connections get no ambient authority: joining a call room requires a
 * live invitation or organizer ownership, checked against the database.
 */
export async function authorizeRealtimeCallRoom(input: {
  userId: string;
  callId: string;
  now: Date;
  db?: DbClient;
}): Promise<Decision<{ relation: CallRelation }>> {
  const { call, relation, invitation } = await resolveCallRelation(input);

  if (!call) return deny('CALL_NOT_FOUND', 'call does not exist');
  if (relation === CallRelation.ORGANIZER) return allow({ relation });

  if (relation !== CallRelation.PARTICIPANT || !invitation) {
    return deny('CALL_NOT_FOUND', 'caller is unrelated to this call');
  }
  if (invitation.status !== 'ACTIVE') {
    return deny('INVITE_REVOKED', 'invitation is not active');
  }
  if (invitation.expiresAt.getTime() <= input.now.getTime()) {
    return deny('INVITE_EXPIRED', 'invitation has expired');
  }
  if (call.status === 'CANCELLED') return deny('CALL_CANCELLED', 'call is cancelled');
  if (isAfterCallWindow(call, input.now)) {
    return deny('JOIN_WINDOW_CLOSED', 'call window has closed');
  }

  return allow({ relation });
}

/** Re-exported so callers reason about windows through one module. */
export { isCallWindowOpen, isBeforeCallWindow, isAfterCallWindow };
