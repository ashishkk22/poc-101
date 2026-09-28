import { Worker, type Job } from 'bullmq';
import { QUEUE_NAMES } from '../config/constants.js';
import { logger } from '../infrastructure/logger/logger.js';
import { createQueueConnection } from '../infrastructure/redis/redis.js';
import { recordJobTiming } from '../infrastructure/telemetry/otel.js';
import { type RetentionJobData } from '../infrastructure/queue/queues.js';
import { retentionService } from '../modules/retention/retention.service.js';

/**
 * Retention.
 *
 * The handler makes no assumption that a previous attempt completed: both the
 * sweep and the targeted delete are conditional state transitions, so running
 * this job twice — or resuming after a worker restart — is safe.
 */
export function createRetentionWorker(): Worker<RetentionJobData> {
  const worker = new Worker<RetentionJobData>(
    QUEUE_NAMES.retention,
    async (job: Job<RetentionJobData>) => {
      const startedAt = Date.now();
      const requestId = job.data.requestId ?? `job-${job.id}`;

      try {
        const result = job.data.transcriptId
          ? {
              deleted: await retentionService.deleteTranscript(job.data.transcriptId, {
                requestId,
              }),
            }
          : await retentionService.runSweep({ requestId });

        recordJobTiming(QUEUE_NAMES.retention, job.name, Date.now() - startedAt, 'SUCCESS');
        return result;
      } catch (error) {
        recordJobTiming(QUEUE_NAMES.retention, job.name, Date.now() - startedAt, 'FAILURE');
        logger.error({ jobId: job.id, err: error }, 'retention job failed');
        throw error;
      }
    },
    { connection: createQueueConnection('retention-worker'), concurrency: 1 },
  );

  return worker;
}
