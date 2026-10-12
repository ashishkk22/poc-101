import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VideoTile } from "@/components/call/VideoTile";

/**
 * A peer who turns their camera off or mutes still sends a live, "enabled"
 * track — black frames and silence. The receiving tile cannot see that from
 * the track, so it has to go by the state the peer announced.
 */
function liveRemoteStream({ muted = false } = {}): MediaStream {
  const video = { kind: "video", enabled: true, readyState: "live", muted, stop: vi.fn() };
  const audio = { kind: "audio", enabled: true, readyState: "live", stop: vi.fn() };
  return {
    getTracks: () => [video, audio],
    getVideoTracks: () => [video],
    getAudioTracks: () => [audio],
  } as unknown as MediaStream;
}

function videoElement(container: HTMLElement): HTMLVideoElement {
  const element = container.querySelector("video");
  if (!element) throw new Error("no video element");
  return element;
}

describe("a remote participant's tile", () => {
  it("shows their video while they say the camera is on", () => {
    const { container } = render(
      <VideoTile name="Sam Lee" stream={liveRemoteStream()} cameraOn micOn />,
    );

    expect(videoElement(container)).not.toHaveClass("hidden");
    expect(screen.queryByText("Camera off")).not.toBeInTheDocument();
  });

  it("shows camera off even though the track is still live", () => {
    const { container } = render(
      <VideoTile
        name="Sam Lee"
        stream={liveRemoteStream()}
        cameraOn={false}
        micOn
      />,
    );

    // Hidden, not removed: the same element still plays their audio.
    expect(videoElement(container)).toHaveClass("hidden");
    expect(screen.getByText("Camera off")).toBeInTheDocument();
  });

  it("marks them muted when they say so", () => {
    const { container } = render(
      <VideoTile
        name="Sam Lee"
        stream={liveRemoteStream()}
        cameraOn
        micOn={false}
      />,
    );

    expect(container.querySelector(".lucide-mic-off")).toBeInTheDocument();
  });

  it("shows someone who has joined as here, not as connecting", () => {
    render(
      <VideoTile
        name="Sam Lee"
        stream={liveRemoteStream({ muted: true })}
        cameraOn
        micOn
        state="CONNECTING"
      />,
    );

    expect(screen.getByText("Sam Lee")).toBeInTheDocument();
    expect(screen.queryByText(/connecting/i)).not.toBeInTheDocument();
  });

  it("shows their name, not a black box, until their first frame arrives", () => {
    const { container } = render(
      <VideoTile
        name="Sam Lee"
        stream={liveRemoteStream({ muted: true })}
        cameraOn
        micOn
      />,
    );

    expect(videoElement(container)).toHaveClass("hidden");
    expect(screen.getByText("SL")).toBeInTheDocument();
  });

  it("says so when a connection could not be made at all", () => {
    render(
      <VideoTile name="Sam Lee" stream={null} cameraOn micOn state="FAILED" />,
    );

    expect(screen.getByText("Could not connect")).toBeInTheDocument();
  });
});
