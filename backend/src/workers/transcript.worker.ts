import { Worker, type Job } from 'bullmq';
import { QUEUE_NAMES } from '../config/constants.js';
import { logger } from '../infrastructure/logger/logger.js';
import { createQueueConnection } from '../infrastructure/redis/redis.js';
import { recordJobTiming } from '../infrastructure/logger/timing.js';
import { type TranscriptJobData } from '../infrastructure/queue/queues.js';
import { transcriptService } from '../modules/transcripts/transcript.service.js';

/**
 * Transcript generation.
 *
 * Retries use exponential backoff (BullMQ `attempts`/`backoff` are set on the
 * queue). Each attempt logs jobId, callId, attempt and an error CATEGORY —
 * never transcript content. After the final attempt the transcript row is left
 * FAILED, which is a terminal state a later manual retry can still claim.
 */
export function createTranscriptWorker(): Worker<TranscriptJobData> {
  const worker = new Worker<TranscriptJobData>(
    QUEUE_NAMES.transcript,
    async (job: Job<TranscriptJobData>) => {
      const startedAt = Date.now();
      const { callId, requestId } = job.data;

      try {
        const outcome = await transcriptService.generate(
          callId,
          { requestId: requestId ?? `job-${job.id}` },
          job.attemptsMade + 1,
        );
        recordJobTiming(QUEUE_NAMES.transcript, job.name, Date.now() - startedAt, 'SUCCESS');
        return outcome;
      } catch (error) {
        recordJobTiming(QUEUE_NAMES.transcript, job.name, Date.now() - startedAt, 'FAILURE');
        logger.error(
          {
            jobId: job.id,
            callId,
            attempt: job.attemptsMade + 1,
            maxAttempts: job.opts.attempts,
            errorCategory: error instanceof Error ? error.name : 'UNKNOWN',
          },
          'transcript job attempt failed',
        );
        throw error;
      }
    },
    { connection: createQueueConnection('transcript-worker'), concurrency: 4 },
  );

  worker.on('failed', (job, error) => {
    if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
      logger.error(
        { jobId: job.id, callId: job.data.callId, errorCategory: error.name },
        'transcript job exhausted all attempts',
      );
    }
  });

  return worker;
}
