import { type NextFunction, type Request, type Response } from 'express';
import { RateLimiterRedis, type RateLimiterRes } from 'rate-limiter-flexible';
import { AUTH_BASE_PATH } from '../../config/constants.js';
import { env } from '../../config/env.js';
import { redis } from '../../infrastructure/redis/redis.js';
import { AppError, ErrorCode } from '../../shared/errors/index.js';
import { auditService } from '../../modules/audit/audit.service.js';
import { AuditAction } from '../../modules/audit/audit.actions.js';

/**
 * Redis-backed rate limiting.
 *
 * The join limiter is deliberately tight: it is the only endpoint where an
 * attacker can guess an opaque credential, so the cost of guessing must stay
 * high even though the token space already makes it infeasible.
 */
function createLimiter(keyPrefix: string, points: number, duration: number): RateLimiterRedis {
  return new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: `rl:${keyPrefix}`,
    points,
    duration,
    blockDuration: duration,
  });
}

const limiters = {
  global: createLimiter(
    'global',
    env.RATE_LIMIT_GLOBAL_POINTS,
    env.RATE_LIMIT_GLOBAL_DURATION_SECONDS,
  ),
  join: createLimiter('join', env.RATE_LIMIT_JOIN_POINTS, env.RATE_LIMIT_JOIN_DURATION_SECONDS),
  heartbeat: createLimiter(
    'heartbeat',
    env.RATE_LIMIT_HEARTBEAT_POINTS,
    env.RATE_LIMIT_HEARTBEAT_DURATION_SECONDS,
  ),
  auth: createLimiter('auth', env.RATE_LIMIT_AUTH_POINTS, env.RATE_LIMIT_AUTH_DURATION_SECONDS),
  revoke: createLimiter('revoke', 60, 60),
  transcript: createLimiter('transcript', 60, 60),
  /**
   * Reading or ending your own session.
   *
   * Deliberately generous. This budget is NOT a defence against credential
   * guessing — nothing here accepts a credential — and sharing the tight
   * `auth` budget with it meant a browser checking whether it was still
   * signed in could lock its own user out of signing in.
   */
  session: createLimiter('session', 120, 60),
} as const;

export type LimiterName = keyof typeof limiters;

/** Identity first, address second — an authenticated abuser is rate-limited per account. */
function limiterKey(req: Request): string {
  return req.user?.id ?? req.ip ?? 'unknown';
}

/**
 * Endpoints that accept a secret, and therefore deserve the tight budget.
 *
 * Everything else under the auth surface — reading the current session,
 * signing out — is ordinary traffic a signed-in browser makes on its own.
 */
const CREDENTIAL_PATHS = [
  '/sign-in',
  '/sign-up',
  '/forget-password',
  '/reset-password',
  '/change-password',
  '/change-email',
  '/verify-email',
  '/two-factor',
] as const;

/** Whether a request under the auth surface is submitting a secret. */
export function isCredentialPath(fullPath: string): boolean {
  const path = fullPath.startsWith(AUTH_BASE_PATH)
    ? fullPath.slice(AUTH_BASE_PATH.length)
    : fullPath;

  return CREDENTIAL_PATHS.some((prefix) => path.startsWith(prefix));
}

/**
 * Picks the budget by what the request is actually doing.
 *
 * Guessing a password stays expensive; asking "am I still signed in?" does not
 * consume the same allowance.
 */
export function authRateLimit() {
  const tight = rateLimit('auth');
  const generous = rateLimit('session');

  return (req: Request, res: Response, next: NextFunction): void => {
    (isCredentialPath(req.path) ? tight : generous)(req, res, next);
  };
}

export function rateLimit(name: LimiterName) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!env.RATE_LIMIT_ENABLED) {
      next();
      return;
    }

    try {
      const result = await limiters[name].consume(limiterKey(req));
      res.setHeader('X-RateLimit-Remaining', String(result.remainingPoints));
      next();
    } catch (error) {
      if (error instanceof Error) {
        // Redis outage: fail open rather than locking every user out.
        next();
        return;
      }

      const limiterRes = error as RateLimiterRes;
      res.setHeader('Retry-After', String(Math.ceil(limiterRes.msBeforeNext / 1000)));

      auditService.recordDetached({
        action: AuditAction.RATE_LIMITED,
        outcome: 'FAILURE',
        actorUserId: req.user?.id ?? null,
        requestId: req.requestId,
        ipAddress: req.ip ?? null,
        metadata: { limiter: name },
      });

      next(new AppError(ErrorCode.RATE_LIMITED));
    }
  };
}

/** Test helper: clears counters so limits do not leak between test cases. */
export async function resetRateLimits(): Promise<void> {
  const keys = await redis.keys('rl:*');
  if (keys.length > 0) await redis.del(...keys);
}
