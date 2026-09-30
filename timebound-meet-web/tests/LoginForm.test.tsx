import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoginForm } from "@/features/auth";
import { ApiError } from "@/lib/errors";
import { renderWithProviders } from "./testUtils";

const signIn = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    authApi: { signIn: (...args: unknown[]) => signIn(...args) },
  };
});

describe("LoginPage form", () => {
  beforeEach(() => {
    signIn.mockReset();
  });

  it("validates before touching the network", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginForm onSuccess={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText(/email is required/i)).toBeInTheDocument();
    expect(signIn).not.toHaveBeenCalled();
  });

  it("rejects a malformed email", async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginForm onSuccess={vi.fn()} />);

    await user.type(screen.getByLabelText("Email"), "not-an-email");
    await user.type(screen.getByLabelText("Password"), "SyncDemo123!");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByText(/valid email/i)).toBeInTheDocument();
    expect(signIn).not.toHaveBeenCalled();
  });

  it("signs in and reports success upward", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    signIn.mockResolvedValue(undefined);

    renderWithProviders(<LoginForm onSuccess={onSuccess} />);

    await user.type(screen.getByLabelText("Email"), "organizer@example.com");
    await user.type(screen.getByLabelText("Password"), "SyncDemo123!");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
    expect(signIn).toHaveBeenCalledWith({
      email: "organizer@example.com",
      password: "SyncDemo123!",
    });
  });

  it("shows the auth failure the backend actually returns", async () => {
    const user = userEvent.setup();

    // Better Auth answers with a flat { message, code } envelope — not the v1
    // { error: {...} } shape — and gives the same code whether the account is
    // unknown or the password is wrong.
    signIn.mockImplementation(() =>
      Promise.reject(
        new ApiError({
          code: "INVALID_EMAIL_OR_PASSWORD",
          message: "Invalid email or password",
          status: 401,
        }),
      ),
    );

    renderWithProviders(<LoginForm onSuccess={vi.fn()} />);

    await user.type(screen.getByLabelText("Email"), "nobody@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/email or password doesn't match/i);
    // Nothing in the copy may hint at which of the two was wrong.
    expect(alert).not.toHaveTextContent(/account|user|exists|registered/i);
  });

  it("blocks the submit button while the request is in flight", async () => {
    const user = userEvent.setup();
    signIn.mockImplementation(() => new Promise(() => undefined));

    renderWithProviders(<LoginForm onSuccess={vi.fn()} />);

    await user.type(screen.getByLabelText("Email"), "organizer@example.com");
    await user.type(screen.getByLabelText("Password"), "SyncDemo123!");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /sign in/i })).toBeDisabled(),
    );
  });
});
