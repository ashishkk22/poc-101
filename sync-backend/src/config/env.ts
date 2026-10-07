import 'dotenv/config';
import { z } from 'zod';

/**
 * Typed, validated environment configuration.
 *
 * The process fails fast when required production configuration is missing or
 * malformed — a half-configured security boundary is worse than no boot.
 */

const booleanish = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0'])])
  .transform((value) => value === true || value === 'true' || value === '1');

const positiveInt = (fallback: number) => z.coerce.number().int().positive().default(fallback);

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: positiveInt(4000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

    BETTER_AUTH_SECRET: z.string().min(16, 'BETTER_AUTH_SECRET must be at least 16 characters'),
    BETTER_AUTH_URL: z.url(),

    FRONTEND_ORIGIN: z.string().min(1),
    JOIN_URL_BASE: z.string().min(1).optional(),

    PROVIDER_MODE: z.enum(['mock', 'live']).default('mock'),
    // `captions` assembles what participants actually said; `mock` returns
    // fixed sample dialogue and is only for tests.
    TRANSCRIPTION_MODE: z.enum(['captions', 'mock', 'live']).default('captions'),
    PROVIDER_FAILURE_MODE: z
      .enum([
        'HEALTHY',
        'SLOW',
        'JOIN_FAILURE',
        'CAPTION_FAILURE',
        'TRANSCRIPT_FAILURE',
        'REVOKE_FAILURE',
      ])
      .default('HEALTHY'),
    PROVIDER_SLOW_MS: positiveInt(2000),

    INVITATION_TTL_MINUTES_AFTER_END: z.coerce.number().int().min(0).default(60),
    TRANSCRIPT_RETENTION_DAYS: positiveInt(30),
    HEARTBEAT_TIMEOUT_SECONDS: positiveInt(90),

    RATE_LIMIT_ENABLED: booleanish.default(true),
    RATE_LIMIT_GLOBAL_POINTS: positiveInt(300),
    RATE_LIMIT_GLOBAL_DURATION_SECONDS: positiveInt(60),
    RATE_LIMIT_JOIN_POINTS: positiveInt(10),
    RATE_LIMIT_JOIN_DURATION_SECONDS: positiveInt(60),
    RATE_LIMIT_HEARTBEAT_POINTS: positiveInt(120),
    RATE_LIMIT_HEARTBEAT_DURATION_SECONDS: positiveInt(60),
    RATE_LIMIT_AUTH_POINTS: positiveInt(20),
    RATE_LIMIT_AUTH_DURATION_SECONDS: positiveInt(60),

    RUN_WORKERS_IN_API_PROCESS: booleanish.default(false),

    // Built frontend to serve from this process, so the SPA and the API share
    // one origin. Unset in development, where Vite serves the frontend.
    WEB_DIST_DIR: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV !== 'production') return;

    if (value.BETTER_AUTH_SECRET.startsWith('change-me')) {
      ctx.addIssue({
        code: 'custom',
        path: ['BETTER_AUTH_SECRET'],
        message: 'BETTER_AUTH_SECRET must be replaced with a real secret in production',
      });
    }
    if (value.PROVIDER_FAILURE_MODE !== 'HEALTHY') {
      ctx.addIssue({
        code: 'custom',
        path: ['PROVIDER_FAILURE_MODE'],
        message: 'Provider failure injection is a development/test-only facility',
      });
    }
    if (value.FRONTEND_ORIGIN === '*') {
      ctx.addIssue({
        code: 'custom',
        path: ['FRONTEND_ORIGIN'],
        message: 'Wildcard CORS origin is not permitted with credentialed requests',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    // Logger is not available yet at this point in the boot sequence.
    console.error(`Invalid environment configuration:\n${details}`);
    throw new Error('Invalid environment configuration');
  }

  return parsed.data;
}

export const env: Env = loadEnv();

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';
export const isDevelopment = env.NODE_ENV === 'development';

/** Origins accepted by CORS. Comma-separated FRONTEND_ORIGIN is supported. */
export const allowedOrigins = env.FRONTEND_ORIGIN.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export const joinUrlBase = env.JOIN_URL_BASE ?? allowedOrigins[0] ?? env.BETTER_AUTH_URL;
