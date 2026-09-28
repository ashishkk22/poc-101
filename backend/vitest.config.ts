import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Integration tests share one PostgreSQL database; running files in a
    // single thread keeps their fixtures from colliding.
    pool: 'threads',
    maxWorkers: 1,
    fileParallelism: false,
    setupFiles: ['tests/fixtures/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    sequence: { hooks: 'list' },
  },
});
