import { env } from '../../config/env.js';
import { AppError, ErrorCode } from '../../shared/errors/index.js';
import { type RequestContext } from '../../shared/http/request-context.js';
import { type Clock, systemClock } from '../../shared/time/clock.js';
import { hashToken, tokenFingerprint } from '../../shared/security/tokens.js';
import {
  allow,
  authorizeJoin,
  CallRelation,
  denialToError,
  type CallEntryGrant,
  type Decision,
} from '../access/index.js';
import { toJoinCallDto, type JoinCallDto } from '../calls/call.dto.js';
import { AuditAction } from '../audit/audit.actions.js';
import { invitationRepository } from '../invitations/invitation.repository.js';
import { attendanceRepository } from './attendance.repository.js';
import { recomputeAttendanceTotals } from './attendance.service.js';
import {
  closeAttendance,
  denyWith,
  enterCall,
  resolveSession,
  type EntryAuthorizer,
  type EntryResult,
  type HeartbeatResult,
  type LeaveResult,
} from './call-entry.service.js';
import { type HeartbeatBody, type JoinBody, type LeaveBody } from './join.schemas.js';

export interface JoinServiceDeps {
  clock: Clock;
}

const defaultDeps: JoinServiceDeps = { clock: systemClock };

/** Kept for callers that still name the link-specific result type. */
export type JoinResult = EntryResult;
export type { HeartbeatResult, LeaveResult };

/**
 * Door one: entry by join link.
 *
 * The link identifies which invitation is being presented; it never replaces
 * authentication, and it grants nothing the invitation row does not already
 * grant. Everything after the decision is the shared pipeline.
 */
function linkAuthorizer(
  userId: string | undefined,
  rawToken: string,
): EntryAuthorizer {
  const tokenHash = hashToken(rawToken);

  return {
    via: 'INVITE_LINK',
    // A fingerprint, never the credential: enough to correlate, useless to replay.
    auditMetadata: { tokenFingerprint: tokenFingerprint(rawToken) },
    async authorize(tx, now): Promise<Decision<CallEntryGrant>> {
      await invitationRepository.lockByTokenHash(tokenHash, tx);

      const decision = await authorizeJoin({ userId, rawToken, now, db: tx });
      if (!decision.allowed) return decision;

      const { invitation, call, participantId } = decision.value;
      return allow({ call, participantId, relation: CallRelation.PARTICIPANT, invitation });
    },
  };
}

export const joinService = {
  async authorizeAndJoin(
    userId: string | undefined,
    rawToken: string,
    body: JoinBody,
    context: RequestContext,
    deps: JoinServiceDeps = defaultDeps,
  ): Promise<JoinResult> {
    return enterCall(linkAuthorizer(userId, rawToken), {
      userId,
      deviceId: body.deviceId,
      context,
      clock: deps.clock,
    });
  },

  /**
   * Heartbeat: keeps the session alive AND revalidates authorization.
   *
   * This is what makes revocation authoritative even when realtime delivery
   * fails — a revoked participant is denied here regardless of whether the
   * socket event ever arrived.
   */
  async heartbeat(
    userId: string | undefined,
    rawToken: string,
    body: HeartbeatBody,
    context: RequestContext,
    deps: JoinServiceDeps = defaultDeps,
  ): Promise<HeartbeatResult> {
    const now = deps.clock.now();
    const decision = await authorizeJoin({ userId, rawToken, now });

    if (!decision.allowed) {
      throw denyWith(AuditAction.HEARTBEAT_DENIED, decision, {
        userId,
        context,
        via: 'INVITE_LINK',
        metadata: { tokenFingerprint: tokenFingerprint(rawToken) },
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
   * Leave. Idempotent by construction: the session is closed with a
   * conditional update, and totals are recomputed rather than incremented, so
   * a repeated leave neither double-counts duration nor opens a new session.
   */
  async leave(
    userId: string | undefined,
    rawToken: string,
    body: LeaveBody,
    context: RequestContext,
    deps: JoinServiceDeps = defaultDeps,
  ): Promise<LeaveResult> {
    const now = deps.clock.now();
    if (!userId) throw new AppError(ErrorCode.AUTHENTICATION_REQUIRED);

    // Leaving is always permitted for the rightful holder, even after the
    // window closes or the invitation is revoked — a participant must be able
    // to close out their own attendance record. Ownership is still enforced.
    const invitation = await invitationRepository.findByTokenHash(hashToken(rawToken));
    if (!invitation) throw new AppError(ErrorCode.INVITE_NOT_FOUND);
    if (invitation.participantId !== userId) throw new AppError(ErrorCode.PARTICIPANT_MISMATCH);

    const attendance = await attendanceRepository.findForParticipant(invitation.callId, userId);
    if (!attendance) {
      return { sessionId: null, status: 'NOT_JOINED', totalConnectedSeconds: 0, alreadyLeft: true };
    }

    return closeAttendance({
      attendanceId: attendance.id,
      callId: invitation.callId,
      userId,
      invitationId: invitation.id,
      body,
      context,
      now,
    });
  },

  /**
   * Answers "what call is this link for, and may I enter it?" — and changes
   * nothing.
   *
   * It runs the identical authorization as joining, so a revoked or expired
   * link is refused here exactly as it would be on entry. What it does not do
   * is record attendance or mint a provider session, which is what lets the
   * client show a device check before the participant commits to walking in.
   */
  async resolveLink(
    userId: string | undefined,
    rawToken: string,
    deps: JoinServiceDeps = defaultDeps,
  ): Promise<{ call: JoinCallDto; invitationId: string }> {
    const decision = await authorizeJoin({ userId, rawToken, now: deps.clock.now() });
    if (!decision.allowed) throw denialToError(decision);

    return {
      call: toJoinCallDto(decision.value.call),
      invitationId: decision.value.invitation.id,
    };
  },

  resolveSession,

  /** Heartbeat liveness threshold, exposed for the reaper worker. */
  get heartbeatTimeoutSeconds(): number {
    return env.HEARTBEAT_TIMEOUT_SECONDS;
  },
};
