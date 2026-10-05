import { createServer } from 'node:http';
import { env } from '../config/env.js';
import { disconnectDatabase } from '../infrastructure/database/prisma.js';
import { logger } from '../infrastructure/logger/logger.js';
import { closeQueues } from '../infrastructure/queue/queues.js';
import { disconnectRedis } from '../infrastructure/redis/redis.js';
import {
  closeRealtimeGateway,
  createRealtimeGateway,
} from '../modules/realtime/realtime.gateway.js';
import { startWorkers, stopWorkers } from '../workers/worker.js';
import { createApp } from './app.js';

async function main(): Promise<void> {
  const app = createApp();
  const httpServer = createServer(app);

  createRealtimeGateway(httpServer);

  if (env.RUN_WORKERS_IN_API_PROCESS) {
    // Single-process convenience for local development only; production runs
    // the worker as its own container.
    await startWorkers();
  }

  httpServer.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'timebound-meet api listening');
  });

  /**
   * Graceful shutdown.
   *
   * Stop accepting connections, let in-flight requests finish, then unwind
   * dependencies in reverse order of acquisition. Nothing is killed abruptly,
   * so no request is cut off mid-transaction.
   */
  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutdown initiated');

    const forceExit = setTimeout(() => {
      logger.error('graceful shutdown timed out; forcing exit');
      process.exit(1);
    }, 20_000);
    forceExit.unref();

    try {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      if (env.RUN_WORKERS_IN_API_PROCESS) await stopWorkers();
      await closeRealtimeGateway();
      await closeQueues();
      await disconnectRedis();
      await disconnectDatabase();
      logger.info('shutdown complete');
      clearTimeout(forceExit);
      process.exit(0);
    } catch (error) {
      logger.error({ err: error }, 'error during shutdown');
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    logger.error({ err: reason }, 'unhandled promise rejection');
  });
  process.on('uncaughtException', (error) => {
    logger.fatal({ err: error }, 'uncaught exception');
    void shutdown('uncaughtException');
  });
}

main().catch((error) => {
  logger.fatal({ err: error }, 'failed to start api');
  process.exit(1);
});
