import { apiClient } from './client';
import type { User } from './types';

export const usersApi = {
  me: (signal?: AbortSignal) => apiClient.get<User>('/users/me', signal ? { signal } : {}),

  /**
   * Exact-email lookup so an organizer can resolve someone to invite.
   * Returns null when no user matches; the backend deliberately does not
   * support prefix search.
   */
  lookupByEmail: (email: string, signal?: AbortSignal) =>
    apiClient.get<User | null>('/users/lookup', { query: { email }, ...(signal ? { signal } : {}) }),
};
