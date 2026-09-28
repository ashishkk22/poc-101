import 'dotenv/config';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

/**
 * Prisma 7 configuration.
 *
 * The connection URL lives here (and in the PrismaClient driver adapter)
 * rather than in schema.prisma, per Prisma 7's configuration model.
 *
 * `prisma generate` performs pure code generation and touches no database, so
 * the URL must not be *required* simply to build the client — that would make
 * a container image unbuildable without production credentials. Commands that
 * genuinely need a database (`migrate deploy`, `db seed`) are always run with
 * DATABASE_URL set, and fail loudly against the placeholder if it is not.
 *
 * This placeholder never affects the running application: the server builds
 * its own adapter from the Zod-validated `env.DATABASE_URL` and refuses to
 * boot if that is missing.
 */
const UNSET_DATASOURCE_URL = 'postgresql://unset:unset@localhost:5432/unset';

export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? UNSET_DATASOURCE_URL,
    // Only set when a shadow database is actually configured; an empty string
    // is rejected by the engine.
    ...(process.env.SHADOW_DATABASE_URL
      ? { shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL }
      : {}),
  },
});
