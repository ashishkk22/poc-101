import { Redis, type RedisOptions } from 'ioredis';
import { env } from '../../config/env.js';
import { logger } from '../logger/logger.js';

/**
 * Redis carries realtime fan-out, rate-limit counters and BullMQ.
 *
 * It is never the only copy of invitation status, call authorization,
 * transcript ownership or attendance history.
 */
const baseOptions: RedisOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  lazyConnect: false,
  retryStrategy: (attempt) => Math.min(attempt * 200, 5000),
};

function createConnection(role: string, options: RedisOptions = {}): Redis {
  const connection = new Redis(env.REDIS_URL, { ...baseOptions, ...options });
  connection.on('error', (error) => logger.error({ err: error, role }, 'redis connection error'));
  connection.on('reconnecting', () => logger.warn({ role }, 'redis reconnecting'));
  return connection;
}

/** General-purpose client: rate limiting, ephemeral state, publishing. */
export const redis = createConnection('primary');

let subscriberConnection: Redis | null = null;

/** A subscriber connection cannot issue normal commands, so it is separate. */
export function getSubscriber(): Redis {
  subscriberConnection ??= createConnection('subscriber');
  return subscriberConnection;
}

/** BullMQ requires its own connection with `maxRetriesPerRequest: null`. */
export function createQueueConnection(role: string): Redis {
  return createConnection(role);
}

export async function checkRedis(): Promise<boolean> {
  try {
    const reply = await redis.ping();
    return reply === 'PONG';
  } catch (error) {
    logger.error({ err: error }, 'redis readiness check failed');
    return false;
  }
}

export async function disconnectRedis(): Promise<void> {
  await Promise.allSettled([
    redis.quit(),
    subscriberConnection ? subscriberConnection.quit() : Promise.resolve(),
  ]);
}
