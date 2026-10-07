import { prisma } from '../../src/infrastructure/database/prisma.js';

/**
 * Truncates application tables between tests.
 *
 * TRUNCATE ... CASCADE is used rather than deleteMany so that foreign keys and
 * identity state reset together, and so a test can never observe a half-empty
 * database.
 */
export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "audit_events",
      "attendance_sessions",
      "attendances",
      "transcripts",
      "invitations",
      "calls",
      "sessions",
      "accounts",
      "verifications",
      "users"
    RESTART IDENTITY CASCADE
  `);
}

export { prisma };
