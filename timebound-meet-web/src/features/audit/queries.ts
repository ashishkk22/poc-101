import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/app/query-client';
import { auditApi } from '@/lib/api';
import type { AuditEvent, PaginatedResponse, PaginationQuery } from '@/lib/api/types';

/** Organizer-only timeline of every security-relevant decision on a call. */
export function useAuditEvents(callId: string | undefined, query: PaginationQuery = {}) {
  return useQuery<PaginatedResponse<AuditEvent>>({
    queryKey: queryKeys.audit(callId ?? '', query),
    queryFn: ({ signal }) => auditApi.listForCall(callId as string, query, signal),
    enabled: Boolean(callId),
  });
}

/**
 * The audit trail is the longest list in the application — a busy call
 * accumulates an entry per decision — so it is never read unbounded.
 */
export function useInfiniteAuditEvents(callId: string | undefined, limit = 25) {
  return useInfiniteQuery({
    queryKey: [...queryKeys.audit(callId ?? '', { limit }), 'infinite'] as const,
    queryFn: ({ signal, pageParam }) =>
      auditApi.listForCall(
        callId as string,
        { limit, ...(pageParam ? { cursor: pageParam } : {}) },
        signal,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage: PaginatedResponse<AuditEvent>) => lastPage.nextCursor ?? undefined,
    enabled: Boolean(callId),
  });
}
