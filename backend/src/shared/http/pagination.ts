import { z } from 'zod';
import { PAGINATION } from '../../config/constants.js';
import { AppError, ErrorCode } from '../errors/index.js';

/**
 * Opaque keyset cursors.
 *
 * Cursors encode the exact sort key of the last row ((createdAt|start, id)),
 * which keeps pagination stable under concurrent inserts and keeps the query
 * bounded at the database. Offset pagination and unbounded findMany are
 * forbidden by the specification.
 */
export interface Cursor {
  /** ISO timestamp of the ordering column for the last returned row. */
  ts: string;
  /** Tie-breaker id for rows sharing a timestamp. */
  id: string;
}

const cursorSchema = z.object({
  ts: z.iso.datetime(),
  id: z.string().min(1).max(64),
});

export function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

export function decodeCursor(value: string): Cursor {
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    throw new AppError(ErrorCode.VALIDATION_ERROR, { message: 'Invalid pagination cursor.' });
  }

  const parsed = cursorSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new AppError(ErrorCode.VALIDATION_ERROR, { message: 'Invalid pagination cursor.' });
  }
  return parsed.data;
}

export const paginationQuerySchema = z.object({
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(PAGINATION.maxLimit).default(PAGINATION.defaultLimit),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/**
 * Builds a keyset page from `limit + 1` rows fetched in descending order.
 * The extra row is the existence probe for `nextCursor`; it is never returned.
 */
export function buildPage<T extends { id: string }>(
  rows: T[],
  limit: number,
  timestampOf: (row: T) => Date,
): { items: T[]; nextCursor: string | null } {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];

  return {
    items,
    nextCursor:
      hasMore && last ? encodeCursor({ ts: timestampOf(last).toISOString(), id: last.id }) : null,
  };
}
