import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { callsApi, joinApi } from '@/lib/api';
import { ApiError, ErrorCode } from '@/lib/errors';
import type {
  CallParticipant,
  JoinResult,
  LeaveReason,
  LeaveResult,
  ResolvedLink,
} from '@/lib/api/types';
import { EntryDoor } from "./CallSession";

/**
 * Entry is always a request, never a local decision.
 *
 * The frontend does not inspect a token, compare timestamps or check call
 * status before asking. It asks, and renders the answer.
 */
export interface AuthorizeInput {
  token: string;
  deviceId: string;
}

export function useAuthorizeJoin() {
  return useMutation<JoinResult, unknown, AuthorizeInput>({
    mutationFn: ({ token, deviceId }) => joinApi.authorize(token, { deviceId }),
  });
}

/** Resolves a link to its call without entering — powers the lobby. */
export function useResolveLink(token: string | null) {
  return useQuery<ResolvedLink>({
    queryKey: ['join', 'resolve', token ?? ''],
    queryFn: () => joinApi.resolve(token as string),
    enabled: Boolean(token),
    retry: false,
    // The answer depends on live authorization state, so never serve it stale.
    staleTime: 0,
    gcTime: 0,
  });
}

/** Entry by identity: the organizer's own call, or a signed-in invitee. */
/**
 * Refusals that mean what the app last showed is out of date. A revoke the
 * socket never delivered would otherwise leave "Join" on the call's pages,
 * offering a door the server has already shut.
 */
const STALE_ENTRY = new Set<string>([
  ErrorCode.INVITE_REVOKED,
  ErrorCode.INVITE_EXPIRED,
  ErrorCode.CALL_CANCELLED,
  ErrorCode.CALL_NOT_JOINABLE,
  ErrorCode.JOIN_WINDOW_CLOSED,
]);

export function useJoinCall() {
  const queryClient = useQueryClient();

  return useMutation<JoinResult, unknown, { callId: string; deviceId: string }>({
    mutationFn: ({ callId, deviceId }) => callsApi.join(callId, { deviceId }),
    onError: (error, { callId }) => {
      if (!ApiError.isApiError(error) || !STALE_ENTRY.has(error.code)) return;
      void queryClient.invalidateQueries({ queryKey: ['call', callId] });
      void queryClient.invalidateQueries({ queryKey: ['calls'] });
      void queryClient.invalidateQueries({ queryKey: ['invitations', 'mine'] });
    },
  });
}

export interface LeaveInput {
  via: EntryDoor;
  token: string | null;
  callId: string;
  sessionId?: string;
  deviceId?: string;
  reason?: LeaveReason;
}

export function useLeaveCall() {
  return useMutation<LeaveResult, unknown, LeaveInput>({
    mutationFn: ({ via, token, callId, ...rest }) =>
      via === EntryDoor.INVITE_LINK && token
        ? joinApi.leave(token, rest)
        : callsApi.leave(callId, rest),
  });
}

/**
 * The live roster.
 *
 * Polled as a floor under the realtime events: if the socket never connects,
 * the roster is merely slower, never wrong.
 */
export function useCallRoster(callId: string | null, enabled: boolean) {
  return useQuery<CallParticipant[]>({
    queryKey: ['call', callId ?? '', 'roster'],
    queryFn: ({ signal }) => callsApi.participants(callId as string, signal),
    enabled: Boolean(callId) && enabled,
    refetchInterval: enabled ? 20_000 : false,
    staleTime: 5_000,
  });
}
