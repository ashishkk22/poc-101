import { logger } from './logger.js';

/** Records a provider call duration for latency dashboards. */
export function recordProviderTiming(
  operation: string,
  durationMs: number,
  outcome: 'SUCCESS' | 'FAILURE',
): void {
  logger.info({ metric: 'provider_call', operation, durationMs, outcome }, 'provider call');
}

/** Records queue job duration. */
export function recordJobTiming(
  queue: string,
  jobName: string,
  durationMs: number,
  outcome: 'SUCCESS' | 'FAILURE',
): void {
  logger.info({ metric: 'queue_job', queue, jobName, durationMs, outcome }, 'queue job');
}
