import { type Worker } from 'bullmq';
import { disconnectDatabase } from '../infrastructure/database/prisma.js';
import { logger } from '../infrastructure/logger/logger.js';
import { closeQueues, registerRepeatableJobs } from '../infrastructure/queue/queues.js';
import { disconnectRedis } from '../infrastructure/redis/redis.js';
import { createCallLifecycleWorker } from './call-lifecycle.worker.js';
import { createProviderCleanupWorker } from './provider-cleanup.worker.js';
import { createRetentionWorker } from './retention.worker.js';
import { createTranscriptWorker } from './transcript.worker.js';

/**
 * Worker process.
 *
 * Runs separately from the API so that a long transcript job cannot compete
 * with request latency, and so the two can be scaled independently.
 */
let workers: Worker[] = [];

export async function startWorkers(): Promise<Worker[]> {
  if (workers.length > 0) return workers;

  workers = [
    createTranscriptWorker(),
    createRetentionWorker(),
    createProviderCleanupWorker(),
    createCallLifecycleWorker(),
  ];

  await registerRepeatableJobs();
  logger.info({ count: workers.length }, 'workers started');
  return workers;
}

export async function stopWorkers(): Promise<void> {
  // `close()` waits for in-flight jobs to finish before releasing the lock.
  await Promise.allSettled(workers.map((worker) => worker.close()));
  workers = [];
}

async function main(): Promise<void> {
  await startWorkers();

  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'worker shutdown initiated');

    const forceExit = setTimeout(() => process.exit(1), 30_000);
    forceExit.unref();

    try {
      await stopWorkers();
      await closeQueues();
      await disconnectRedis();
      await disconnectDatabase();
      logger.info('worker shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error({ err: error }, 'error during worker shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

// Only auto-start when executed directly, so the API can import startWorkers.
const isEntrypoint = process.argv[1]?.includes('worker');
if (isEntrypoint && !process.env.VITEST) {
  main().catch((error) => {
    logger.fatal({ err: error }, 'failed to start workers');
    process.exit(1);
  });
}
