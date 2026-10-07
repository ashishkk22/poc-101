import { renderHook, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSignOut } from "@/features/auth";
import { createQueryClient } from "@/app/queryClient";
import { AppShell } from "@/components/layout/AppShell";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { ApiError } from "@/lib/errors";
import { createTestQueryClient, renderWithProviders } from "./testUtils";

const signOut = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    authApi: { ...actual.authApi, signOut: () => signOut() },
  };
});

function wrapper(client: ReturnType<typeof createQueryClient>) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    );
  };
}

describe("Sign out from the app", () => {
  beforeEach(() => {
    signOut.mockReset();
  });

  it("lands on the home page, not the page it was on", async () => {
    signOut.mockResolvedValue(undefined);
    const queryClient = createTestQueryClient();
    queryClient.setQueryData(["session"], {
      id: "u1",
      name: "Olivia",
      email: "o@example.com",
    });

    renderWithProviders(
      <Routes>
        <Route path="/" element={<h1>Home</h1>} />
        <Route path="/login" element={<h1>Login</h1>} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="/dashboard" element={<h1>Dashboard</h1>} />
          </Route>
        </Route>
      </Routes>,
      { route: "/dashboard", queryClient },
    );

    expect(screen.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(
      await screen.findByRole("heading", { name: "Home" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Dashboard" })).toBeNull();
  });
});

describe("Signing out", () => {
  beforeEach(() => {
    signOut.mockReset();
  });

  it("clears the cached session once the server confirms", async () => {
    signOut.mockResolvedValue(undefined);
    const client = createQueryClient();
    client.setQueryData(["session"], {
      id: "u1",
      name: "Olivia",
      email: "o@example.com",
    });
    client.setQueryData(["calls", "page", {}], {
      items: [{ id: "c1" }],
      nextCursor: null,
    });

    const { result } = renderHook(() => useSignOut(), {
      wrapper: wrapper(client),
    });
    result.current.mutate();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryData(["session"])).toBeNull();
    // Everything cached belonged to the session that just ended.
    expect(client.getQueryData(["calls", "page", {}])).toBeUndefined();
  });

  it("does NOT present a failed sign-out as success", async () => {
    // The session cookie is HttpOnly: only the server can end it. Clearing
    // local state here would show a signed-out interface over a live session.
    signOut.mockImplementation(() =>
      Promise.reject(
        new ApiError({
          code: "RATE_LIMITED",
          message: "Too many requests.",
          status: 429,
        }),
      ),
    );

    const client = createQueryClient();
    const session = { id: "u1", name: "Olivia", email: "o@example.com" };
    client.setQueryData(["session"], session);

    const { result } = renderHook(() => useSignOut(), {
      wrapper: wrapper(client),
    });
    result.current.mutate();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.getQueryData(["session"])).toEqual(session);
  });

  it("reports a network failure rather than silently signing out", async () => {
    signOut.mockImplementation(() => Promise.reject(ApiError.network()));

    const client = createQueryClient();
    client.setQueryData(["session"], {
      id: "u1",
      name: "Olivia",
      email: "o@example.com",
    });

    const { result } = renderHook(() => useSignOut(), {
      wrapper: wrapper(client),
    });
    result.current.mutate();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(client.getQueryData(["session"])).not.toBeNull();
  });
});

describe("A session that ends elsewhere", () => {
  it("drops the cached session when any request reports it expired", async () => {
    const client = createQueryClient();
    client.setQueryData(["session"], {
      id: "u1",
      name: "Olivia",
      email: "o@example.com",
    });

    // Any query can be the one that finds out — here, an unrelated call read.
    await client
      .fetchQuery({
        queryKey: ["calls", "page", { role: "any" }],
        queryFn: () =>
          Promise.reject(
            new ApiError({
              code: "AUTHENTICATION_REQUIRED",
              message: "Authentication is required.",
              status: 401,
            }),
          ),
      })
      .catch(() => undefined);

    await waitFor(() => expect(client.getQueryData(["session"])).toBeNull());
  });

  it("leaves the session alone for an ordinary failure", async () => {
    const client = createQueryClient();
    const session = { id: "u1", name: "Olivia", email: "o@example.com" };
    client.setQueryData(["session"], session);

    await client
      .fetchQuery({
        queryKey: ["calls", "page", { role: "any" }],
        // Retries are covered elsewhere; this test is about the session only.
        retry: false,
        queryFn: () =>
          Promise.reject(
            new ApiError({
              code: "INTERNAL_ERROR",
              message: "boom",
              status: 500,
            }),
          ),
      })
      .catch(() => undefined);

    expect(client.getQueryData(["session"])).toEqual(session);
  });
});
