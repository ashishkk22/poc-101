import { afterEach, describe, expect, it, vi } from "vitest";
import { queryKeys } from "@/app/queryClient";
import { apiClient } from "@/lib/api";
import { ApiError } from "@/lib/errors";

/**
 * The client has to understand both envelopes the backend uses: the v1 API's
 * `{ error: {...} }` and Better Auth's flat `{ message, code }`.
 */
function mockResponse(
  body: unknown,
  init: { status: number; headers?: Record<string, string> },
) {
  return new Response(JSON.stringify(body), {
    status: init.status,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("apiClient error normalisation", () => {
  it("parses the v1 envelope, including the request id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockResponse(
          {
            error: {
              code: "INVITE_REVOKED",
              message: "This invitation is no longer valid.",
              requestId: "req_1",
            },
          },
          { status: 403 },
        ),
      ),
    );

    const error = await apiClient
      .get("/calls/x")
      .catch((caught: unknown) => caught);

    expect(ApiError.isApiError(error)).toBe(true);
    expect((error as ApiError).code).toBe("INVITE_REVOKED");
    expect((error as ApiError).requestId).toBe("req_1");
  });

  it("parses the flat Better Auth envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          mockResponse(
            {
              message: "Invalid email or password",
              code: "INVALID_EMAIL_OR_PASSWORD",
            },
            { status: 401 },
          ),
        ),
    );

    const error = await apiClient
      .auth("/sign-in/email", { method: "POST", body: {} })
      .catch((caught: unknown) => caught);

    expect((error as ApiError).code).toBe("INVALID_EMAIL_OR_PASSWORD");
    expect((error as ApiError).message).toBe("Invalid email or password");
  });

  it("falls back to the response header for a request id", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          mockResponse(
            {},
            { status: 500, headers: { "X-Request-Id": "req_header" } },
          ),
        ),
    );

    const error = await apiClient
      .get("/calls")
      .catch((caught: unknown) => caught);
    expect((error as ApiError).requestId).toBe("req_header");
  });

  it("sends credentials and a correlation id the backend echoes back", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(mockResponse({ data: { id: "c1" } }, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await apiClient.get("/calls/c1");

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.credentials).toBe("include");
    expect((init.headers as Record<string, string>)["X-Request-Id"]).toMatch(
      /^web_/,
    );
  });

  it("turns a transport failure into a network ApiError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
    );

    const error = await apiClient
      .get("/calls")
      .catch((caught: unknown) => caught);
    expect((error as ApiError).code).toBe("NETWORK_ERROR");
  });
});

describe("query keys", () => {
  it("separates paged and infinite reads of the same filters", () => {
    const filters = { role: "any", status: "LIVE", limit: 25 };

    // Sharing a key here would make a single-page observer and an infinite
    // observer fight over one cache entry with incompatible shapes.
    expect(queryKeys.calls(filters)).not.toEqual(
      queryKeys.callsInfinite(filters),
    );
  });

  it("scopes call-owned collections under the call", () => {
    // Invalidating ['call', id] must reach invitations, attendance and audit.
    expect(queryKeys.invitations("c1")[0]).toBe("call");
    expect(queryKeys.invitations("c1")[1]).toBe("c1");
  });
});
