import { Worker, type Job } from 'bullmq';
import { QUEUE_NAMES } from '../config/constants.js';
import { env } from '../config/env.js';
import { logger } from '../infrastructure/logger/logger.js';
import { createQueueConnection } from '../infrastructure/redis/redis.js';
import { type CallLifecycleJobData } from '../infrastructure/queue/queues.js';
import { systemClock } from '../shared/time/clock.js';
import { attendanceService } from '../modules/attendance/attendance.service.js';
import { callService } from '../modules/calls/call.service.js';
import { invitationService } from '../modules/invitations/invitation.service.js';

/**
 * Housekeeping tick.
 *
 * Everything this worker does is RECONCILIATION, not enforcement: it advances
 * stored statuses, marks overdue invitations EXPIRED and reaps sessions whose
 * heartbeats stopped. Authorization already rejects on the clock, so a late or
 * failed tick can never leave a call joinable past its scheduled end.
 */
export function createCallLifecycleWorker(): Worker<CallLifecycleJobData> {
  return new Worker<CallLifecycleJobData>(
    QUEUE_NAMES.callLifecycle,
    async (_job: Job<CallLifecycleJobData>) => {
      const now = systemClock.now();

      const [lifecycle, expired, reaped] = await Promise.all([
        callService.advanceLifecycle(now),
        invitationService.expireOverdue(now),
        attendanceService.reapStaleSessions(now, env.HEARTBEAT_TIMEOUT_SECONDS),
      ]);

      if (lifecycle.toLive || lifecycle.toEnded || expired || reaped) {
        logger.info(
          { ...lifecycle, expiredInvitations: expired, reapedSessions: reaped },
          'lifecycle tick',
        );
      }

      return { ...lifecycle, expired, reaped };
    },
    { connection: createQueueConnection('call-lifecycle-worker'), concurrency: 1 },
  );
}
