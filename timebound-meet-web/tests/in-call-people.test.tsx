import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CallPeoplePanel } from '@/features/call-media';
import { ThemeProvider } from '@/lib/theme/theme-provider';
import { createTestQueryClient } from './test-utils';
import type { CallParticipant } from '@/lib/api/types';

const listForCall = vi.fn();
const revoke = vi.fn();
const lookupByEmail = vi.fn();
const createInvitation = vi.fn();

vi.mock('@/lib/api', async () => {
  const actual = await vi.importActual<typeof import('@/lib/api')>('@/lib/api');
  return {
    ...actual,
    invitationsApi: {
      ...actual.invitationsApi,
      listForCall: (...a: unknown[]) => listForCall(...a),
      revoke: (...a: unknown[]) => revoke(...a),
      create: (...a: unknown[]) => createInvitation(...a),
    },
    usersApi: { ...actual.usersApi, lookupByEmail: (...a: unknown[]) => lookupByEmail(...a) },
  };
});

const HOST: CallParticipant = {
  id: 'u_host',
  name: 'Olivia Organizer',
  isOrganizer: true,
  joinedAt: new Date().toISOString(),
  connections: 1,
};

const GUEST: CallParticipant = {
  id: 'u_alice',
  name: 'Alice Participant',
  isOrganizer: false,
  joinedAt: new Date().toISOString(),
  connections: 1,
};

function invitation(participantId: string, name: string) {
  return {
    id: `inv_${participantId}`,
    callId: 'call_1',
    participantId,
    participant: { id: participantId, name, email: `${name}@example.com` },
    status: 'ACTIVE' as const,
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    revokedAt: null,
    lastUsedAt: null,
  };
}

function renderPanel(participants: CallParticipant[], isOrganizer = true) {
  const client = createTestQueryClient();
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <ThemeProvider>
        <QueryClientProvider client={client}>
          <MemoryRouter>{children}</MemoryRouter>
        </QueryClientProvider>
      </ThemeProvider>
    );
  }

  return render(
    <CallPeoplePanel
      callId="call_1"
      participants={participants}
      currentUserId="u_host"
      isOrganizer={isOrganizer}
    />,
    { wrapper: Wrapper },
  );
}

describe('Managing guests without leaving the call', () => {
  beforeEach(() => {
    listForCall.mockReset();
    revoke.mockReset();
    lookupByEmail.mockReset();
    createInvitation.mockReset();
    listForCall.mockResolvedValue({ items: [invitation('u_alice', 'Alice')], nextCursor: null });
  });

  it('lets the host invite someone from inside the call', async () => {
    const user = userEvent.setup();
    lookupByEmail.mockResolvedValue({ id: 'u_bob', name: 'Bob Chen', email: 'bob@example.com' });
    createInvitation.mockResolvedValue({
      ...invitation('u_bob', 'Bob'),
      joinUrl: 'http://localhost:5173/join/tok',
    });

    renderPanel([HOST]);

    await user.click(await screen.findByRole('button', { name: /invite/i }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/participant email/i), 'bob@example.com');
    await user.click(within(dialog).getByRole('button', { name: 'Find' }));
    await user.click(await within(dialog).findByRole('button', { name: /issue invitation/i }));

    await waitFor(() => expect(createInvitation).toHaveBeenCalledOnce());
    // The join link is shown here, in the call — no page to navigate to.
    expect(await within(dialog).findByDisplayValue(/join\/tok/)).toBeInTheDocument();
  });

  it('lets the host remove someone mid-call', async () => {
    const user = userEvent.setup();
    revoke.mockResolvedValue({
      invitationId: 'inv_u_alice',
      status: 'REVOKED',
      revokedAt: new Date().toISOString(),
    });

    renderPanel([HOST, GUEST]);

    await user.click(await screen.findByRole('button', { name: /remove alice/i }));
    await user.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: /take it back/i }),
    );

    await waitFor(() => expect(revoke).toHaveBeenCalledWith('inv_u_alice'));
  });

  it('asks before removing anyone', async () => {
    const user = userEvent.setup();
    renderPanel([HOST, GUEST]);

    await user.click(await screen.findByRole('button', { name: /remove alice/i }));

    expect(await screen.findByRole('dialog')).toHaveTextContent(/take back this invite/i);
    expect(revoke).not.toHaveBeenCalled();
  });

  it('never offers the host a way to remove themselves', async () => {
    renderPanel([HOST]);

    await screen.findByRole('button', { name: /invite/i });
    expect(screen.queryByRole('button', { name: /remove olivia/i })).not.toBeInTheDocument();
  });

  it('shows who was invited but has not arrived', async () => {
    listForCall.mockResolvedValue({
      items: [invitation('u_alice', 'Alice'), invitation('u_bob', 'Bob')],
      nextCursor: null,
    });

    renderPanel([HOST, GUEST]);

    expect(await screen.findByText(/invited · 1/i)).toBeInTheDocument();
    expect(screen.getByText('Not here yet')).toBeInTheDocument();
  });

  it('keeps the guest list to the host', async () => {
    renderPanel([HOST, GUEST], false);

    await screen.findByText('Alice Participant');
    expect(screen.queryByRole('button', { name: /invite/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /remove/i })).not.toBeInTheDocument();
    // A participant must not even request the organizer-only list.
    expect(listForCall).not.toHaveBeenCalled();
  });
});
