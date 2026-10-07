import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { INVITATION_TOKEN_BYTES } from '../../config/constants.js';

/**
 * Invitation credential design.
 *
 * The join credential is an OPAQUE random string, not a JWT. Only its SHA-256
 * hash is persisted. The raw token exists exactly twice: in the creation
 * response, and in the join request. It is never stored, logged, audited or
 * emitted in telemetry.
 */

/** Cryptographically secure, URL-safe raw token. */
export function generateRawToken(): string {
  return randomBytes(INVITATION_TOKEN_BYTES).toString('base64url');
}

/** One-way hash used as the database lookup key. */
export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

/** Constant-time comparison for any secret-equality check. */
export function safeEquals(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, 'utf8');
  const bufferB = Buffer.from(b, 'utf8');
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

/**
 * Cheap structural check applied before touching the database, so that
 * malformed tokens cost a regex rather than a query.
 */
const RAW_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,256}$/;

export function isWellFormedRawToken(value: string): boolean {
  return RAW_TOKEN_PATTERN.test(value);
}

/** Non-reversible, low-cardinality fingerprint safe for logs and audit rows. */
export function tokenFingerprint(rawToken: string): string {
  return hashToken(rawToken).slice(0, 12);
}
