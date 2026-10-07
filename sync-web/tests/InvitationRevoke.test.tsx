import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { InvitationTable } from "@/features/invitations";
import { ApiError } from "@/lib/errors";
import { renderWithProviders } from "./testUtils";

const listForCall = vi.fn();
const revoke = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    invitationsApi: {
      ...actual.invitationsApi,
      listForCall: (...args: unknown[]) => listForCall(...args),
      revoke: (...args: unknown[]) => revoke(...args),
    },
  };
});

const INVITATION = {
  id: "inv_1",
  callId: "call_1",
  participantId: "user_alice",
  participant: {
    id: "user_alice",
    name: "Alice Participant",
    email: "alice@example.com",
  },
  status: "ACTIVE" as const,
  issuedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  revokedAt: null,
  lastUsedAt: null,
};

describe("Invitation revocation", () => {
  beforeEach(() => {
    listForCall.mockReset();
    revoke.mockReset();
    listForCall.mockResolvedValue({ items: [INVITATION], nextCursor: null });
  });

  it("renders a loading state before the list arrives", () => {
    listForCall.mockImplementation(() => new Promise(() => undefined));
    renderWithProviders(<InvitationTable callId="call_1" />);

    expect(screen.getByRole("status")).toHaveTextContent(
      /loading invitations/i,
    );
  });

  it("renders an empty state when nobody is invited", async () => {
    listForCall.mockResolvedValue({ items: [], nextCursor: null });
    renderWithProviders(<InvitationTable callId="call_1" />);

    expect(await screen.findByText(/no invitations yet/i)).toBeInTheDocument();
  });

  it("confirms before revoking", async () => {
    const user = userEvent.setup();
    renderWithProviders(<InvitationTable callId="call_1" />);

    await user.click(await screen.findByRole("button", { name: /revoke/i }));

    expect(await screen.findByRole("dialog")).toHaveTextContent(
      /take back this invite/i,
    );
    expect(revoke).not.toHaveBeenCalled();
  });

  it("patches the row to revoked once the backend confirms", async () => {
    const user = userEvent.setup();
    const revokedAt = new Date().toISOString();

    // The backend is the source of truth, so the refetch that follows a
    // revoke reports the new state too.
    revoke.mockImplementation(() => {
      listForCall.mockResolvedValue({
        items: [{ ...INVITATION, status: "REVOKED", revokedAt }],
        nextCursor: null,
      });
      return Promise.resolve({
        invitationId: "inv_1",
        status: "REVOKED",
        revokedAt,
      });
    });

    renderWithProviders(<InvitationTable callId="call_1" />);

    await user.click(await screen.findByRole("button", { name: /revoke/i }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: /take it back/i,
      }),
    );

    await waitFor(() =>
      expect(screen.getByText("Revoked")).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: /^revoke$/i }),
    ).not.toBeInTheDocument();

    // The cache patch has to cope with the paginated shape the table holds;
    // getting it wrong surfaces here as a failed mutation.
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("patches the cached page before any refetch returns", async () => {
    const user = userEvent.setup();
    const revokedAt = new Date().toISOString();

    // The refetch triggered by invalidation never settles, so the only thing
    // that can flip this row is the optimistic patch — and it has to reach the
    // paginated cache entry the table actually holds.
    revoke.mockImplementation(() => {
      listForCall.mockImplementation(() => new Promise(() => undefined));
      return Promise.resolve({
        invitationId: "inv_1",
        status: "REVOKED",
        revokedAt,
      });
    });

    renderWithProviders(<InvitationTable callId="call_1" />);

    await user.click(await screen.findByRole("button", { name: /revoke/i }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: /take it back/i,
      }),
    );

    await waitFor(() =>
      expect(screen.getByText("Revoked")).toBeInTheDocument(),
    );
  });

  it("keeps the row active and reports the failure when revoke fails", async () => {
    const user = userEvent.setup();
    revoke.mockImplementation(() =>
      Promise.reject(
        new ApiError({
          code: "CONFLICT",
          message: "conflict",
          status: 409,
          requestId: "req_rv",
        }),
      ),
    );

    renderWithProviders(<InvitationTable callId="call_1" />);

    await user.click(await screen.findByRole("button", { name: /revoke/i }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: /take it back/i,
      }),
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /something changed/i,
    );
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("disables the action while the revoke is pending", async () => {
    const user = userEvent.setup();
    revoke.mockImplementation(() => new Promise(() => undefined));

    renderWithProviders(<InvitationTable callId="call_1" />);

    await user.click(await screen.findByRole("button", { name: /revoke/i }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: /take it back/i,
      }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /take it back/i }),
      ).toBeDisabled(),
    );
  });
});
