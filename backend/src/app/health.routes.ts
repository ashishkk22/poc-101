import { Router } from 'express';
import { checkDatabase } from '../infrastructure/database/prisma.js';
import { checkRedis } from '../infrastructure/redis/redis.js';
import { asyncHandler } from '../shared/http/async-handler.js';

export const healthRouter: Router = Router();

/** Liveness. Deliberately does no I/O — it answers "is this process up?". */
healthRouter.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

/** Readiness. Checks dependencies without ever revealing connection details. */
healthRouter.get(
  '/ready',
  asyncHandler(async (_req, res) => {
    const [postgres, redisUp] = await Promise.all([checkDatabase(), checkRedis()]);
    const ready = postgres && redisUp;

    res.status(ready ? 200 : 503).json({
      status: ready ? 'ready' : 'not_ready',
      dependencies: {
        postgres: postgres ? 'up' : 'down',
        redis: redisUp ? 'up' : 'down',
      },
    });
  }),
);
