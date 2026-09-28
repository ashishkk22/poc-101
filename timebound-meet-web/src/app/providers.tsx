import { QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Toaster } from 'sonner';
import { ErrorBoundary } from '@/components/common/error-boundary';
import { CallSessionProvider } from '@/features/join';
import { useCurrentUser } from '@/features/auth';
import { RealtimeProvider } from '@/lib/realtime';
import { ThemeProvider } from '@/lib/theme/theme-provider';
import { createQueryClient } from './query-client';

/**
 * The socket opens only once the backend has confirmed a session, and closes
 * when it goes away — a realtime connection never outlives its session.
 */
function RealtimeGate({ children }: { children: ReactNode }): React.JSX.Element {
  const { isAuthenticated } = useCurrentUser();
  return <RealtimeProvider enabled={isAuthenticated}>{children}</RealtimeProvider>;
}

export function AppProviders({ children }: { children: ReactNode }): React.JSX.Element {
  const [queryClient] = useState(createQueryClient);

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <RealtimeGate>
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
