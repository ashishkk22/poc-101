import { env } from '../../config/env.js';
import { prisma } from '../../infrastructure/database/prisma.js';
import { logger } from '../../infrastructure/logger/logger.js';
import { recordProviderTiming } from '../../infrastructure/logger/timing.js';
import { AppError, ErrorCode } from '../../shared/errors/index.js';
import { type RequestContext } from '../../shared/http/request-context.js';
import { type Clock, systemClock } from '../../shared/time/clock.js';
import { addDays } from '../../shared/time/window.js';
import { authorizeTranscriptRead } from '../access/index.js';
import { AuditAction } from '../audit/audit.actions.js';
import { auditService } from '../audit/audit.service.js';
import { callRepository } from '../calls/call.repository.js';
import { ProviderError, transcriptionProvider } from '../provider/index.js';
import { toTranscriptDto, type TranscriptDto } from './transcript.dto.js';
import { transcriptRepository } from './transcript.repository.js';

export interface TranscriptServiceDeps {
  clock: Clock;
}

const defaultDeps: TranscriptServiceDeps = { clock: systemClock };

export function retentionExpiryFor(callEnd: Date): Date {
  return addDays(callEnd, env.TRANSCRIPT_RETENTION_DAYS);
}

export const transcriptService = {
  /**
   * Reads a transcript.
   *
   * Access is decided by the caller's relationship to the CALL, never by the
   * call ID alone — guessing an ID yields the same not-found shape an unknown
   * ID does, so the endpoint cannot be used to discover which calls exist.
   */
  async getForCall(
    actorUserId: string,
    callId: string,
    context: RequestContext,
  ): Promise<TranscriptDto> {
    const decision = await authorizeTranscriptRead({ userId: actorUserId, callId });

    if (!decision.allowed) {
      auditService.recordDetached({
        action: AuditAction.TRANSCRIPT_ACCESS_DENIED,
        outcome: 'DENIED',
        actorUserId,
        callId,
        requestId: context.requestId,
        ipAddress: context.ipAddress ?? null,
        metadata: { code: decision.code, reason: decision.reason },
      });
      throw new AppError(ErrorCode.RESOURCE_NOT_FOUND);
    }

    const transcript = await transcriptRepository.findForCall(callId);

    if (!transcript || transcript.status === 'PENDING' || transcript.status === 'PROCESSING') {
      throw new AppError(ErrorCode.TRANSCRIPT_NOT_READY);
    }
    if (transcript.status === 'FAILED') {
      throw new AppError(ErrorCode.TRANSCRIPT_NOT_READY, {
        message: 'Transcript generation did not succeed for this call.',
      });
    }
    if (transcript.status === 'DELETED') {
      throw new AppError(ErrorCode.RESOURCE_NOT_FOUND, {
        message: 'This transcript has been deleted under the retention policy.',
      });
    }

    auditService.recordDetached({
      action: AuditAction.TRANSCRIPT_ACCESS_GRANTED,
      outcome: 'SUCCESS',
      actorUserId,
      callId,
      requestId: context.requestId,
      metadata: { relation: decision.value.relation },
    });

    return toTranscriptDto(transcript, true);
  },

  /** Creates the PENDING row that the transcript job will later claim. */
  async ensureForCall(callId: string, deps: TranscriptServiceDeps = defaultDeps) {
    const call = await callRepository.findById(callId);
    if (!call) throw new AppError(ErrorCode.CALL_NOT_FOUND);

    const reference = call.endedAt ?? call.scheduledEnd ?? deps.clock.now();
    return transcriptRepository.ensureForCall(callId, retentionExpiryFor(reference));
  },

  /**
   * Generates a transcript. Invoked by the BullMQ worker and designed for
   * at-least-once delivery.
   *
   * The PENDING/FAILED -> PROCESSING claim is conditional, so a duplicate job
   * short-circuits instead of calling the provider twice. A provider failure
   * leaves the row FAILED and rethrows so BullMQ can retry with backoff;
   * attendance and invitation state are untouched either way.
   */
  async generate(
    callId: string,
    context: Pick<RequestContext, 'requestId'>,
    attempt: number,
    deps: TranscriptServiceDeps = defaultDeps,
  ): Promise<'READY' | 'SKIPPED'> {
    const call = await callRepository.findById(callId);
    if (!call) throw new AppError(ErrorCode.CALL_NOT_FOUND);

    const existing = await this.ensureForCall(callId, deps);
    if (existing.status === 'READY' || existing.status === 'DELETED') {
      logger.info({ callId, status: existing.status }, 'transcript already finalized; skipping');
      return 'SKIPPED';
    }

    const claimed = await transcriptRepository.claimForProcessing(callId);
    if (claimed === 0) {
      logger.info({ callId }, 'transcript already claimed by another worker; skipping');
      return 'SKIPPED';
    }

    const startedAt = Date.now();

    try {
      const result = await transcriptionProvider.getTranscript({
        providerCallId: call.providerCallId ?? `pcall_missing_${callId}`,
        callId,
        requestId: context.requestId,
      });
      recordProviderTiming('getTranscript', Date.now() - startedAt, 'SUCCESS');

      const reference = call.endedAt ?? call.scheduledEnd;

      await prisma.$transaction(async (tx) => {
        await transcriptRepository.markReady(
          callId,
          {
            content: result.content,
            generatedAt: result.generatedAt,
            expiresAt: retentionExpiryFor(reference),
          },
          tx,
        );

        await auditService.record(
          {
            action: AuditAction.TRANSCRIPT_READY,
            outcome: 'SUCCESS',
            callId,
            requestId: context.requestId,
            // Length only — transcript content is never logged or audited.
            metadata: { attempt, contentLength: result.content.length },
          },
          tx,
        );
      });

      return 'READY';
    } catch (error) {
      recordProviderTiming('getTranscript', Date.now() - startedAt, 'FAILURE');

      const category = error instanceof ProviderError ? error.category : 'UNKNOWN';
      await transcriptRepository.markFailed(callId, category);

      auditService.recordDetached({
        action: AuditAction.TRANSCRIPT_FAILED,
        outcome: 'FAILURE',
        callId,
        requestId: context.requestId,
        metadata: { attempt, category },
      });

      logger.error(
        { callId, attempt, category, requestId: context.requestId },
        'transcript generation failed',
      );

      throw error;
    }
  },
};
