import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { ApiError, ErrorCode } from '@/lib/errors';
import { handleSessionExpiry, isSessionExpiry } from '@/lib/auth/session-expiry';

/**
 * Server state lives here and nowhere else.
 *
 * Retrying an authorization failure is pointless and noisy — a 401/403 is an
 * answer, not a transient fault — so only network and 5xx failures retry.
 */
const NON_RETRYABLE = new Set<string>([
  ErrorCode.AUTHENTICATION_REQUIRED,
  ErrorCode.FORBIDDEN,
  ErrorCode.VALIDATION_ERROR,
  ErrorCode.CALL_NOT_FOUND,
  ErrorCode.RESOURCE_NOT_FOUND,
  ErrorCode.INVITE_NOT_FOUND,
  ErrorCode.INVITE_REVOKED,
  ErrorCode.INVITE_EXPIRED,
  ErrorCode.PARTICIPANT_MISMATCH,
  ErrorCode.JOIN_WINDOW_NOT_OPEN,
  ErrorCode.JOIN_WINDOW_CLOSED,
  ErrorCode.CALL_CANCELLED,
  ErrorCode.CALL_NOT_JOINABLE,
  ErrorCode.TRANSCRIPT_ACCESS_DENIED,
  ErrorCode.TRANSCRIPT_NOT_READY,
  ErrorCode.BUSINESS_RULE_FAILURE,
  ErrorCode.CONFLICT,
  ErrorCode.RATE_LIMITED,
]);

export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  if (!ApiError.isApiError(error)) return false;
  return !NON_RETRYABLE.has(error.code);
}

export function createQueryClient(): QueryClient {
  /**
   * Any request can be the one that discovers the session has ended, so the
   * check lives at the cache level rather than in each caller. The route guard
   * then does the rest: it sees no session and returns the user to sign-in,
   * carrying where they were headed.
   */
  const onError = (error: unknown): void => {
    if (isSessionExpiry(error)) handleSessionExpiry(queryClient, queryKeys.session);
  };

  const queryClient: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: {
        staleTime: 15_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: true,
        retry: shouldRetry,
      },
      mutations: { retry: false },
    },
  });

  return queryClient;
}

export const queryKeys = {
  session: ['session'] as const,
  me: ['me'] as const,
  calls: (params?: unknown) => ['calls', 'page', params ?? {}] as const,
  /**
   * Infinite lists must not share a key with single-page reads of the same
   * filters: the cache entry holds `{ pages, pageParams }` for one and a bare
   * page for the other, and one observer would overwrite the other's shape.
   */
  callsInfinite: (params?: unknown) => ['calls', 'infinite', params ?? {}] as const,
  call: (callId: string) => ['call', callId] as const,
  invitations: (callId: string, params?: unknown) =>
    ['call', callId, 'invitations', params ?? {}] as const,
  attendance: (callId: string, params?: unknown) =>
    ['call', callId, 'attendance', params ?? {}] as const,
  transcript: (callId: string) => ['call', callId, 'transcript'] as const,
  audit: (callId: string, params?: unknown) => ['call', callId, 'audit', params ?? {}] as const,
  userLookup: (email: string) => ['users', 'lookup', email] as const,
} as const;
