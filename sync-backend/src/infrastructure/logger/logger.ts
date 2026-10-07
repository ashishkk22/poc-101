import pino, { type Logger } from 'pino';
import { env, isProduction } from '../../config/env.js';

/**
 * Structured logging.
 *
 * The redaction list is a hard boundary: raw invitation tokens, cookies,
 * Authorization headers, passwords, provider keys and transcript content must
 * never reach a log sink. Code that needs to reference a token in a log line
 * uses `tokenFingerprint()` instead.
 */
const REDACTED_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'req.headers["set-cookie"]',
  'res.headers["set-cookie"]',
  'password',
  '*.password',
  'token',
  '*.token',
  'rawToken',
  '*.rawToken',
  'tokenHash',
  '*.tokenHash',
  'joinUrl',
  '*.joinUrl',
  'content',
  '*.content',
  'transcript',
  '*.transcript',
  'providerApiKey',
  '*.providerApiKey',
  'secret',
  '*.secret',
];

export const logger: Logger = pino({
  level: env.LOG_LEVEL,
  base: {
    service: 'sync-backend',
    env: env.NODE_ENV,
  },
  redact: {
    paths: REDACTED_PATHS,
    censor: '[redacted]',
  },
  formatters: {
    level: (label) => ({ level: label }),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(isProduction
    ? {}
    : {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname,service' },
        },
      }),
});

export function childLogger(bindings: Record<string, unknown>): Logger {
  return logger.child(bindings);
}
