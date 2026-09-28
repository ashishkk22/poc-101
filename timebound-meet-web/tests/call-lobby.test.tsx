import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CallLobbyPage } from '@/pages/CallLobbyPage';
import { ApiError } from '@/lib/errors';
import { renderWithProviders } from './test-utils';

const getById = vi.fn();
const join = vi.fn();

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    callsApi: {
      ...actual.callsApi,
      getById: (...a: unknown[]) => getById(...a),
      join: (...a: unknown[]) => join(...a),
    },
    authApi: {
      ...actual.authApi,
      getSession: () => Promise.resolve({ id: 'u_org', name: 'Olivia', email: 'o@example.com' }),
    },
  };
});

const CALL = {
  id: 'call_1',
  title: 'Roadmap planning',
  scheduledStart: new Date(Date.now() + 3_600_000).toISOString(),
  scheduledEnd: new Date(Date.now() + 7_200_000).toISOString(),
  timezone: 'Asia/Kolkata',
  status: 'SCHEDULED' as const,
  organizerId: 'u_org',
  createdAt: new Date().toISOString(),
};

function renderLobby() {
  return renderWithProviders(<CallLobbyPage />, {
    route: '/call/call_1/lobby',
    path: '/call/:callId/lobby',
  });
}

describe('Organizer entry without a join link', () => {
  beforeEach(() => {
    getById.mockReset();
    join.mockReset();
    getById.mockResolvedValue(CALL);
  });

  it('lets the organizer into their own call, which they cannot be invited to', async () => {
    const user = userEvent.setup();
    join.mockResolvedValue({
      call: CALL,
      role: 'ORGANIZER',
      attendanceSession: {
        id: 'sess_1',
        deviceId: 'web-1',
        joinedAt: new Date().toISOString(),
        leftAt: null,
        leftReason: null,
        status: 'CONNECTED',
      },
      providerSession: { id: 'prov_1', expiresAt: CALL.scheduledEnd },
    });

    renderLobby();

    await user.click(await screen.findByRole('button', { name: /join now/i }));

    await waitFor(() => expect(join).toHaveBeenCalledOnce());
    expect(join.mock.calls[0]![0]).toBe('call_1');
    expect(await screen.findByTestId('navigated')).toBeInTheDocument();
  });

  it('records nothing until the person commits', async () => {
    renderLobby();

    expect(await screen.findByRole('button', { name: /join now/i })).toBeInTheDocument();
    expect(join).not.toHaveBeenCalled();
  });

  it('offers entry before the scheduled start and says waiting is fine', async () => {
    renderLobby();

    expect(await screen.findByText(/make yourself comfortable/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /join now/i })).toBeEnabled();
  });

  it('shows the backend refusal when entry is denied', async () => {
    const user = userEvent.setup();
    join.mockImplementation(() =>
      Promise.reject(
        new ApiError({
          code: 'JOIN_WINDOW_CLOSED',
          message: 'This call has already ended.',
          status: 403,
          requestId: 'req_x',
        }),
      ),
    );

    renderLobby();

    await user.click(await screen.findByRole('button', { name: /join now/i }));

    const alerts = await screen.findAllByRole('alert');
    expect(alerts.some((alert) => /wrapped up/i.test(alert.textContent ?? ''))).toBe(true);
  });

  it('surfaces a missing call rather than a blank lobby', async () => {
    getById.mockImplementation(() =>
      Promise.reject(new ApiError({ code: 'CALL_NOT_FOUND', message: 'nope', status: 404 })),
    );

    renderLobby();

    const alerts = await screen.findAllByRole('alert');
    expect(alerts.some((alert) => /couldn't find that call/i.test(alert.textContent ?? ''))).toBe(true);
  });
});
