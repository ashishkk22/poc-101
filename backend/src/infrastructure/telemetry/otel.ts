import { env } from '../../config/env.js';
import { logger } from '../logger/logger.js';

/**
 * OpenTelemetry integration point.
 *
 * Tracing is opt-in via OTEL_EXPORTER_OTLP_ENDPOINT. The SDK is loaded lazily
 * so that a deployment without a collector carries neither the dependency
 * weight nor the startup cost.
 */
let shutdownFn: (() => Promise<void>) | null = null;

export async function initTelemetry(): Promise<void> {
  if (!env.OTEL_EXPORTER_OTLP_ENDPOINT) {
    logger.debug('opentelemetry disabled (no OTEL_EXPORTER_OTLP_ENDPOINT)');
    return;
  }

  try {
    const [{ NodeSDK }, { getNodeAutoInstrumentations }, { OTLPTraceExporter }] = await Promise.all(
      [
        import('@opentelemetry/sdk-node'),
        import('@opentelemetry/auto-instrumentations-node'),
        import('@opentelemetry/exporter-trace-otlp-http'),
      ],
    );

    const sdk = new NodeSDK({
      serviceName: env.OTEL_SERVICE_NAME,
      traceExporter: new OTLPTraceExporter({ url: `${env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces` }),
      instrumentations: [getNodeAutoInstrumentations()],
    });

    sdk.start();
    shutdownFn = () => sdk.shutdown();
    logger.info({ endpoint: env.OTEL_EXPORTER_OTLP_ENDPOINT }, 'opentelemetry started');
  } catch (error) {
    // Telemetry must never prevent the API from serving traffic.
    logger.warn(
      { err: error },
      'opentelemetry packages not installed; install @opentelemetry/sdk-node to enable tracing',
    );
  }
}

export async function shutdownTelemetry(): Promise<void> {
  if (!shutdownFn) return;
  await shutdownFn().catch((error) => logger.warn({ err: error }, 'otel shutdown failed'));
  shutdownFn = null;
}

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
