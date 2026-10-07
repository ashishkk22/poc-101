import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CallLobby } from "@/features/join";
import type { LocalMedia } from "@/features/join";
import { ThemeProvider } from "@/lib/theme/ThemeProvider";

/**
 * Turning the camera off does not release it — the track stays live with
 * `enabled = false`, which is why the camera light stays on. So when it is
 * turned back on there is no new stream, and anything that waits for the
 * stream to change before attaching it leaves a blank preview over a running
 * camera. That is the bug these tests exist for.
 */
const CALL = {
  id: "call_1",
  title: "Weekly catch-up",
  scheduledStart: new Date(Date.now() + 600_000).toISOString(),
  scheduledEnd: new Date(Date.now() + 4_200_000).toISOString(),
  timezone: "UTC",
  status: "SCHEDULED" as const,
};

/** A stand-in for a live camera: one stream object that never changes. */
function fakeStream(): MediaStream {
  const track = {
    kind: "video",
    enabled: true,
    readyState: "live",
    stop: vi.fn(),
  };
  return {
    getTracks: () => [track],
    getVideoTracks: () => [track],
    getAudioTracks: () => [],
  } as unknown as MediaStream;
}

function harness(stream: MediaStream) {
  let cameraOn = true;

  function media(setCameraOn: (on: boolean) => void): LocalMedia {
    return {
      stream,
      permission: "GRANTED",
      micOn: true,
      cameraOn,
      setMicOn: vi.fn(),
      setCameraOn: vi.fn(),
      toggleMic: vi.fn(),
      toggleCamera: () => {
        cameraOn = !cameraOn;
        setCameraOn(cameraOn);
      },
      stop: vi.fn(),
      error: null,
    };
  }

  return { media, isCameraOn: () => cameraOn };
}

function renderLobby(stream: MediaStream) {
  const { media } = harness(stream);

  function Wrapper() {
    // The real hook re-renders on toggle; this stands in for that.
    const [, force] = useState(0);
    return (
      <ThemeProvider>
        <CallLobby
          call={CALL}
          viewerName="Olivia Organizer"
          media={media(() => force(n => n + 1))}
          joining={false}
          error={null}
          roleLabel="You are the host"
          onJoin={vi.fn()}
          onCancel={vi.fn()}
        />
      </ThemeProvider>
    );
  }

  return render(<Wrapper />);
}

function preview(): HTMLVideoElement {
  const element = document.querySelector("video");
  if (!element) throw new Error("no preview element");
  return element as HTMLVideoElement;
}

describe("the lobby camera preview", () => {
  it("shows the camera when it is on", () => {
    const stream = fakeStream();
    renderLobby(stream);

    expect(preview().srcObject).toBe(stream);
    expect(preview()).not.toHaveClass("hidden");
  });

  it("keeps the stream attached after the camera is turned off and on again", async () => {
    const user = userEvent.setup();
    const stream = fakeStream();
    renderLobby(stream);

    await user.click(screen.getByRole("button", { name: /turn camera off/i }));
    expect(preview()).toHaveClass("hidden");

    await user.click(screen.getByRole("button", { name: /turn camera on/i }));

    // The stream never changed, so anything keyed on it would not re-attach —
    // leaving a blank preview with the camera light still on.
    expect(preview().srcObject).toBe(stream);
    expect(preview()).not.toHaveClass("hidden");
  });

  it("survives being toggled repeatedly", async () => {
    const user = userEvent.setup();
    const stream = fakeStream();
    renderLobby(stream);

    for (let i = 0; i < 3; i += 1) {
      await user.click(
        screen.getByRole("button", { name: /turn camera off/i }),
      );
      await user.click(screen.getByRole("button", { name: /turn camera on/i }));
    }

    expect(preview().srcObject).toBe(stream);
    expect(preview()).not.toHaveClass("hidden");
  });

  it("shows the avatar while the camera is off", async () => {
    const user = userEvent.setup();
    renderLobby(fakeStream());

    await user.click(screen.getByRole("button", { name: /turn camera off/i }));

    expect(screen.getByText("Camera off")).toBeInTheDocument();
  });
});
