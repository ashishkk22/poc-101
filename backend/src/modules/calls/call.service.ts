import { type CallStatus } from '../../generated/prisma/enums.js';
import { prisma } from '../../infrastructure/database/prisma.js';
import { logger } from '../../infrastructure/logger/logger.js';
import { enqueueProviderCleanup, enqueueTranscript } from '../../infrastructure/queue/queues.js';
import { recordProviderTiming } from '../../infrastructure/telemetry/otel.js';
import { AppError, ErrorCode } from '../../shared/errors/index.js';
import { buildPage } from '../../shared/http/pagination.js';
import { type RequestContext } from '../../shared/http/request-context.js';
import { type Clock, systemClock } from '../../shared/time/clock.js';
import { AuditAction } from '../audit/audit.actions.js';
import { auditService } from '../audit/audit.service.js';
import { authorizeCallManage, authorizeCallRead, unwrap } from '../access/index.js';
import { meetingProvider } from '../provider/index.js';
import { publishCallEnded } from '../realtime/publisher.js';
import { assertCancellable, assertTransition, expectedStatusAt } from './call.domain.js';
import { toCallDto, type CallDto } from './call.dto.js';
import { callRepository } from './call.repository.js';
import { type CreateCallInput, type ListCallsQuery } from './call.schemas.js';

export interface CallServiceDeps {
  clock: Clock;
}

const defaultDeps: CallServiceDeps = { clock: systemClock };

export const callService = {
  /**
   * Creates a scheduled call owned by the authenticated caller.
   *
   * The provider meeting is created after the database row commits: a provider
   * outage must not prevent a call from being scheduled, and the meeting can
   * be (re)created lazily when the first participant joins.
   */
  async create(
    actorUserId: string,
    input: CreateCallInput,
    context: RequestContext,
    deps: CallServiceDeps = defaultDeps,
  ): Promise<CallDto> {
    const scheduledStart = new Date(input.scheduledStart);
    const scheduledEnd = new Date(input.scheduledEnd);

    if (scheduledEnd.getTime() <= scheduledStart.getTime()) {
      throw new AppError(ErrorCode.VALIDATION_ERROR, {
        message: 'scheduledEnd must be after scheduledStart.',
      });
    }

    const call = await prisma.$transaction(async (tx) => {
      const created = await callRepository.create(
        {
          organizerId: actorUserId,
          title: input.title,
          scheduledStart,
          scheduledEnd,
          timezone: input.timezone,
        },
        tx,
      );

      await auditService.record(
        {
          action: AuditAction.CALL_CREATED,
          outcome: 'SUCCESS',
          actorUserId,
          callId: created.id,
          requestId: context.requestId,
          ipAddress: context.ipAddress ?? null,
          userAgent: context.userAgent ?? null,
          metadata: {
            scheduledStart: scheduledStart.toISOString(),
            scheduledEnd: scheduledEnd.toISOString(),
            timezone: input.timezone,
          },
        },
        tx,
      );

      return created;
    });

    await this.ensureProviderMeeting(call.id, deps).catch((error) => {
      logger.warn({ err: error, callId: call.id }, 'provider meeting creation deferred');
    });

    return toCallDto(call);
  },

  /**
   * Lazily creates the provider-side meeting.
   *
   * Idempotent: if `providerCallId` is already set it is returned unchanged,
   * so a retry cannot spawn a second meeting.
   */
  async ensureProviderMeeting(
    callId: string,
    _deps: CallServiceDeps = defaultDeps,
  ): Promise<string> {
    const call = await callRepository.findById(callId);
    if (!call) throw new AppError(ErrorCode.CALL_NOT_FOUND);
    if (call.providerCallId) return call.providerCallId;

    const startedAt = Date.now();
    try {
      const result = await meetingProvider.createMeeting({
        callId: call.id,
        title: call.title,
        scheduledStart: call.scheduledStart,
        scheduledEnd: call.scheduledEnd,
      });
      recordProviderTiming('createMeeting', Date.now() - startedAt, 'SUCCESS');

      const updated = await callRepository.setProviderCallId(call.id, result.providerCallId);
      return updated.providerCallId as string;
    } catch (error) {
      recordProviderTiming('createMeeting', Date.now() - startedAt, 'FAILURE');
      throw error;
    }
  },

  async getById(actorUserId: string, callId: string): Promise<CallDto> {
    const { call } = unwrap(await authorizeCallRead({ userId: actorUserId, callId }));
    const record = await callRepository.findById(call.id);
    if (!record) throw new AppError(ErrorCode.CALL_NOT_FOUND);
    return toCallDto(record);
  },

  async list(
    actorUserId: string,
    query: ListCallsQuery,
  ): Promise<{ items: CallDto[]; nextCursor: string | null }> {
    const rows = await callRepository.list({
      userId: actorUserId,
      role: query.role,
      status: query.status as CallStatus | undefined,
      startAfter: query.startAfter ? new Date(query.startAfter) : undefined,
      startBefore: query.startBefore ? new Date(query.startBefore) : undefined,
      limit: query.limit,
      cursor: query.cursor,
    });

    const page = buildPage(rows, query.limit, (row) => row.scheduledStart);
    return { items: page.items.map(toCallDto), nextCursor: page.nextCursor };
  },

  /**
   * Cancels a call.
   *
   * Invitation rows are deliberately left untouched so the audit history stays
   * intact; the join policy rejects on call status instead.
   */
  async cancel(
    actorUserId: string,
    callId: string,
    context: RequestContext,
    deps: CallServiceDeps = defaultDeps,
  ): Promise<CallDto> {
    const { call } = unwrap(await authorizeCallManage({ userId: actorUserId, callId }));
    assertCancellable(call.status);

    const now = deps.clock.now();

    const updated = await prisma.$transaction(async (tx) => {
      const locked = await tx.call.findUnique({ where: { id: callId } });
      if (!locked) throw new AppError(ErrorCode.CALL_NOT_FOUND);
      assertCancellable(locked.status);
      assertTransition(locked.status, 'CANCELLED');

      const result = await callRepository.updateStatus(
        callId,
        'CANCELLED',
        { cancelledAt: now },
        tx,
      );

      await tx.attendanceSession.updateMany({
        where: { attendance: { callId }, status: 'CONNECTED' },
        data: { status: 'CALL_ENDED', leftAt: now, leftReason: 'CALL_CANCELLED' },
      });

      await auditService.record(
        {
          action: AuditAction.CALL_CANCELLED,
          outcome: 'SUCCESS',
          actorUserId,
          callId,
          requestId: context.requestId,
          ipAddress: context.ipAddress ?? null,
          userAgent: context.userAgent ?? null,
        },
        tx,
      );

      return result;
    });

    // Durable state is committed; external side effects follow and are retried
    // by the cleanup queue if they fail.
    await publishCallEnded({ callId, reason: 'CANCELLED' });
    if (updated.providerCallId) {
      await enqueueProviderCleanup({
        callId,
        providerCallId: updated.providerCallId,
        providerSessionId: null,
        reason: 'CALL_ENDED',
        requestId: context.requestId,
      });
    }

    return toCallDto(updated);
  },

  /** Ends a live call and queues transcript generation. */
  async end(
    actorUserId: string,
    callId: string,
    context: RequestContext,
    deps: CallServiceDeps = defaultDeps,
  ): Promise<CallDto> {
    const { call } = unwrap(await authorizeCallManage({ userId: actorUserId, callId }));
    if (call.status === 'ENDED') {
      const existing = await callRepository.findById(callId);
      return toCallDto(existing!);
    }
    assertTransition(call.status, 'ENDED');

    const updated = await this.transitionToEnded(callId, deps.clock.now(), actorUserId, context);
    return toCallDto(updated);
  },

  /**
   * Shared ENDED transition used by both the organizer endpoint and the
   * lifecycle scheduler. Closing attendance sessions and writing the audit row
   * happen in the same transaction as the status change.
   */
  async transitionToEnded(
    callId: string,
    now: Date,
    actorUserId: string | null,
    context: Pick<RequestContext, 'requestId'>,
  ) {
    const updated = await prisma.$transaction(async (tx) => {
      const current = await tx.call.findUnique({ where: { id: callId } });
      if (!current) throw new AppError(ErrorCode.CALL_NOT_FOUND);
      if (current.status === 'ENDED' || current.status === 'CANCELLED') return current;

      const result = await callRepository.updateStatus(callId, 'ENDED', { endedAt: now }, tx);

      await tx.attendanceSession.updateMany({
        where: { attendance: { callId }, status: 'CONNECTED' },
        data: { status: 'CALL_ENDED', leftAt: now, leftReason: 'CALL_ENDED' },
      });
      await tx.attendance.updateMany({
        where: { callId, status: 'ACTIVE' },
        data: { status: 'COMPLETED', lastLeftAt: now },
      });

      await auditService.record(
        {
          action: AuditAction.CALL_ENDED,
          outcome: 'SUCCESS',
          actorUserId,
          callId,
          requestId: context.requestId,
        },
        tx,
      );

      return result;
    });

    await publishCallEnded({ callId, reason: 'ENDED' });

    if (updated.status === 'ENDED') {
      await enqueueTranscript({ callId, requestId: context.requestId }).catch((error) =>
        logger.error({ err: error, callId }, 'failed to enqueue transcript job'),
      );
      if (updated.providerCallId) {
        await enqueueProviderCleanup({
          callId,
          providerCallId: updated.providerCallId,
          providerSessionId: null,
          reason: 'CALL_ENDED',
          requestId: context.requestId,
        }).catch(() => undefined);
      }
    }

    return updated;
  },

  /**
   * Scheduler sweep.
   *
   * Advancing status is a convenience for clients and reporting only —
   * authorization never depends on it, so a delayed sweep cannot leave a call
   * joinable past its scheduled end.
   */
  async advanceLifecycle(now: Date, batchSize = 100): Promise<{ toLive: number; toEnded: number }> {
    const candidates = await callRepository.findLifecycleCandidates(now, batchSize);
    let toLive = 0;
    let toEnded = 0;

    for (const call of candidates) {
      const expected = expectedStatusAt(call, call.status, now);
      if (expected === call.status) continue;

      if (expected === 'LIVE') {
        await callRepository.updateStatus(call.id, 'LIVE');
        toLive += 1;
      } else if (expected === 'ENDED') {
        await this.transitionToEnded(call.id, now, null, { requestId: 'scheduler' });
        toEnded += 1;
      }
    }

    return { toLive, toEnded };
  },
};
