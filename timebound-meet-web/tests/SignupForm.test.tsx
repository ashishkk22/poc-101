import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignupForm } from "@/features/auth";
import { ApiError } from "@/lib/errors";
import { renderWithProviders } from "./testUtils";

const signUp = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    authApi: { ...actual.authApi, signUp: (...a: unknown[]) => signUp(...a) },
  };
});

async function fill(
  user: ReturnType<typeof userEvent.setup>,
  password: string,
) {
  await user.type(screen.getByLabelText("Full name"), "Alex Rivera");
  await user.type(screen.getByLabelText("Email"), "alex@example.com");
  await user.type(screen.getByLabelText("Password"), password);
  await user.type(screen.getByLabelText("Confirm password"), password);
}

describe("SignupPage form", () => {
  beforeEach(() => {
    signUp.mockReset();
  });

  it("enforces the backend minimum length before submitting", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SignupForm onSuccess={vi.fn()} />);

    await fill(user, "short123");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(
      await screen.findByText(/at least 12 characters/i),
    ).toBeInTheDocument();
    expect(signUp).not.toHaveBeenCalled();
  });

  it("requires the confirmation to match", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SignupForm onSuccess={vi.fn()} />);

    await user.type(screen.getByLabelText("Full name"), "Alex Rivera");
    await user.type(screen.getByLabelText("Email"), "alex@example.com");
    await user.type(screen.getByLabelText("Password"), "CorrectHorse123!");
    await user.type(
      screen.getByLabelText("Confirm password"),
      "CorrectHorse999!",
    );
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(
      await screen.findByText(/passwords do not match/i),
    ).toBeInTheDocument();
    expect(signUp).not.toHaveBeenCalled();
  });

  it("submits a trimmed payload and reports success", async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    signUp.mockResolvedValue(undefined);

    renderWithProviders(<SignupForm onSuccess={onSuccess} />);

    await fill(user, "CorrectHorse123!");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
    expect(signUp).toHaveBeenCalledWith({
      name: "Alex Rivera",
      email: "alex@example.com",
      password: "CorrectHorse123!",
    });
  });

  it("surfaces Better Auth's duplicate-account rejection", async () => {
    const user = userEvent.setup();
    signUp.mockImplementation(() =>
      Promise.reject(
        new ApiError({
          code: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
          message: "User already exists. Use another email.",
          status: 422,
        }),
      ),
    );

    renderWithProviders(<SignupForm onSuccess={vi.fn()} />);

    await fill(user, "CorrectHorse123!");
    await user.click(screen.getByRole("button", { name: /create account/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /that email is taken/i,
    );
  });

  it("reports password strength as the field is typed", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SignupForm onSuccess={vi.fn()} />);

    await user.type(screen.getByLabelText("Password"), "CorrectHorse123!");

    expect(
      await screen.findByText(/password strength: strong/i),
    ).toBeInTheDocument();
  });
});
