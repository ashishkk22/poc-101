import { useSession } from "./queries";
import type { User } from "@/lib/api/types";

export interface CurrentUserState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: unknown;
}

export function useCurrentUser(): CurrentUserState {
  const { data, isPending, error } = useSession();

  return {
    user: data ?? null,
    isAuthenticated: Boolean(data),
    isLoading: isPending,
    error,
  };
}

/** True when the signed-in user owns the call. UX only — never a permission. */
export function useIsOrganizer(organizerId: string | undefined): boolean {
  const { user } = useCurrentUser();
  return Boolean(user && organizerId && user.id === organizerId);
}
