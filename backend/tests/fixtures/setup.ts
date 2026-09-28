/**
 * Loads the test environment BEFORE any module reads process.env.
 *
 * config/env.ts validates at import time, so this must run first — hence the
 * `setupFiles` entry rather than an import inside a test.
 */
import { config } from 'dotenv';

config({ path: '.env.test', override: true });
process.env.NODE_ENV = 'test';
