import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClientProvider } from '@tanstack/react-query';
import { CallRoomPage } from '@/pages/CallRoomPage';
import { CallSessionProvider, useCallSession, type ActiveCallSession } from '@/features/join';
import { RealtimeProvider } from '@/lib/realtime';
import { ThemeProvider } from '@/lib/theme/theme-provider';
import { createTestQueryClient } from './test-utils';

const leave = vi.fn();
const endCall = vi.fn();
const participants = vi.fn();
const listInvitations = vi.fn();

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    callsApi: {
      ...actual.callsApi,
      leave: (...a: unknown[]) => leave(...a),
      end: (...a: unknown[]) => endCall(...a),
      participants: (...a: unknown[]) => participants(...a),
      heartbeat: () => new Promise(() => undefined),
    },
    invitationsApi: {
      ...actual.invitationsApi,
      listForCall: (...a: unknown[]) => listInvitations(...a),
    },
    authApi: {
      ...actual.authApi,
      getSession: () => Promise.resolve({ id: 'u1', name: 'Olivia', email: 'o@example.com' }),
    },
  };
});

const CALL = {
  id: 'call_1',
  title: 'Security review',
  scheduledStart: new Date(Date.now() - 60_000).toISOString(),
  scheduledEnd: new Date(Date.now() + 3_600_000).toISOString(),
  timezone: 'UTC',
  status: 'LIVE' as const,
};

function session(role: 'ORGANIZER' | 'PARTICIPANT'): ActiveCallSession {
  return {
    via: 'CALL_ID',
    token: null,
    callId: 'call_1',
    deviceId: 'web-1',
    role,
    call: CALL,
    attendanceSession: {
      id: 'sess_1',
      deviceId: 'web-1',
      joinedAt: new Date().toISOString(),
      leftAt: null,
      leftReason: null,
      status: 'CONNECTED',
    },
    providerSession: { id: 'prov_1', expiresAt: CALL.scheduledEnd },
    micOn: true,
    cameraOn: true,
  };
}

/**
 * Seeds an in-memory call session, as the lobby would have done.
 *
 * The room is mounted only once the session exists — otherwise it correctly
 * bounces to the lobby, which is what it does after a refresh.
 */
function Seed({ role, children }: { role: 'ORGANIZER' | 'PARTICIPANT'; children: ReactNode }) {
  const { start } = useCallSession();
  const [ready, setReady] = useState(false);
  const seeded = useRef(false);

  useEffect(() => {
    // Seeded once only. The room must then stay mounted even after the session
    // clears, or it never gets the chance to redirect.
    if (seeded.current) return;
    seeded.current = true;
    start(session(role));
    setReady(true);
  }, [start, role]);

  return ready ? <>{children}</> : null;
}

function renderRoom(role: 'ORGANIZER' | 'PARTICIPANT' = 'PARTICIPANT') {
  const client = createTestQueryClient();

  return {
    ...render(
      <ThemeProvider>
        <QueryClientProvider client={client}>
          <RealtimeProvider enabled={false}>
            <CallSessionProvider>
              <MemoryRouter initialEntries={['/call/call_1']}>
                <Routes>
                  <Route
                    path="/call/:callId"
                    element={
                      <Seed role={role}>
                        <CallRoomPage />
                      </Seed>
                    }
                  />
                  <Route path="/calls/:callId" element={<div>Call details page</div>} />
                  <Route path="/call/:callId/lobby" element={<div>Lobby</div>} />
                  <Route path="*" element={<div>Elsewhere</div>} />
                </Routes>
              </MemoryRouter>
            </CallSessionProvider>
          </RealtimeProvider>
        </QueryClientProvider>
      </ThemeProvider>,
    ),
  };
}

describe('Inviting from inside the call', () => {
  beforeEach(() => {
    participants.mockReset();
    participants.mockResolvedValue([]);
    listInvitations.mockReset();
    listInvitations.mockResolvedValue({ items: [], nextCursor: null });
  });

  it('opens the invite dialog from the empty-call prompt', async () => {
    const user = userEvent.setup();
    renderRoom('ORGANIZER');

    // Switching side panels is not enough: on a wide screen the People panel
    // is already the one showing, so the prompt must open the dialog itself.
    await user.click(await screen.findByRole('button', { name: /invite someone/i }));

    expect(await screen.findByRole('dialog')).toHaveTextContent(/invite a participant/i);
  });

  it('opens it from the People panel too', async () => {
    const user = userEvent.setup();
    renderRoom('ORGANIZER');

    await user.click(await screen.findByRole('button', { name: /^invite$/i }));

    expect(await screen.findByRole('dialog')).toHaveTextContent(/invite a participant/i);
  });

  it('keeps the host in the call while inviting', async () => {
    const user = userEvent.setup();
    renderRoom('ORGANIZER');

    await user.click(await screen.findByRole('button', { name: /invite someone/i }));
    await screen.findByRole('dialog');

    // Navigating away would unmount the room, stopping media and dropping
    // every peer connection. The room is still mounted — merely inert behind
    // the modal, which is why this query has to include hidden nodes.
    expect(screen.getByRole('button', { name: /leave/i, hidden: true })).toBeInTheDocument();
    expect(screen.queryByText('Call details page')).not.toBeInTheDocument();
  });

  it('offers a participant no invite controls', async () => {
    renderRoom('PARTICIPANT');

    await screen.findByRole('button', { name: /leave/i });
    expect(screen.queryByRole('button', { name: /invite/i })).not.toBeInTheDocument();
  });
});

describe('Leaving a call', () => {
  beforeEach(() => {
    leave.mockReset();
    endCall.mockReset();
    participants.mockReset();
    participants.mockResolvedValue([]);
    listInvitations.mockReset();
    listInvitations.mockResolvedValue({ items: [], nextCursor: null });
    leave.mockResolvedValue({
      sessionId: 'sess_1',
      status: 'COMPLETED',
      totalConnectedSeconds: 42,
      alreadyLeft: false,
    });
  });

  it('redirects to the call rather than parking on a screen', async () => {
    const user = userEvent.setup();
    renderRoom();

    await user.click(await screen.findByRole('button', { name: /leave/i }));
    await user.click(await screen.findByRole('button', { name: /leave call/i }));

    // You chose to leave, so there is nothing to read — you land somewhere useful.
    expect(await screen.findByText('Call details page')).toBeInTheDocument();
  });

  it('still redirects when the leave request fails', async () => {
    const user = userEvent.setup();
    leave.mockImplementation(() => Promise.reject(new Error('offline')));

    renderRoom();

    await user.click(await screen.findByRole('button', { name: /leave/i }));
    await user.click(await screen.findByRole('button', { name: /leave call/i }));

    // Their local session is over either way; the reaper closes the record.
    expect(await screen.findByText('Call details page')).toBeInTheDocument();
  });

  it('asks before leaving', async () => {
    const user = userEvent.setup();
    renderRoom();

    await user.click(await screen.findByRole('button', { name: /leave/i }));

    expect(await screen.findByRole('dialog')).toHaveTextContent(/leave this call/i);
    expect(leave).not.toHaveBeenCalled();
  });

  it('redirects the organizer after they end it for everyone', async () => {
    const user = userEvent.setup();
    endCall.mockResolvedValue({ ...CALL, status: 'ENDED' });

    renderRoom('ORGANIZER');

    await user.click(await screen.findByRole('button', { name: /end for everyone/i }));
    await user.click(
      await screen.findByRole('button', { name: /^end for everyone$/i, hidden: false }),
    );

    await waitFor(() => expect(endCall).toHaveBeenCalled());
    expect(await screen.findByText('Call details page')).toBeInTheDocument();
  });

  it('offers no way to end the call for a participant', async () => {
    renderRoom('PARTICIPANT');

    await screen.findByRole('button', { name: /leave/i });
    expect(screen.queryByRole('button', { name: /end for everyone/i })).not.toBeInTheDocument();
  });
});
