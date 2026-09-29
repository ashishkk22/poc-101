import { Navigate, Outlet, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useCurrentUser } from "@/features/auth";

export function ProtectedRoute(): React.JSX.Element {
  const { isAuthenticated, isLoading } = useCurrentUser();
  const location = useLocation();

  if (isLoading) {
    return (
      <div
        className="flex min-h-svh items-center justify-center"
        role="status"
        aria-live="polite"
      >
        <Loader2
          className="size-6 animate-spin text-muted-foreground"
          aria-hidden="true"
        />
        <span className="sr-only">Checking your session…</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    // Preserve where they were headed so a join link survives sign-in, and
    // flag that they did not choose to leave — the session ended under them.
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + location.search, expired: true }}
      />
    );
  }

  return <Outlet />;
}
