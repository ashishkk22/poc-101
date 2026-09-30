import { apiClient } from "./client";
import type { User } from "./types";

/**
 * Better Auth session endpoints.
 *
 * The session itself is an HttpOnly cookie the browser holds; nothing is
 * stored by this module. `getSession` is the only way to know whether the
 * caller is authenticated, and the backend answers it.
 */
export interface SignInInput {
  email: string;
  password: string;
}

export interface SignUpInput {
  name: string;
  email: string;
  password: string;
}

interface AuthSessionResponse {
  user: { id: string; email: string; name: string } | null;
  session: { id: string; expiresAt: string } | null;
}

/** The backend's minimum. Mirrored for form feedback, enforced server-side. */
export const MIN_PASSWORD_LENGTH = 12;

export const authApi = {
  async signIn(input: SignInInput): Promise<void> {
    await apiClient.auth<unknown>("/sign-in/email", {
      method: "POST",
      body: { email: input.email, password: input.password },
    });
  },

  /** Sign-up establishes a session immediately; no second sign-in is needed. */
  async signUp(input: SignUpInput): Promise<void> {
    await apiClient.auth<unknown>("/sign-up/email", {
      method: "POST",
      body: { name: input.name, email: input.email, password: input.password },
    });
  },

  async signOut(): Promise<void> {
    await apiClient.auth<unknown>("/sign-out", { method: "POST", body: {} });
  },

  /**
   * Returns null when there is no session — that is a state, not an error.
   * Better Auth answers a signed-out `get-session` with `null` and HTTP 200.
   */
  async getSession(signal?: AbortSignal): Promise<User | null> {
    const response = await apiClient.auth<AuthSessionResponse | null>(
      "/get-session",
      {
        method: "GET",
        ...(signal ? { signal } : {}),
      },
    );

    if (!response?.user) return null;
    return {
      id: response.user.id,
      email: response.user.email,
      name: response.user.name,
    };
  },
};
