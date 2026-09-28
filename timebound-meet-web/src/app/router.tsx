import { lazy, Suspense } from 'react';
import type { ReactNode } from 'react';
import { createBrowserRouter } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { AppShell } from '@/components/layout/app-shell';
import { ProtectedRoute } from '@/components/layout/protected-route';

/**
 * Pages are split per route so the join and call screens — the ones a
 * participant loads cold from an emailed link — do not carry the organizer's
 * dashboard with them.
 */
const LandingPage = lazy(() =>
  import('@/pages/LandingPage').then((m) => ({ default: m.LandingPage })),
);
const LoginPage = lazy(() => import('@/pages/LoginPage').then((m) => ({ default: m.LoginPage })));
const SignupPage = lazy(() =>
  import('@/pages/SignupPage').then((m) => ({ default: m.SignupPage })),
);
const DashboardPage = lazy(() =>
  import('@/pages/DashboardPage').then((m) => ({ default: m.DashboardPage })),
);
const CreateCallPage = lazy(() =>
  import('@/pages/CreateCallPage').then((m) => ({ default: m.CreateCallPage })),
);
const CallDetailsPage = lazy(() =>
  import('@/pages/CallDetailsPage').then((m) => ({ default: m.CallDetailsPage })),
);
const TranscriptPage = lazy(() =>
  import('@/pages/TranscriptPage').then((m) => ({ default: m.TranscriptPage })),
);
const AuditPage = lazy(() => import('@/pages/AuditPage').then((m) => ({ default: m.AuditPage })));
const JoinPage = lazy(() => import('@/pages/JoinPage').then((m) => ({ default: m.JoinPage })));
const CallRoomPage = lazy(() =>
  import('@/pages/CallRoomPage').then((m) => ({ default: m.CallRoomPage })),
);
const CallLobbyPage = lazy(() =>
  import('@/pages/CallLobbyPage').then((m) => ({ default: m.CallLobbyPage })),
);
const InvitationsPage = lazy(() =>
  import('@/pages/InvitationsPage').then((m) => ({ default: m.InvitationsPage })),
);
const NotFoundPage = lazy(() =>
  import('@/pages/NotFoundPage').then((m) => ({ default: m.NotFoundPage })),
);

function PageFallback(): React.JSX.Element {
  return (
    <div className="flex min-h-64 items-center justify-center" role="status" aria-live="polite">
      <Loader2 className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}

function page(element: ReactNode): React.JSX.Element {
  return <Suspense fallback={<PageFallback />}>{element}</Suspense>;
}

/**
 * Route structure.
 *
 * The guard below decides what to render, never what is permitted: /join and
 * /call are authenticated for UX, and the backend authorizes each request they
 * make regardless of how the route was reached.
 */
export const router = createBrowserRouter([
  // The landing page is public and is what an unauthenticated visitor sees.
  { path: '/', element: page(<LandingPage />) },
  { path: '/login', element: page(<LoginPage />) },
  { path: '/signup', element: page(<SignupPage />) },

  {
    element: <ProtectedRoute />,
    children: [
      // Full-bleed routes: the participant experience has its own chrome.
      { path: '/join/:token', element: page(<JoinPage />) },
      // The lobby is the only way into a room: it is where access is checked
      // and devices are set up before any attendance is recorded.
      { path: '/call/:callId/lobby', element: page(<CallLobbyPage />) },
      { path: '/call/:callId', element: page(<CallRoomPage />) },

      {
        element: <AppShell />,
        children: [
          { path: '/dashboard', element: page(<DashboardPage />) },
          { path: '/invitations', element: page(<InvitationsPage />) },
          { path: '/calls/new', element: page(<CreateCallPage />) },
          { path: '/calls/:callId', element: page(<CallDetailsPage />) },
          { path: '/calls/:callId/transcript', element: page(<TranscriptPage />) },
          { path: '/calls/:callId/audit', element: page(<AuditPage />) },
        ],
      },
    ],
  },

  { path: '*', element: page(<NotFoundPage />) },
]);
