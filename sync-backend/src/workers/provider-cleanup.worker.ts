import { Worker, type Job } from 'bullmq';
import { QUEUE_NAMES } from '../config/constants.js';
import { logger } from '../infrastructure/logger/logger.js';
import { createQueueConnection } from '../infrastructure/redis/redis.js';
import { recordJobTiming } from '../infrastructure/logger/timing.js';
import { type ProviderCleanupJobData } from '../infrastructure/queue/queues.js';
import { AuditAction } from '../modules/audit/audit.actions.js';
import { auditService } from '../modules/audit/audit.service.js';
import { meetingProvider, ProviderError } from '../modules/provider/index.js';

/**
 * Provider-side cleanup, retried independently of application state.
 *
 * By the time a job lands here the database already reflects the decision —
 * the invitation is REVOKED, or the call is ENDED. Failing to reach the
 * provider therefore cannot reactivate anything; it only delays teardown of
 * the media session, which this queue keeps retrying.
 */
export function createProviderCleanupWorker(): Worker<ProviderCleanupJobData> {
  return new Worker<ProviderCleanupJobData>(
    QUEUE_NAMES.providerCleanup,
    async (job: Job<ProviderCleanupJobData>) => {
      const startedAt = Date.now();
      const { providerSessionId, providerCallId, reason, callId, invitationId } = job.data;

      try {
        if (providerSessionId) {
          await meetingProvider.revokeParticipantSession({
            providerCallId,
            providerSessionId,
            reason,
            requestId: job.data.requestId,
          });
        } else if (providerCallId) {
          await meetingProvider.endMeeting({
            providerCallId,
            reason,
            requestId: job.data.requestId,
          });
        }

        recordJobTiming(QUEUE_NAMES.providerCleanup, job.name, Date.now() - startedAt, 'SUCCESS');
        return { cleaned: true };
      } catch (error) {
        recordJobTiming(QUEUE_NAMES.providerCleanup, job.name, Date.now() - startedAt, 'FAILURE');

        auditService.recordDetached({
          action: AuditAction.PROVIDER_FAILURE,
          outcome: 'FAILURE',
          callId,
          invitationId: invitationId ?? null,
          requestId: job.data.requestId ?? `job-${job.id}`,
          metadata: {
            operation: providerSessionId ? 'revokeParticipantSession' : 'endMeeting',
            category: error instanceof ProviderError ? error.category : 'UNKNOWN',
            attempt: job.attemptsMade + 1,
          },
        });

        logger.error(
          { jobId: job.id, callId, attempt: job.attemptsMade + 1 },
          'provider cleanup attempt failed; will retry',
        );
        throw error;
      }
    },
    { connection: createQueueConnection('provider-cleanup-worker'), concurrency: 4 },
  );
}
