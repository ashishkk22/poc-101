import { describe, expect, it } from 'vitest';
import { isCredentialPath } from '../../src/app/middleware/rate-limit.js';

/**
 * Checking whether you are still signed in must not spend the budget that
 * exists to slow down password guessing.
 *
 * A browser asks for its own session on every focus and navigation. While that
 * shared the sign-in allowance, twenty of those harmless checks locked a user
 * out of logging in with an entirely correct password.
 */
describe('which auth requests get the tight budget', () => {
  it.each([
    '/api/auth/sign-in/email',
    '/api/auth/sign-up/email',
    '/api/auth/forget-password',
    '/api/auth/reset-password',
    '/api/auth/change-password',
    '/api/auth/change-email',
    '/api/auth/verify-email',
    '/api/auth/two-factor/verify',
  ])('guards %s, which carries a secret', (path) => {
    expect(isCredentialPath(path)).toBe(true);
  });

  it.each([
    '/api/auth/get-session',
    '/api/auth/sign-out',
    '/api/auth/list-sessions',
  ])('leaves %s on the generous budget', (path) => {
    expect(isCredentialPath(path)).toBe(false);
  });

  it('reads the path with or without the mount prefix', () => {
    expect(isCredentialPath('/sign-in/email')).toBe(true);
    expect(isCredentialPath('/get-session')).toBe(false);
  });

  it('is not fooled by a lookalike path', () => {
    // Nothing that merely mentions sign-in should inherit the tight budget,
    // and nothing that carries a secret should escape it.
    expect(isCredentialPath('/api/auth/ok/sign-in')).toBe(false);
    expect(isCredentialPath('/api/auth/sign-in')).toBe(true);
  });
});
