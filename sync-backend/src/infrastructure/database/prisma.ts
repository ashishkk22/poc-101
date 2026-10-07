import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client.js';
import { env, isProduction } from '../../config/env.js';
import { logger } from '../logger/logger.js';

/**
 * PostgreSQL is the authoritative store for every authorization decision.
 *
 * Prisma 7 requires a driver adapter; the connection string lives in the
 * adapter rather than in schema.prisma.
 */
const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });

export const prisma = new PrismaClient({
  adapter,
  log: isProduction
    ? [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ]
    : [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
});

prisma.$on('warn', (event) => logger.warn({ prisma: event.message }, 'prisma warning'));
prisma.$on('error', (event) => logger.error({ prisma: event.message }, 'prisma error'));

export type PrismaClientType = typeof prisma;

/**
 * Anything that may run inside `prisma.$transaction(...)`.
 * Repositories accept this so services can compose them transactionally.
 */
export type PrismaTransactionClient = Omit<
  PrismaClientType,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'
>;

export type DbClient = PrismaClientType | PrismaTransactionClient;

export async function checkDatabase(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    logger.error({ err: error }, 'database readiness check failed');
    return false;
  }
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
