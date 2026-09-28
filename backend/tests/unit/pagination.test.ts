import { describe, expect, it } from 'vitest';
import { buildPage, decodeCursor, encodeCursor } from '../../src/shared/http/pagination.js';
import { AppError } from '../../src/shared/errors/index.js';

describe('cursor pagination', () => {
  it('round-trips a cursor', () => {
    const cursor = { ts: '2026-09-22T10:00:00.000Z', id: 'call_123' };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it('rejects tampered or malformed cursors', () => {
    expect(() => decodeCursor('not-base64!!')).toThrow(AppError);
    expect(() => decodeCursor(Buffer.from('{"ts":"nope"}').toString('base64url'))).toThrow(
      AppError,
    );
    expect(() => decodeCursor(Buffer.from('[]').toString('base64url'))).toThrow(AppError);
  });

  it('emits a nextCursor only when a probe row was fetched', () => {
    const rows = Array.from({ length: 4 }, (_, index) => ({
      id: `id_${index}`,
      createdAt: new Date(2026, 8, 22, 10, index),
    }));

    const full = buildPage(rows, 3, (row) => row.createdAt);
    expect(full.items).toHaveLength(3);
    expect(full.nextCursor).not.toBeNull();
    expect(decodeCursor(full.nextCursor!).id).toBe('id_2');

    const last = buildPage(rows.slice(0, 2), 3, (row) => row.createdAt);
    expect(last.items).toHaveLength(2);
    expect(last.nextCursor).toBeNull();
  });
});
