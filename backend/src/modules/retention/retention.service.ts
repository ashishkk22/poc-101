import { logger } from '../../infrastructure/logger/logger.js';
import { type Clock, systemClock } from '../../shared/time/clock.js';
import { AuditAction } from '../audit/audit.actions.js';
import { auditService } from '../audit/audit.service.js';
import { captionLineRepository } from '../transcripts/caption-line.repository.js';
import { transcriptRepository } from '../transcripts/transcript.repository.js';

export interface RetentionResult {
  examined: number;
  deleted: number;
  skipped: number;
}

/**
 * Transcript retention.
 *
 * Deletion is expressed as a CONDITIONAL state transition (READY|FAILED ->
 * DELETED) rather than as an unconditional write. That is what makes the job
 * safe under BullMQ's at-least-once delivery: a retry, a duplicate schedule
 * or a worker that died mid-batch all converge on the same end state, and a
 * second pass over an already-DELETED transcript updates zero rows.
 *
 * Nothing here assumes a previous attempt completed.
 */
export const retentionService = {
  async runSweep(
    options: { batchSize?: number; clock?: Clock; requestId?: string } = {},
  ): Promise<RetentionResult> {
    const clock = options.clock ?? systemClock;
    const batchSize = options.batchSize ?? 100;
    const requestId = options.requestId ?? 'retention-sweep';
    const now = clock.now();

    const candidates = await transcriptRepository.findExpired(now, batchSize);
    let deleted = 0;
    let skipped = 0;

    for (const candidate of candidates) {
      const affected = await transcriptRepository.deleteContentIfEligible(candidate.id, now);

      if (affected === 0) {
        // Another worker got there first, or it was already deleted. No-op.
        skipped += 1;
        continue;
      }

      deleted += 1;

      // The spoken lines ARE the transcript's source. Deleting the assembled
      // text while leaving them behind would mean retention deleted nothing.
      const linesRemoved = await captionLineRepository.deleteForCall(candidate.callId);

      await auditService.record({
        action: AuditAction.TRANSCRIPT_DELETED,
        outcome: 'SUCCESS',
        callId: candidate.callId,
        requestId,
        metadata: {
          transcriptId: candidate.id,
          previousStatus: candidate.status,
          captionLinesRemoved: linesRemoved,
        },
      });
    }

    logger.info(
      { examined: candidates.length, deleted, skipped },
      'transcript retention sweep completed',
    );

    return { examined: candidates.length, deleted, skipped };
  },

  /** Targets a single transcript. Same conditional transition, same guarantees. */
  async deleteTranscript(
    transcriptId: string,
    options: { clock?: Clock; requestId?: string } = {},
  ): Promise<'DELETED' | 'NOOP'> {
    const clock = options.clock ?? systemClock;
    const transcript = await transcriptRepository.findById(transcriptId);
    if (!transcript) return 'NOOP';

    const affected = await transcriptRepository.deleteContentIfEligible(transcriptId, clock.now());
    if (affected === 0) return 'NOOP';

    await auditService.record({
      action: AuditAction.TRANSCRIPT_DELETED,
      outcome: 'SUCCESS',
      callId: transcript.callId,
      requestId: options.requestId ?? 'retention-targeted',
      metadata: { transcriptId },
    });

    return 'DELETED';
  },
};
