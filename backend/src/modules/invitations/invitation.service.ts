import { env, joinUrlBase } from '../../config/env.js';
import { type InvitationStatus } from '../../generated/prisma/enums.js';
import { prisma } from '../../infrastructure/database/prisma.js';
import { logger } from '../../infrastructure/logger/logger.js';
import { enqueueProviderCleanup } from '../../infrastructure/queue/queues.js';
import { AppError, ErrorCode } from '../../shared/errors/index.js';
import { buildPage } from '../../shared/http/pagination.js';
import { type RequestContext } from '../../shared/http/request-context.js';
import { type Clock, systemClock } from '../../shared/time/clock.js';
import { addMinutes } from '../../shared/time/window.js';
import { generateRawToken, hashToken, tokenFingerprint } from '../../shared/security/tokens.js';
import {
  authorizeCallManage,
  authorizeInvitationRead,
  authorizeInvitationRevoke,
  unwrap,
} from '../access/index.js';
import { AuditAction } from '../audit/audit.actions.js';
import { auditService } from '../audit/audit.service.js';
import { recomputeAttendanceTotals } from '../attendance/attendance.service.js';
import { publishInvitationRevoked } from '../realtime/publisher.js';
import {
  toInvitationDto,
  toMyInvitationDto,
  type CreatedInvitationDto,
  type InvitationDto,
  type MyInvitationDto,
  type RevokedInvitationDto,
} from './invitation.dto.js';
import { invitationRepository } from './invitation.repository.js';
import { type CreateInvitationInput, type ListInvitationsQuery } from './invitation.schemas.js';

export interface InvitationServiceDeps {
  clock: Clock;
}

const defaultDeps: InvitationServiceDeps = { clock: systemClock };

/** Credentials never outlive the call window by more than the configured grace. */
function resolveExpiry(scheduledEnd: Date, requested?: string): Date {
  const ceiling = addMinutes(scheduledEnd, env.INVITATION_TTL_MINUTES_AFTER_END);
  if (!requested) return ceiling;

  const parsed = new Date(requested);
  return parsed.getTime() < ceiling.getTime() ? parsed : ceiling;
}

export const invitationService = {
  /**
   * Issues a participant-bound join credential.
   *
   * The raw token is generated here, hashed immediately, and returned to the
   * organizer exactly once in the creation response. Only the hash is stored,
   * and the raw value is never logged or audited.
   */
  async create(
    actorUserId: string,
    callId: string,
    input: CreateInvitationInput,
    context: RequestContext,
  ): Promise<CreatedInvitationDto> {
    const { call } = unwrap(await authorizeCallManage({ userId: actorUserId, callId }));

    if (call.status === 'CANCELLED' || call.status === 'ENDED') {
      throw new AppError(ErrorCode.BUSINESS_RULE_FAILURE, {
        message: 'Invitations cannot be issued for a call that is cancelled or ended.',
      });
    }

    const participant = await prisma.user.findUnique({
      where: { id: input.participantId },
      select: { id: true, name: true, email: true },
    });
    if (!participant) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, { message: 'Participant does not exist.' });
    }
    if (participant.id === call.organizerId) {
      throw new AppError(ErrorCode.BUSINESS_RULE_FAILURE, {
        message: 'The organizer does not need an invitation.',
      });
    }

    const existing = await invitationRepository.findForCallAndParticipant(callId, participant.id);
    if (existing) {
      throw new AppError(ErrorCode.CONFLICT, {
        message: 'This participant has already been invited to this call.',
      });
    }

    const rawToken = generateRawToken();
    const tokenHash = hashToken(rawToken);
    const expiresAt = resolveExpiry(call.scheduledEnd, input.expiresAt);

    const invitation = await prisma.$transaction(async (tx) => {
      const created = await invitationRepository.create(
        { callId, participantId: participant.id, tokenHash, expiresAt },
        tx,
      );

      await auditService.record(
        {
          action: AuditAction.INVITATION_CREATED,
          outcome: 'SUCCESS',
          actorUserId,
          callId,
          invitationId: created.id,
          requestId: context.requestId,
          ipAddress: context.ipAddress ?? null,
          userAgent: context.userAgent ?? null,
          // Fingerprint, not the credential: enough to correlate, useless to replay.
          metadata: {
            participantId: participant.id,
            expiresAt: expiresAt.toISOString(),
            tokenFingerprint: tokenFingerprint(rawToken),
          },
        },
        tx,
      );

      return created;
    });

    return {
      ...toInvitationDto(invitation),
      joinUrl: `${joinUrlBase.replace(/\/+$/, '')}/join/${rawToken}`,
    };
  },

  /**
   * The caller's own invitations.
   *
   * There is no user-supplied identifier here at all: the list is scoped to
   * the authenticated caller, so it cannot be pointed at anyone else.
   */
  async listMine(
    actorUserId: string,
    query: ListInvitationsQuery,
  ): Promise<{ items: MyInvitationDto[]; nextCursor: string | null }> {
    const rows = await invitationRepository.listForParticipant({
      participantId: actorUserId,
      status: query.status as InvitationStatus | undefined,
      limit: query.limit,
      ...(query.cursor ? { cursor: query.cursor } : {}),
    });

    const page = buildPage(rows, query.limit, (row) => row.createdAt);
    return { items: page.items.map(toMyInvitationDto), nextCursor: page.nextCursor };
  },

  async listForCall(
    actorUserId: string,
    callId: string,
    query: ListInvitationsQuery,
  ): Promise<{ items: InvitationDto[]; nextCursor: string | null }> {
    unwrap(await authorizeCallManage({ userId: actorUserId, callId }));

    const rows = await invitationRepository.list({
      callId,
      status: query.status as InvitationStatus | undefined,
      limit: query.limit,
      cursor: query.cursor,
    });

    const page = buildPage(rows, query.limit, (row) => row.createdAt);
    return { items: page.items.map(toInvitationDto), nextCursor: page.nextCursor };
  },

  async getById(actorUserId: string, invitationId: string): Promise<InvitationDto> {
    unwrap(await authorizeInvitationRead({ userId: actorUserId, invitationId }));

    const record = await invitationRepository.findById(invitationId);
    if (!record) throw new AppError(ErrorCode.RESOURCE_NOT_FOUND);
    return toInvitationDto(record);
  },

  /**
   * Revokes an invitation. Organizer only, transactional, idempotent.
   *
   * The transaction takes a row lock before reading status, which is what
   * makes the core invariant hold: once this commits, no in-flight join can
   * still admit the invitation, regardless of JavaScript execution order.
   *
   * The provider call happens strictly after commit — application access is
   * revoked whether or not the provider cooperates.
   */
  async revoke(
    actorUserId: string,
    invitationId: string,
    context: RequestContext,
    deps: InvitationServiceDeps = defaultDeps,
  ): Promise<RevokedInvitationDto> {
    const { invitation, call } = unwrap(
      await authorizeInvitationRevoke({ userId: actorUserId, invitationId }),
    );

    const now = deps.clock.now();

    const outcome = await prisma.$transaction(async (tx) => {
      const locked = await invitationRepository.lockById(invitationId, tx);
      if (!locked) throw new AppError(ErrorCode.RESOURCE_NOT_FOUND);

      if (locked.status === 'REVOKED') {
        const current = await tx.invitation.findUnique({ where: { id: invitationId } });
        // Idempotent replay: no second audit row, no state change.
        return { changed: false, revokedAt: current?.revokedAt ?? now };
      }

      await invitationRepository.revokeIfActive(invitationId, now, actorUserId, tx);

      const sessions = await tx.attendanceSession.findMany({
        where: {
          attendance: { callId: call.id, participantId: invitation.participantId },
          status: 'CONNECTED',
        },
        select: { id: true, providerSessionId: true, attendanceId: true },
      });

      await tx.attendanceSession.updateMany({
        where: { id: { in: sessions.map((session) => session.id) } },
        data: { status: 'REVOKED', leftAt: now, leftReason: 'INVITE_REVOKED' },
      });

      await tx.attendance.updateMany({
        where: { callId: call.id, participantId: invitation.participantId, status: 'ACTIVE' },
        data: { status: 'COMPLETED', lastLeftAt: now },
      });

      await auditService.record(
        {
          action: AuditAction.INVITATION_REVOKED,
          outcome: 'SUCCESS',
          actorUserId,
          callId: call.id,
          invitationId,
          requestId: context.requestId,
          ipAddress: context.ipAddress ?? null,
          userAgent: context.userAgent ?? null,
          metadata: {
            participantId: invitation.participantId,
            terminatedSessions: sessions.length,
          },
        },
        tx,
      );

      if (sessions.length > 0) {
        await auditService.record(
          {
            action: AuditAction.FORCED_DISCONNECT,
            outcome: 'SUCCESS',
            actorUserId,
            callId: call.id,
            invitationId,
            requestId: context.requestId,
            metadata: { sessionCount: sessions.length },
          },
          tx,
        );
      }

      return { changed: true, revokedAt: now, sessions };
    });

    // Sessions were force-closed above, so the participant's connected time
    // must be recalculated from the union of their (now closed) intervals.
    const affectedAttendanceIds = new Set((outcome.sessions ?? []).map((s) => s.attendanceId));
    for (const attendanceId of affectedAttendanceIds) {
      await recomputeAttendanceTotals(attendanceId, outcome.revokedAt).catch((error) =>
        logger.error({ err: error, attendanceId }, 'failed to recompute attendance after revoke'),
      );
    }

    // --- post-commit side effects --------------------------------------------
    // Application authorization is already revoked and durable. Everything
    // below is best-effort propagation; failure here never un-revokes.
    if (outcome.changed) {
      await publishInvitationRevoked({
        callId: call.id,
        invitationId,
        participantId: invitation.participantId,
        revokedAt: outcome.revokedAt,
      });

      for (const session of outcome.sessions ?? []) {
        if (!session.providerSessionId) continue;
        await enqueueProviderCleanup({
          callId: call.id,
          invitationId,
          providerCallId: call.providerCallId,
          providerSessionId: session.providerSessionId,
          reason: 'REVOKED',
          requestId: context.requestId,
        }).catch((error) =>
          logger.error({ err: error, invitationId }, 'failed to enqueue provider cleanup'),
        );
      }
    }

    return {
      invitationId,
      status: 'REVOKED',
      revokedAt: outcome.revokedAt.toISOString(),
    };
  },

  /** Reconciles invitations whose expiry has passed. Safe to run repeatedly. */
  async expireOverdue(now: Date, batchSize = 200): Promise<number> {
    const expired = await invitationRepository.expireOverdue(now, batchSize);

    for (const invitation of expired) {
      auditService.recordDetached({
        action: AuditAction.INVITATION_EXPIRED,
        outcome: 'SUCCESS',
        callId: invitation.callId,
        invitationId: invitation.id,
        requestId: 'scheduler',
      });
    }

    return expired.length;
  },
};
