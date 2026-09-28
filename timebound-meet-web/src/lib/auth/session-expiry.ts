import type { QueryClient } from '@tanstack/react-query';
import { isAuthExpired } from '@/lib/errors';
import { disconnectSocket } from '@/lib/realtime/socket';

/**
 * A session that ended somewhere else.
 *
 * Any request can be the one that discovers it: the cookie expired, an
 * administrator ended it, or it was signed out in another tab. Whichever
 * request finds out, the whole application has to agree immediately rather
 * than leave the user staring at error panels behind a shell that still
 * looks signed in.
 */
let handling = false;

export function handleSessionExpiry(queryClient: QueryClient, sessionKey: readonly unknown[]): void {
  // One expiry, one teardown, however many queries fail at once.
  if (handling) return;
  handling = true;

  disconnectSocket();
  queryClient.clear();
  queryClient.setQueryData(sessionKey, null);

  // Released on the next tick so a later, genuine expiry is handled again.
  setTimeout(() => {
    handling = false;
  }, 0);
}

export function isSessionExpiry(error: unknown): boolean {
  return isAuthExpired(error);
}
