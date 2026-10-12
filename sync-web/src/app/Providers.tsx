import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { PropsWithChildren } from "react";
import { Toaster } from "sonner";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { CallSessionProvider } from "@/features/join";
import { useCurrentUser } from "@/features/auth";
import { RealtimeEvent, RealtimeProvider, useRealtimeEvent } from "@/lib/realtime";
import { ThemeProvider } from "@/lib/theme/ThemeProvider";
import { createQueryClient, queryKeys } from "./queryClient";

/**
 * The socket opens only once the backend has confirmed a session, and closes
 * when it goes away — a realtime connection never outlives its session.
 */
function RealtimeGate({ children }: PropsWithChildren) {
  const { isAuthenticated } = useCurrentUser();
  return (
    <RealtimeProvider enabled={isAuthenticated}>{children}</RealtimeProvider>
  );
}

/**
 * A revoke reaches the invitee wherever they are in the app, not only inside
 * the call — so their invitation list and call pages stop offering "Join" for
 * an invite that has been taken back.
 */
function RevocationSync() {
  const queryClient = useQueryClient();

  useRealtimeEvent(RealtimeEvent.INVITATION_REVOKED, payload => {
    void queryClient.invalidateQueries({ queryKey: ["invitations", "mine"] });
    void queryClient.invalidateQueries({ queryKey: ["calls"] });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.call(payload.callId),
    });
  });

  return null;
}

export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(createQueryClient);

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <RealtimeGate>
            <RevocationSync />
            <CallSessionProvider>
              {children}
              <Toaster position="top-right" richColors closeButton />
            </CallSessionProvider>
          </RealtimeGate>
        </QueryClientProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
