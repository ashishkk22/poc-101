import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TranscriptView } from "@/features/transcript";
import { ApiError } from "@/lib/errors";
import { renderWithProviders } from "./testUtils";

const getForCall = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    transcriptApi: {
      ...actual.transcriptApi,
      getForCall: (...a: unknown[]) => getForCall(...a),
    },
  };
});

function transcript(status: string, extra: Record<string, unknown> = {}) {
  return {
    callId: "call_1",
    status,
    generatedAt: null,
    expiresAt: null,
    ...extra,
  };
}

describe("TranscriptPage states", () => {
  beforeEach(() => {
    getForCall.mockReset();
  });

  it("shows a loading state first", () => {
    getForCall.mockImplementation(() => new Promise(() => undefined));
    renderWithProviders(<TranscriptView callId="call_1" />);

    expect(screen.getByRole("status")).toHaveTextContent(/loading transcript/i);
  });

  it("treats 409 TRANSCRIPT_NOT_READY as processing, not an error", async () => {
    getForCall.mockImplementation(() =>
      Promise.reject(
        new ApiError({
          code: "TRANSCRIPT_NOT_READY",
          message: "not ready",
          status: 409,
        }),
      ),
    );

    renderWithProviders(<TranscriptView callId="call_1" />);

    expect(await screen.findByText(/writing this up/i)).toBeInTheDocument();
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
  });

  it("renders ready content", async () => {
    getForCall.mockResolvedValue(
      transcript("READY", {
        content: "Alice: hello\nBob: hi",
        generatedAt: new Date().toISOString(),
      }),
    );

    renderWithProviders(<TranscriptView callId="call_1" />);

    expect(await screen.findByText(/Alice: hello/)).toBeInTheDocument();
  });

  it("explains a failed transcript without blaming the call", async () => {
    getForCall.mockResolvedValue(transcript("FAILED"));
    renderWithProviders(<TranscriptView callId="call_1" />);

    expect(
      await screen.findByText(/couldn't write this one up/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/everything else about the meeting is still here/i),
    ).toBeInTheDocument();
  });

  it("explains a deleted transcript", async () => {
    getForCall.mockResolvedValue(transcript("DELETED"));
    renderWithProviders(<TranscriptView callId="call_1" />);

    expect(
      await screen.findByText(/this transcript is gone/i),
    ).toBeInTheDocument();
  });

  it("shows the mapped error when access is denied", async () => {
    getForCall.mockImplementation(() =>
      Promise.reject(
        new ApiError({
          code: "TRANSCRIPT_ACCESS_DENIED",
          message: "denied",
          status: 403,
        }),
      ),
    );

    renderWithProviders(<TranscriptView callId="call_1" />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /isn't yours to read/i,
    );
  });
});

describe("TranscriptView against the meeting's own state", () => {
  const notReady = () =>
    Promise.reject(
      new ApiError({
        code: "TRANSCRIPT_NOT_READY",
        message: "not ready",
        status: 409,
      }),
    );
  const minutesAgo = (minutes: number) =>
    new Date(Date.now() - minutes * 60_000).toISOString();

  beforeEach(() => {
    getForCall.mockReset();
  });

  it("does not promise 'a minute or two' long after the meeting ended", async () => {
    getForCall.mockImplementation(notReady);
    renderWithProviders(
      <TranscriptView
        callId="call_1"
        call={{
          status: "ENDED",
          scheduledEnd: minutesAgo(30),
          endedAt: minutesAgo(30),
        }}
      />,
    );

    expect(
      await screen.findByText(/taking longer than it should/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/minute or two\. this page/i)).toBeNull();
  });

  it("still says 'writing this up' just after the meeting ended", async () => {
    getForCall.mockImplementation(notReady);
    renderWithProviders(
      <TranscriptView
        callId="call_1"
        call={{
          status: "ENDED",
          scheduledEnd: minutesAgo(-30),
          endedAt: minutesAgo(1),
        }}
      />,
    );

    expect(await screen.findByText(/writing this up/i)).toBeInTheDocument();
  });

  it("waits for a live meeting to end instead of polling for a transcript", () => {
    renderWithProviders(
      <TranscriptView
        callId="call_1"
        call={{ status: "LIVE", scheduledEnd: minutesAgo(-30), endedAt: null }}
      />,
    );

    expect(screen.getByText(/written up after the meeting/i)).toBeInTheDocument();
    expect(getForCall).not.toHaveBeenCalled();
  });

  it("says a cancelled meeting has no transcript", () => {
    renderWithProviders(
      <TranscriptView
        callId="call_1"
        call={{ status: "CANCELLED", scheduledEnd: minutesAgo(-30), endedAt: null }}
      />,
    );

    expect(screen.getByText(/meeting was cancelled/i)).toBeInTheDocument();
    expect(getForCall).not.toHaveBeenCalled();
  });
});
