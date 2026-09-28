import { describe, expect, it } from 'vitest';
import {
  generateRawToken,
  hashToken,
  isWellFormedRawToken,
  safeEquals,
  tokenFingerprint,
} from '../../src/shared/security/tokens.js';

describe('invitation token primitives', () => {
  it('generates URL-safe, high-entropy, unique tokens', () => {
    const tokens = new Set(Array.from({ length: 500 }, () => generateRawToken()));
    expect(tokens.size).toBe(500);
    for (const token of tokens) {
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(token.length).toBeGreaterThanOrEqual(32);
    }
  });

  it('hashes deterministically and irreversibly', () => {
    const raw = generateRawToken();
    const hash = hashToken(raw);
    expect(hash).toHaveLength(64);
    expect(hashToken(raw)).toBe(hash);
    expect(hash).not.toContain(raw);
  });

  it('produces different hashes for different tokens', () => {
    expect(hashToken(generateRawToken())).not.toBe(hashToken(generateRawToken()));
  });

  it('rejects malformed tokens before any database lookup', () => {
    expect(isWellFormedRawToken(generateRawToken())).toBe(true);
    expect(isWellFormedRawToken('short')).toBe(false);
    expect(isWellFormedRawToken('has spaces in it aaaaaaaaaaaaaaaaaaaaaaaa')).toBe(false);
    expect(isWellFormedRawToken(`${'a'.repeat(32)}'; DROP TABLE invitations;--`)).toBe(false);
    expect(isWellFormedRawToken('a'.repeat(300))).toBe(false);
  });

  it('compares secrets without leaking length-independent timing', () => {
    const raw = generateRawToken();
    expect(safeEquals(raw, raw)).toBe(true);
    expect(safeEquals(raw, generateRawToken())).toBe(false);
    expect(safeEquals(raw, raw.slice(0, -1))).toBe(false);
  });

  it('fingerprints without revealing the token', () => {
    const raw = generateRawToken();
    const fingerprint = tokenFingerprint(raw);
    expect(fingerprint).toHaveLength(12);
    expect(raw).not.toContain(fingerprint);
    expect(tokenFingerprint(raw)).toBe(fingerprint);
  });
});
