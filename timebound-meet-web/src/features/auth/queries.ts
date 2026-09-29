import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { authApi, type SignInInput, type SignUpInput } from '@/lib/api';
import type { User } from '@/lib/api/types';
import { ApiError, ErrorCode } from '@/lib/errors';
import { disconnectSocket } from '@/lib/realtime/socket';

export const sessionQueryKey = ['session'] as const;

/**
 * The session is whatever the backend says it is.
 *
 * Nothing is cached in storage, and an absent session resolves to `null`
 * rather than throwing — "signed out" is a state, not an error.
 */
export function useSession() {
  return useQuery<User | null>({
    queryKey: sessionQueryKey,
    queryFn: async ({ signal }) => {
      try {
        return await authApi.getSession(signal);
      } catch (error) {
        if (ApiError.isApiError(error) && error.status === 401) return null;
        throw error;
      }
    },
    staleTime: 5 * 60_000,
    /**
     * Not on every window focus.
     *
     * A session that ends elsewhere is caught the moment any request fails
     * with AUTHENTICATION_REQUIRED, and a participant in a call is re-checked
     * every heartbeat. Re-asking on each tab switch bought nothing and made
     * the browser its own noisiest client.
     */
    refetchOnWindowFocus: false,
    retry: (failureCount, error) => {
      if (ApiError.isApiError(error) && error.code === ErrorCode.NETWORK_ERROR) {
        return failureCount < 2;
      }
      return false;
    },
  });
}

export function useSignIn() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SignInInput) => authApi.signIn(input),
    onSuccess: async () => {
      // Re-read the session from the backend rather than trusting the response.
      await queryClient.invalidateQueries({ queryKey: sessionQueryKey });
    },
  });
}

/** Sign-up establishes a session, so the app lands straight on the dashboard. */
export function useSignUp() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SignUpInput) => authApi.signUp(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: sessionQueryKey });
    },
  });
}

/**
 * Signing out.
 *
 * The session lives in an HttpOnly cookie, which this code cannot touch — only
 * the server can end it. So local state is cleared ONLY once the server
 * confirms it did: clearing on failure would show a signed-out interface over
 * a session that is still live, which is exactly the lie a security product
 * must not tell. A failed sign-out stays signed in, and says so.
 */
export function useSignOut() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => authApi.signOut(),
    onSuccess: () => {
      // Every cached server response belonged to the session that just ended.
      disconnectSocket();
      queryClient.clear();
      queryClient.setQueryData(sessionQueryKey, null);
    },
  });
}
