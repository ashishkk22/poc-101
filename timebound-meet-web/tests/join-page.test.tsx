import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JoinPage } from '@/pages/JoinPage';
import { ApiError } from '@/lib/errors';
import { renderWithProviders } from './test-utils';

const resolve = vi.fn();
const authorize = vi.fn();

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    joinApi: {
      ...actual.joinApi,
      resolve: (...args: unknown[]) => resolve(...args),
      authorize: (...args: unknown[]) => authorize(...args),
    },
  };
});

const TOKEN = 'a'.repeat(43);

const CALL = {
  id: 'call_1',
  title: 'Security review',
  scheduledStart: new Date(Date.now() - 60_000).toISOString(),
  scheduledEnd: new Date(Date.now() + 3_600_000).toISOString(),
  timezone: 'Asia/Kolkata',
  status: 'LIVE' as const,
};

function renderJoin() {
  return renderWithProviders(<JoinPage />, { route: `/join/${TOKEN}`, path: '/join/:token' });
}

function denial(code: string) {
  return new ApiError({ code, message: 'server copy', status: 403, requestId: 'req_join' });
}

describe('JoinPage states', () => {
  beforeEach(() => {
    resolve.mockReset();
    authorize.mockReset();
    resolve.mockResolvedValue({ call: CALL, invitationId: 'inv_1' });
  });

  it('shows a checking state before the backend answers', () => {
    resolve.mockImplementation(() => new Promise(() => undefined));
    renderJoin();

    expect(screen.getByText(/looking up your invite/i)).toBeInTheDocument();
  });

  it('asks the backend rather than inspecting the token itself', async () => {
    resolve.mockImplementation(() => new Promise(() => undefined));
    renderJoin();

    await waitFor(() => expect(resolve).toHaveBeenCalledOnce());
    expect(resolve.mock.calls[0]![0]).toBe(TOKEN);
  });

  it('records no attendance until the person commits', async () => {
    renderJoin();

    // Resolving is read-only: the lobby is on screen and nothing has joined.
    expect(await screen.findByRole('button', { name: /join now/i })).toBeInTheDocument();
    expect(authorize).not.toHaveBeenCalled();
  });

  it.each([
    ['INVITE_REVOKED', /removed from this call/i],
    ['INVITE_EXPIRED', /invite has run out/i],
    ['JOIN_WINDOW_CLOSED', /wrapped up/i],
    ['PARTICIPANT_MISMATCH', /isn't for this account/i],
    ['PROVIDER_UNAVAILABLE', /can't connect you just now/i],
  ])('renders the specific backend denial for %s', async (code, expected) => {
    resolve.mockImplementation(() => Promise.reject(denial(code)));
    renderJoin();

    expect((await screen.findAllByText(expected)).length).toBeGreaterThan(0);
  });

  it('keeps the request id available for support', async () => {
    resolve.mockImplementation(() => Promise.reject(denial('INVITE_REVOKED')));
    renderJoin();

    expect(await screen.findByText(/req_join/)).toBeInTheDocument();
  });

  it('offers to switch account when the invitation belongs to someone else', async () => {
    resolve.mockImplementation(() => Promise.reject(denial('PARTICIPANT_MISMATCH')));
    renderJoin();

    expect(await screen.findByRole('link', { name: /switch account/i })).toBeInTheDocument();
  });

  it('does not offer a retry for a denial that cannot change', async () => {
    resolve.mockImplementation(() => Promise.reject(denial('INVITE_REVOKED')));
    renderJoin();

    await screen.findByText(/removed from this call/i);
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeInTheDocument();
  });

  it('enters the call only once the person joins from the lobby', async () => {
    const user = userEvent.setup();
    authorize.mockResolvedValue({
      call: CALL,
      role: 'PARTICIPANT',
      attendanceSession: {
        id: 'sess_1',
        deviceId: 'web-1',
        joinedAt: new Date().toISOString(),
        leftAt: null,
        leftReason: null,
        status: 'CONNECTED',
      },
      providerSession: { id: 'prov_1', expiresAt: new Date(Date.now() + 3_600_000).toISOString() },
    });

    renderJoin();

    await user.click(await screen.findByRole('button', { name: /join now/i }));

    await waitFor(() => expect(authorize).toHaveBeenCalledOnce());
    // The route falls through to the catch-all, i.e. we left /join/:token.
    expect(await screen.findByTestId('navigated')).toBeInTheDocument();
  });

  it('explains that an early arrival may wait', async () => {
    resolve.mockResolvedValue({
      call: { ...CALL, scheduledStart: new Date(Date.now() + 3_600_000).toISOString() },
      invitationId: 'inv_1',
    });

    renderJoin();

    expect(await screen.findByText(/make yourself comfortable/i)).toBeInTheDocument();
  });
});
