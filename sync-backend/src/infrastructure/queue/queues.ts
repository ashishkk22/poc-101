import { Queue, type JobsOptions } from 'bullmq';
import { QUEUE_NAMES } from '../../config/constants.js';
import { createQueueConnection } from '../redis/redis.js';
import { logger } from '../logger/logger.js';

/**
 * Asynchronous work.
 *
 * Every job carries a deterministic job ID where a duplicate would be
 * meaningless, and every handler is written to be idempotent, because BullMQ
 * retries are at-least-once.
 */
export const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 2000 },
  removeOnComplete: { age: 3600, count: 1000 },
  removeOnFail: { age: 24 * 3600, count: 1000 },
};

export interface TranscriptJobData {
  callId: string;
  requestId?: string;
}

export interface RetentionJobData {
  /** Absent for the sweep job, present when a single transcript is targeted. */
  transcriptId?: string;
  requestId?: string;
}

export interface ProviderCleanupJobData {
  providerCallId: string | null;
  providerSessionId: string | null;
  reason: 'REVOKED' | 'ORPHANED_SESSION' | 'CALL_ENDED';
  callId: string;
  invitationId?: string;
  requestId?: string;
}

export interface CallLifecycleJobData {
  requestId?: string;
}

const connection = createQueueConnection('queues');

export const transcriptQueue = new Queue<TranscriptJobData>(QUEUE_NAMES.transcript, {
  connection,
  defaultJobOptions: { ...defaultJobOptions, attempts: 5 },
});

export const retentionQueue = new Queue<RetentionJobData>(QUEUE_NAMES.retention, {
  connection,
  defaultJobOptions,
});

export const providerCleanupQueue = new Queue<ProviderCleanupJobData>(QUEUE_NAMES.providerCleanup, {
  connection,
  defaultJobOptions: { ...defaultJobOptions, attempts: 10 },
});

export const callLifecycleQueue = new Queue<CallLifecycleJobData>(QUEUE_NAMES.callLifecycle, {
  connection,
  defaultJobOptions: { ...defaultJobOptions, attempts: 1 },
});

/** Deterministic job IDs — a retry or duplicate enqueue collapses to one job. */
export const jobIds = {
  transcript: (callId: string) => `transcript-call-${callId}`,
  retentionTranscript: (transcriptId: string) => `retention-transcript-${transcriptId}`,
  providerCleanup: (sessionOrCallId: string, reason: string) =>
    `provider-cleanup-${reason}-${sessionOrCallId}`,
} as const;

export async function enqueueTranscript(data: TranscriptJobData): Promise<void> {
  await transcriptQueue.add('generate', data, { jobId: jobIds.transcript(data.callId) });
}

export async function enqueueRetentionSweep(data: RetentionJobData = {}): Promise<void> {
  await retentionQueue.add('sweep', data);
}

export async function enqueueProviderCleanup(data: ProviderCleanupJobData): Promise<void> {
  const key = data.providerSessionId ?? data.providerCallId ?? data.callId;
  await providerCleanupQueue.add('cleanup', data, {
    jobId: jobIds.providerCleanup(key, data.reason),
  });
}

/**
 * Repeatable schedules owned by the worker process.
 *
 * `upsertJobScheduler` is idempotent, so every worker replica can call this on
 * boot without multiplying the schedule.
 */
export async function registerRepeatableJobs(): Promise<void> {
  await retentionQueue.upsertJobScheduler(
    'retention-sweep',
    { pattern: '0 * * * *' },
    { name: 'sweep', data: {} },
  );
  await callLifecycleQueue.upsertJobScheduler(
    'call-lifecycle-tick',
    { pattern: '* * * * *' },
    { name: 'tick', data: {} },
  );
  logger.info('repeatable jobs registered');
}

export async function closeQueues(): Promise<void> {
  await Promise.allSettled([
    transcriptQueue.close(),
    retentionQueue.close(),
    providerCleanupQueue.close(),
    callLifecycleQueue.close(),
  ]);
  await connection.quit().catch(() => undefined);
}
