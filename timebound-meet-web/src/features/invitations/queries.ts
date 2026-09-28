import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import { queryKeys } from '@/app/query-client';
import { invitationsApi, usersApi, type CreateInvitationInput } from '@/lib/api';
import type {
  Invitation,
  ListInvitationsQuery,
  PaginatedResponse,
  RevokedInvitation,
  User,
} from '@/lib/api/types';

export function useInvitations(callId: string | undefined, query: ListInvitationsQuery = {}) {
  return useQuery<PaginatedResponse<Invitation>>({
    queryKey: queryKeys.invitations(callId ?? '', query),
    queryFn: ({ signal }) => invitationsApi.listForCall(callId as string, query, signal),
    enabled: Boolean(callId),
  });
}

/** Paged invitations, for a call with a long participant list. */
export function useInfiniteInvitations(callId: string | undefined, limit = 25) {
  return useInfiniteQuery({
    queryKey: [...queryKeys.invitations(callId ?? '', { limit }), 'infinite'] as const,
    queryFn: ({ signal, pageParam }) =>
      invitationsApi.listForCall(
        callId as string,
        { limit, ...(pageParam ? { cursor: pageParam } : {}) },
        signal,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage: PaginatedResponse<Invitation>) => lastPage.nextCursor ?? undefined,
    enabled: Boolean(callId),
  });
}

export function useCreateInvitation(callId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateInvitationInput) => invitationsApi.create(callId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['call', callId, 'invitations'] });
      void queryClient.invalidateQueries({ queryKey: ['call', callId, 'audit'] });
    },
  });
}

/**
 * Revocation is the security-critical action in this UI.
 *
 * The cached rows are patched immediately so the table reads REVOKED without
 * waiting for a round trip, then every dependent query is refetched — the
 * server's version of the world is the one that survives.
 *
 * Both cache shapes under this key have to be handled: a single page from
 * `useInvitations`, and `{ pages, pageParams }` from `useInfiniteInvitations`.
 */
function applyRevocation(result: RevokedInvitation) {
  const patchItem = (invitation: Invitation): Invitation =>
    invitation.id === result.invitationId
      ? { ...invitation, status: result.status, revokedAt: result.revokedAt }
      : invitation;

  const patchPage = (page: PaginatedResponse<Invitation>) => ({
    ...page,
    items: page.items.map(patchItem),
  });

  return (previous: unknown): unknown => {
    if (!previous || typeof previous !== 'object') return previous;

    if ('pages' in previous) {
      const infinite = previous as InfiniteData<PaginatedResponse<Invitation>>;
      return { ...infinite, pages: infinite.pages.map(patchPage) };
    }

    if ('items' in previous) return patchPage(previous as PaginatedResponse<Invitation>);

    return previous;
  };
}

export function useRevokeInvitation(callId: string) {
  const queryClient = useQueryClient();

  return useMutation<RevokedInvitation, unknown, string>({
    mutationFn: (invitationId: string) => invitationsApi.revoke(invitationId),
    onSuccess: (result) => {
      queryClient.setQueriesData(
        { queryKey: ['call', callId, 'invitations'] },
        applyRevocation(result),
      );
    },
    onSettled: () => {
      // Attendance and audit both change when access is withdrawn.
      void queryClient.invalidateQueries({ queryKey: ['call', callId] });
    },
  });
}

/** Resolves an email to a user so the organizer can invite them. */
export function useUserLookup(email: string, enabled: boolean) {
  return useQuery<User | null>({
    queryKey: queryKeys.userLookup(email),
    queryFn: ({ signal }) => usersApi.lookupByEmail(email, signal),
    enabled: enabled && email.includes('@'),
    staleTime: 60_000,
    retry: false,
  });
}
