import { type NextFunction, type Request, type Response } from 'express';
import { RateLimiterRedis, type RateLimiterRes } from 'rate-limiter-flexible';
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
} as const;

export type LimiterName = keyof typeof limiters;

/** Identity first, address second — an authenticated abuser is rate-limited per account. */
function limiterKey(req: Request): string {
  return req.user?.id ?? req.ip ?? 'unknown';
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
