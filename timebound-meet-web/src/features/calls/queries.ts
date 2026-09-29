import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { queryKeys } from "@/app/queryClient";
import { callsApi, type CreateCallInput } from "@/lib/api";
import type { Call, ListCallsQuery, PaginatedResponse } from "@/lib/api/types";

export function useCalls(query: ListCallsQuery = {}) {
  return useQuery<PaginatedResponse<Call>>({
    queryKey: queryKeys.calls(query),
    queryFn: ({ signal }) => callsApi.list(query, signal),
    // Keeps the previous page visible while the next one loads.
    placeholderData: previous => previous,
  });
}

/**
 * Cursor-paginated calls.
 *
 * The backend returns keyset pages ordered `scheduledStart DESC`, so a caller
 * that wants chronological order has to sort what it has — see `sortAscending`
 * on the dashboard's "next up" list.
 */
export function useInfiniteCalls(query: ListCallsQuery = {}) {
  return useInfiniteQuery({
    queryKey: queryKeys.callsInfinite(query),
    queryFn: ({ signal, pageParam }) =>
      callsApi.list(
        { ...query, ...(pageParam ? { cursor: pageParam } : {}) },
        signal,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage: PaginatedResponse<Call>) =>
      lastPage.nextCursor ?? undefined,
  });
}

/** Flattens the loaded pages into one list. */
export function flattenPages<T>(
  pages: Array<PaginatedResponse<T>> | undefined,
): T[] {
  return pages?.flatMap(page => page.items) ?? [];
}

export function useCall(callId: string | undefined) {
  return useQuery<Call>({
    queryKey: queryKeys.call(callId ?? ""),
    queryFn: ({ signal }) => callsApi.getById(callId as string, signal),
    enabled: Boolean(callId),
  });
}

export function useCreateCall() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateCallInput) => callsApi.create(input),
    onSuccess: call => {
      queryClient.setQueryData(queryKeys.call(call.id), call);
      void queryClient.invalidateQueries({ queryKey: ["calls"] });
    },
  });
}

export function useCancelCall(callId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => callsApi.cancel(callId),
    onSuccess: call => {
      queryClient.setQueryData(queryKeys.call(callId), call);
      void queryClient.invalidateQueries({ queryKey: ["calls"] });
      void queryClient.invalidateQueries({ queryKey: ["call", callId] });
    },
  });
}

export function useEndCall(callId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => callsApi.end(callId),
    onSuccess: call => {
      queryClient.setQueryData(queryKeys.call(callId), call);
      void queryClient.invalidateQueries({ queryKey: ["calls"] });
      void queryClient.invalidateQueries({ queryKey: ["call", callId] });
    },
  });
}
