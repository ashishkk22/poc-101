import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/app/query-client';
import { attendanceApi } from '@/lib/api';
import type { Attendance, PaginatedResponse, PaginationQuery } from '@/lib/api/types';

/** Organizer-only. A participant calling this receives a 403 from the backend. */
export function useAttendance(
  callId: string | undefined,
  query: PaginationQuery = {},
  options: { enabled?: boolean; refetchInterval?: number | false } = {},
) {
  return useQuery<PaginatedResponse<Attendance>>({
    queryKey: queryKeys.attendance(callId ?? '', query),
    queryFn: ({ signal }) => attendanceApi.listForCall(callId as string, query, signal),
    enabled: Boolean(callId) && (options.enabled ?? true),
    refetchInterval: options.refetchInterval ?? false,
  });
}

/** Paged roster, for calls with more participants than one page holds. */
export function useInfiniteAttendance(
  callId: string | undefined,
  options: { limit?: number; refetchInterval?: number | false } = {},
) {
  const limit = options.limit ?? 25;

  return useInfiniteQuery({
    queryKey: [...queryKeys.attendance(callId ?? '', { limit }), 'infinite'] as const,
    queryFn: ({ signal, pageParam }) =>
      attendanceApi.listForCall(
        callId as string,
        { limit, ...(pageParam ? { cursor: pageParam } : {}) },
        signal,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage: PaginatedResponse<Attendance>) => lastPage.nextCursor ?? undefined,
    enabled: Boolean(callId),
    refetchInterval: options.refetchInterval ?? false,
  });
}
