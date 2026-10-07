import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CallForm } from "@/features/calls";
import { ApiError } from "@/lib/errors";
import { renderWithProviders } from "./testUtils";

describe("CreateCallPage form", () => {
  it("requires a title", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithProviders(
      <CallForm onSubmit={onSubmit} pending={false} error={null} />,
    );

    await user.click(screen.getByRole("button", { name: /set it up/i }));

    expect(await screen.findByText(/title is required/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("rejects an end time that is not after the start", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithProviders(
      <CallForm onSubmit={onSubmit} pending={false} error={null} />,
    );

    await user.type(screen.getByLabelText(/title/i), "Roadmap planning");
    await user.clear(screen.getByLabelText(/starts/i));
    await user.type(screen.getByLabelText(/starts/i), "2026-10-03T14:00");
    await user.clear(screen.getByLabelText(/ends/i));
    await user.type(screen.getByLabelText(/ends/i), "2026-10-03T13:00");
    await user.click(screen.getByRole("button", { name: /set it up/i }));

    expect(
      await screen.findByText(/end time must be after the start/i),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits UTC timestamps to the API", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithProviders(
      <CallForm onSubmit={onSubmit} pending={false} error={null} />,
    );

    await user.type(screen.getByLabelText(/title/i), "  Security review  ");
    await user.click(screen.getByRole("button", { name: /set it up/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());

    const input = onSubmit.mock.calls[0]![0] as {
      title: string;
      scheduledStart: string;
      scheduledEnd: string;
    };

    expect(input.title).toBe("Security review");
    expect(input.scheduledStart).toMatch(/Z$/);
    expect(new Date(input.scheduledEnd) > new Date(input.scheduledStart)).toBe(
      true,
    );
  });

  it("shows the backend rejection even when the client was happy", () => {
    renderWithProviders(
      <CallForm
        onSubmit={vi.fn()}
        pending={false}
        error={
          new ApiError({
            code: "VALIDATION_ERROR",
            message: "The request payload is invalid.",
            status: 400,
            details: [{ path: "timezone", message: "Unknown IANA timezone" }],
            requestId: "req_tz",
          })
        }
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      /unknown iana timezone/i,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/req_tz/);
  });

  it("disables submission while the mutation is pending", () => {
    renderWithProviders(<CallForm onSubmit={vi.fn()} pending error={null} />);
    expect(screen.getByRole("button", { name: /set it up/i })).toBeDisabled();
  });
});

describe("scheduling in another timezone", () => {
  it("sends the time as the chosen zone reads it, not the browser", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithProviders(
      <CallForm onSubmit={onSubmit} pending={false} error={null} />,
    );

    await user.type(screen.getByLabelText(/title/i), "Handover with New York");

    // Pick a zone that is not this machine's.
    await user.click(screen.getByRole("combobox", { name: /timezone/i }));
    await user.type(
      await screen.findByLabelText(/search timezones/i),
      "New_York",
    );
    await user.click(await screen.findByRole("option", { name: /New York/i }));

    await user.clear(screen.getByLabelText(/starts/i));
    await user.type(screen.getByLabelText(/starts/i), "2026-10-03T14:00");
    await user.clear(screen.getByLabelText(/ends/i));
    await user.type(screen.getByLabelText(/ends/i), "2026-10-03T15:00");

    await user.click(screen.getByRole("button", { name: /set it up/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    const input = onSubmit.mock.calls[0]![0] as {
      scheduledStart: string;
      scheduledEnd: string;
      timezone: string;
    };

    // 14:00 in New York is 18:00Z. Reading it in the browser's zone — which is
    // what the form used to do — would have produced 08:30Z.
    expect(input.timezone).toBe("America/New_York");
    expect(input.scheduledStart).toBe("2026-10-03T18:00:00.000Z");
    expect(input.scheduledEnd).toBe("2026-10-03T19:00:00.000Z");
  });

  it("defaults to the viewer's own zone", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithProviders(
      <CallForm onSubmit={onSubmit} pending={false} error={null} />,
    );

    await user.type(screen.getByLabelText(/title/i), "Local catch-up");
    await user.click(screen.getByRole("button", { name: /set it up/i }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledOnce());
    const input = onSubmit.mock.calls[0]![0] as { timezone: string };
    expect(input.timezone).toBe(
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
  });
});
