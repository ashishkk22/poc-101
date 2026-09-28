import { DEFAULT_DEVICE_ID } from '../../config/constants.js';
import { prisma, type DbClient } from '../../infrastructure/database/prisma.js';
import { logger } from '../../infrastructure/logger/logger.js';
import { enqueueProviderCleanup } from '../../infrastructure/queue/queues.js';
import { recordProviderTiming } from '../../infrastructure/telemetry/otel.js';
import { AppError, ErrorCode } from '../../shared/errors/index.js';
import { type RequestContext } from '../../shared/http/request-context.js';
import { type Clock, systemClock } from '../../shared/time/clock.js';
import {
  authorizeCallEntry,
  CallRelation,
  denialToError,
  type CallEntryGrant,
  type Decision,
  type Denied,
} from '../access/index.js';
import { AuditAction } from '../audit/audit.actions.js';
import { auditService } from '../audit/audit.service.js';
import { callService } from '../calls/call.service.js';
import { toJoinCallDto, type JoinCallDto } from '../calls/call.dto.js';
import { invitationRepository } from '../invitations/invitation.repository.js';
import { meetingProvider, ProviderError } from '../provider/index.js';
import { publishParticipantJoined, publishParticipantLeft } from '../realtime/publisher.js';
import { attendanceRepository } from './attendance.repository.js';
import { recomputeAttendanceTotals } from './attendance.service.js';
import { toAttendanceSessionDto, type AttendanceSessionDto } from './attendance.dto.js';

/**
 * ONE ENTRY PIPELINE, TWO DOORS.
 *
 * A join link and a signed-in identity are two ways of reaching the same
 * decision, so they must not become two implementations of it. Both routes
 * supply an `EntryAuthorizer`, and everything that follows — the provider
 * session, the re-check, the attendance write, the audit rows — happens here,
 * once.
 */

export interface EntryResult {
  call: JoinCallDto;
  attendanceSession: AttendanceSessionDto;
  providerSession: { id: string; expiresAt: string };
  /** Lets the client label the local participant without a second request. */
  role: CallRelation;
}

export interface EntryAuthorizer {
  /**
   * Locks whatever a concurrent revoke would contend with, then decides.
   * Called twice: once before the provider round-trip and once after.
   */
  authorize(tx: DbClient, now: Date): Promise<Decision<CallEntryGrant>>;
  /** How this attempt reached us, recorded on every audit row it produces. */
  via: 'INVITE_LINK' | 'CALL_ID';
  /** Non-reversible correlation for a credential, when one was presented. */
  auditMetadata?: Record<string, unknown>;
}

function denyWith(
  action: (typeof AuditAction)['JOIN_DENIED'] | (typeof AuditAction)['HEARTBEAT_DENIED'],
  denied: Denied,
  input: {
    userId: string | undefined;
    context: RequestContext;
    via: string;
    callId?: string | null;
    metadata?: Record<string, unknown>;
  },
): AppError {
  auditService.recordDetached({
    action,
    outcome: 'DENIED',
    actorUserId: input.userId ?? null,
    callId: denied.callId ?? input.callId ?? null,
    invitationId: denied.invitationId ?? null,
    requestId: input.context.requestId,
    ipAddress: input.context.ipAddress ?? null,
    userAgent: input.context.userAgent ?? null,
    metadata: { code: denied.code, reason: denied.reason, via: input.via, ...input.metadata },
  });

  return denialToError(denied);
}

/** Looks up the display name, then announces. Failures are logged, not raised. */
function announceArrival(input: {
  callId: string;
  participantId: string;
  isOrganizer: boolean;
  joinedAt: Date;
}): void {
  void prisma.user
    .findUnique({ where: { id: input.participantId }, select: { name: true } })
    .then((person) =>
      publishParticipantJoined({
        callId: input.callId,
        participantId: input.participantId,
        name: person?.name ?? 'Participant',
        isOrganizer: input.isOrganizer,
        joinedAt: input.joinedAt,
      }),
    )
    .catch((error) => logger.error({ err: error }, 'failed to announce arrival'));
}

/** The same, for a departure once the participant has no session left. */
function announceDeparture(input: { callId: string; participantId: string }): void {
  void prisma.user
    .findUnique({ where: { id: input.participantId }, select: { name: true } })
    .then((person) =>
      publishParticipantLeft({
        callId: input.callId,
        participantId: input.participantId,
        name: person?.name ?? 'Participant',
      }),
    )
    .catch((error) => logger.error({ err: error }, 'failed to announce departure'));
}

/**
 * Admits a caller to a call.
 *
 *   1. authorize under a lock   (serializes against revoke)
 *   2. issue the provider session (OUTSIDE any transaction)
 *   3. re-authorize under a lock and record attendance
 *
 * Step 3 is not redundant. The provider call is a network round-trip during
 * which a revoke may commit; re-checking means nobody is ever admitted on the
 * strength of an authorization that has since been invalidated. If step 3
 * denies, the orphaned provider session is queued for cleanup, not leaked.
 */
export async function enterCall(
  authorizer: EntryAuthorizer,
  input: {
    userId: string | undefined;
    deviceId?: string | undefined;
    context: RequestContext;
    clock: Clock;
  },
): Promise<EntryResult> {
  const deviceId = input.deviceId ?? DEFAULT_DEVICE_ID;
  const auditBase = {
    userId: input.userId,
    context: input.context,
    via: authorizer.via,
    ...(authorizer.auditMetadata ? { metadata: authorizer.auditMetadata } : {}),
  };

  // --- step 1: authorize ---------------------------------------------------
  const firstPass = await prisma.$transaction((tx) => authorizer.authorize(tx, input.clock.now()));

  if (!firstPass.allowed) {
    throw denyWith(AuditAction.JOIN_DENIED, firstPass, auditBase);
  }

  const grant = firstPass.value;

  // --- step 2: provider session (no transaction held) ----------------------
  const providerCallId =
    grant.call.providerCallId ?? (await callService.ensureProviderMeeting(grant.call.id));

  // Provider credentials never outlive the call window.
  const expiresAt = grant.call.scheduledEnd;
  const startedAt = Date.now();
  let providerSession: { providerSessionId: string; expiresAt: Date };

  try {
    providerSession = await meetingProvider.issueParticipantSession({
      providerCallId,
      callId: grant.call.id,
      participantId: grant.participantId,
      attendanceSessionId: 'pending',
      expiresAt,
      requestId: input.context.requestId,
    });
    recordProviderTiming('issueParticipantSession', Date.now() - startedAt, 'SUCCESS');
  } catch (error) {
    recordProviderTiming('issueParticipantSession', Date.now() - startedAt, 'FAILURE');

    // Authorization was valid; the provider failed. Nobody is recorded as
    // connected, and the invitation is left exactly as it was.
    auditService.recordDetached({
      action: AuditAction.PROVIDER_FAILURE,
      outcome: 'FAILURE',
      actorUserId: grant.participantId,
      callId: grant.call.id,
      invitationId: grant.invitation?.id ?? null,
      requestId: input.context.requestId,
      metadata: {
        operation: 'issueParticipantSession',
        category: error instanceof ProviderError ? error.category : 'UNKNOWN',
      },
    });

    throw new AppError(ErrorCode.PROVIDER_UNAVAILABLE, { cause: error });
  }

  // --- step 3: re-authorize, then record -----------------------------------
  const now = input.clock.now();

  try {
    const recorded = await prisma.$transaction(async (tx) => {
      const recheck = await authorizer.authorize(tx, now);
      if (!recheck.allowed) {
        throw denyWith(AuditAction.JOIN_DENIED, recheck, {
          ...auditBase,
          callId: grant.call.id,
        });
      }

      const attendance = await attendanceRepository.findOrCreate(
        grant.call.id,
        grant.participantId,
        tx,
      );

      const created = await attendanceRepository.createSession(
        {
          attendanceId: attendance.id,
          deviceId,
          providerSessionId: providerSession.providerSessionId,
          joinedAt: now,
        },
        tx,
      );

      // Only an invitation-backed entry consumes an invitation.
      if (recheck.value.invitation) {
        await tx.invitation.update({
          where: { id: recheck.value.invitation.id },
          data: { lastUsedAt: now },
        });
      }

      const metadata = {
        deviceId,
        attendanceSessionId: created.id,
        via: authorizer.via,
        role: recheck.value.relation,
      };

      await auditService.record(
        {
          action: AuditAction.JOIN_AUTHORIZED,
          outcome: 'SUCCESS',
          actorUserId: grant.participantId,
          callId: grant.call.id,
          invitationId: recheck.value.invitation?.id ?? null,
          requestId: input.context.requestId,
          ipAddress: input.context.ipAddress ?? null,
          userAgent: input.context.userAgent ?? null,
          metadata,
        },
        tx,
      );

      await auditService.record(
        {
          action: AuditAction.ATTENDANCE_JOINED,
          outcome: 'SUCCESS',
          actorUserId: grant.participantId,
          callId: grant.call.id,
          invitationId: recheck.value.invitation?.id ?? null,
          requestId: input.context.requestId,
          metadata,
        },
        tx,
      );

      return { created, attendanceId: attendance.id, relation: recheck.value.relation };
    });

    await recomputeAttendanceTotals(recorded.attendanceId, now);

    // Best-effort roster announcement, deliberately not awaited: a lost event
    // costs a stale list, and making the caller wait for it would put a
    // notification on the critical path of being admitted.
    void announceArrival({
      callId: grant.call.id,
      participantId: grant.participantId,
      isOrganizer: recorded.relation === CallRelation.ORGANIZER,
      joinedAt: now,
    });

    return {
      call: toJoinCallDto(grant.call),
      attendanceSession: toAttendanceSessionDto(recorded.created),
      providerSession: {
        id: providerSession.providerSessionId,
        expiresAt: providerSession.expiresAt.toISOString(),
      },
      role: recorded.relation,
    };
  } catch (error) {
    // Authorization changed underneath us, or the write failed. Do not leave a
    // live provider session behind.
    await enqueueProviderCleanup({
      callId: grant.call.id,
      ...(grant.invitation ? { invitationId: grant.invitation.id } : {}),
      providerCallId,
      providerSessionId: providerSession.providerSessionId,
      reason: 'ORPHANED_SESSION',
      requestId: input.context.requestId,
    }).catch((cleanupError) =>
      logger.error({ err: cleanupError }, 'failed to enqueue orphaned session cleanup'),
    );

    throw error;
  }
}

export { denyWith, publishParticipantLeft };

// ---------------------------------------------------------------------------
// Door two: entry by identity, with no join link involved.
// ---------------------------------------------------------------------------

/**
 * Locks the invitation row this caller's access rests on, when there is one,
 * so identity entry serializes against revoke exactly as the link path does.
 * The organizer has no such row, and needs none: their access rests on
 * ownership, which a revoke cannot touch.
 */
function identityAuthorizer(userId: string, callId: string): EntryAuthorizer {
  return {
    via: 'CALL_ID',
    async authorize(tx, now) {
      await invitationRepository.lockForCallAndParticipant(callId, userId, tx);
      return authorizeCallEntry({ userId, callId, now, db: tx });
    },
  };
}

export interface HeartbeatResult {
  status: 'ACTIVE';
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

export const callEntryService = {
  /** Enter a call as the organizer, or as an invitee who still has access. */
  async join(
    userId: string | undefined,
    callId: string,
    body: { deviceId?: string | undefined },
    context: RequestContext,
    clock: Clock = systemClock,
  ): Promise<EntryResult> {
    return enterCall(identityAuthorizer(userId as string, callId), {
      userId,
      deviceId: body.deviceId,
      context,
      clock,
    });
  },

  /**
   * Keeps the session alive AND revalidates access.
   *
   * This is what makes revocation authoritative even when realtime delivery
   * fails: a revoked participant is denied here whether or not the socket
   * event ever arrived.
   */
  async heartbeat(
    userId: string | undefined,
    callId: string,
    body: { sessionId?: string | undefined; deviceId?: string | undefined },
    context: RequestContext,
    clock: Clock = systemClock,
  ): Promise<HeartbeatResult> {
    const now = clock.now();
    const decision = await authorizeCallEntry({ userId, callId, now });

    if (!decision.allowed) {
      throw denyWith(AuditAction.HEARTBEAT_DENIED, decision, {
        userId,
        context,
        via: 'CALL_ID',
      });
    }

    const grant = decision.value;
    const attendance = await attendanceRepository.findForParticipant(
      grant.call.id,
      grant.participantId,
    );
    if (!attendance) {
      throw new AppError(ErrorCode.CONFLICT, { message: 'No active session for this call.' });
    }

    const session = await resolveSession(attendance.id, body.sessionId, body.deviceId);
    if (!session) {
      throw new AppError(ErrorCode.CONFLICT, { message: 'No connected session to keep alive.' });
    }

    await attendanceRepository.touchSession(session.id, now);
    await recomputeAttendanceTotals(attendance.id, now);

    return {
      status: 'ACTIVE',
      sessionId: session.id,
      serverTime: now.toISOString(),
      callEndsAt: grant.call.scheduledEnd.toISOString(),
    };
  },

  /**
   * Leave. Idempotent, and always permitted to whoever owns the session:
   * closing out your own attendance is never gated on still having access.
   */
  async leave(
    userId: string | undefined,
    callId: string,
    body: { sessionId?: string | undefined; deviceId?: string | undefined; reason: string },
    context: RequestContext,
    clock: Clock = systemClock,
  ): Promise<LeaveResult> {
    if (!userId) throw new AppError(ErrorCode.AUTHENTICATION_REQUIRED);
    const now = clock.now();

    const attendance = await attendanceRepository.findForParticipant(callId, userId);
    if (!attendance) {
      return { sessionId: null, status: 'NOT_JOINED', totalConnectedSeconds: 0, alreadyLeft: true };
    }

    return closeAttendance({
      attendanceId: attendance.id,
      callId,
      userId,
      invitationId: null,
      body,
      context,
      now,
    });
  },
};

/** Explicit id wins; then the device's session; then the newest connected one. */
export async function resolveSession(
  attendanceId: string,
  sessionId?: string | undefined,
  deviceId?: string | undefined,
) {
  if (sessionId) {
    const session = await attendanceRepository.findSessionById(sessionId);
    // A session id from another attendance record must not be addressable.
    if (!session || session.attendanceId !== attendanceId) return null;
    return session.status === 'CONNECTED' ? session : null;
  }

  if (deviceId) return attendanceRepository.findSessionForDevice(attendanceId, deviceId);

  const connected = await attendanceRepository.findConnectedSessions(attendanceId);
  return connected[0] ?? null;
}

/** Shared close-out used by both doors, so leaving behaves identically. */
export async function closeAttendance(input: {
  attendanceId: string;
  callId: string;
  userId: string;
  invitationId: string | null;
  body: { sessionId?: string | undefined; deviceId?: string | undefined; reason: string };
  context: RequestContext;
  now: Date;
}): Promise<LeaveResult> {
  const session = await resolveSession(
    input.attendanceId,
    input.body.sessionId,
    input.body.deviceId,
  );

  if (!session) {
    const totals = await recomputeAttendanceTotals(input.attendanceId, input.now);
    return {
      sessionId: null,
      status: totals.status,
      totalConnectedSeconds: totals.totalConnectedSeconds,
      alreadyLeft: true,
    };
  }

  const closed = await attendanceRepository.closeSessionIfConnected(session.id, {
    leftAt: input.now,
    leftReason: input.body.reason,
    status: 'LEFT',
  });

  const totals = await recomputeAttendanceTotals(input.attendanceId, input.now);

  if (closed > 0) {
    auditService.recordDetached({
      action: AuditAction.ATTENDANCE_LEFT,
      outcome: 'SUCCESS',
      actorUserId: input.userId,
      callId: input.callId,
      invitationId: input.invitationId,
      requestId: input.context.requestId,
      metadata: {
        attendanceSessionId: session.id,
        reason: input.body.reason,
        totalConnectedSeconds: totals.totalConnectedSeconds,
      },
    });

    // Announce only once the participant has no session left, and never on
    // the critical path of their own leave request.
    void attendanceRepository
      .findConnectedSessions(input.attendanceId)
      .then((remaining) => {
        if (remaining.length === 0) {
          announceDeparture({ callId: input.callId, participantId: input.userId });
        }
      })
      .catch((error) => logger.error({ err: error }, 'failed to check remaining sessions'));
  }

  return {
    sessionId: session.id,
    status: totals.status,
    totalConnectedSeconds: totals.totalConnectedSeconds,
    alreadyLeft: closed === 0,
  };
}
