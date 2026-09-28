import { env } from '../../config/env.js';
import { logger } from '../logger/logger.js';

/**
 * Sentry integration point.
 *
 * The SDK is intentionally not a hard dependency — this module is the seam.
 * With SENTRY_DSN unset (the default) capture is a structured log line, so the
 * error path behaves identically with or without the vendor.
 */
type Capture = (error: unknown, context?: Record<string, unknown>) => void;

let capture: Capture = (error, context) => {
  logger.error({ err: error, ...context }, 'exception captured');
};

export function initSentry(): void {
  if (!env.SENTRY_DSN) {
    logger.debug('sentry disabled (no SENTRY_DSN)');
    return;
  }
  logger.info('sentry DSN configured; install @sentry/node and wire it in initSentry()');
}

export function setCaptureHandler(handler: Capture): void {
  capture = handler;
}

export function captureException(error: unknown, context?: Record<string, unknown>): void {
  capture(error, context);
}
