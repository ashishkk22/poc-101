import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderOptions, type RenderResult } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { CallSessionProvider } from '@/features/join';
import { RealtimeProvider } from '@/lib/realtime';
import { ThemeProvider } from '@/lib/theme/theme-provider';

/** A client that fails fast, so a test never waits on a retry backoff. */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

interface ProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  /** Initial history entry; defaults to '/'. */
  route?: string;
  /** Route pattern to mount the UI at, when the component reads params. */
  path?: string;
  queryClient?: QueryClient;
}

export function renderWithProviders(
  ui: ReactElement,
  { route = '/', path, queryClient = createTestQueryClient(), ...options }: ProvidersOptions = {},
): RenderResult & { queryClient: QueryClient } {
  function Wrapper({ children }: { children: ReactNode }): React.JSX.Element {
    return (
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          {/* Realtime is disabled in tests: no socket is opened. */}
          <RealtimeProvider enabled={false}>
            <CallSessionProvider>
              <MemoryRouter initialEntries={[route]}>
                {path ? (
                  <Routes>
                    <Route path={path} element={children} />
                    <Route path="*" element={<div data-testid="navigated" />} />
                  </Routes>
                ) : (
                  children
                )}
              </MemoryRouter>
            </CallSessionProvider>
          </RealtimeProvider>
        </QueryClientProvider>
      </ThemeProvider>
    );
  }

  return { ...render(ui, { wrapper: Wrapper, ...options }), queryClient };
}
