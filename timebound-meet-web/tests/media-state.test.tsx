import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLocalMedia } from '@/features/join';

/**
 * Muting is a promise the interface makes on someone's behalf.
 *
 * Freshly granted tracks always arrive enabled, and the call requests its own
 * devices separately from the lobby. Without care that means a participant who
 * deliberately muted themselves walks into the call live — the interface
 * showing "muted" over an open microphone.
 */
function fakeTrack(kind: 'audio' | 'video') {
  return { kind, enabled: true, readyState: 'live', stop: vi.fn() };
}

let audio = fakeTrack('audio');
let video = fakeTrack('video');

function fakeStream() {
  return {
    getTracks: () => [audio, video],
    getAudioTracks: () => [audio],
    getVideoTracks: () => [video],
  } as unknown as MediaStream;
}

beforeEach(() => {
  audio = fakeTrack('audio');
  video = fakeTrack('video');
  vi.stubGlobal('navigator', {
    ...navigator,
    mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(fakeStream()) },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe('the microphone and camera the call opens with', () => {
  it('starts on when nothing was chosen', async () => {
    const { result } = renderHook(() => useLocalMedia({ enabled: true }));

    await waitFor(() => expect(result.current.permission).toBe('GRANTED'));
    expect(result.current.micOn).toBe(true);
    expect(audio.enabled).toBe(true);
    expect(video.enabled).toBe(true);
  });

  it('opens muted when the lobby was left muted', async () => {
    const { result } = renderHook(() =>
      useLocalMedia({ enabled: true, initialMicOn: false, initialCameraOn: true }),
    );

    await waitFor(() => expect(result.current.permission).toBe('GRANTED'));
    expect(result.current.micOn).toBe(false);
    // The promise the button made has to hold on the actual track.
    expect(audio.enabled).toBe(false);
    expect(video.enabled).toBe(true);
  });

  it('opens with the camera off when that is what was chosen', async () => {
    const { result } = renderHook(() =>
      useLocalMedia({ enabled: true, initialMicOn: true, initialCameraOn: false }),
    );

    await waitFor(() => expect(result.current.permission).toBe('GRANTED'));
    expect(result.current.cameraOn).toBe(false);
    expect(video.enabled).toBe(false);
    expect(audio.enabled).toBe(true);
  });

  it('never shows muted over a live microphone', async () => {
    const { result } = renderHook(() =>
      useLocalMedia({ enabled: true, initialMicOn: false, initialCameraOn: false }),
    );

    await waitFor(() => expect(result.current.permission).toBe('GRANTED'));

    // What the interface says and what the hardware does must agree.
    expect(result.current.micOn).toBe(audio.enabled);
    expect(result.current.cameraOn).toBe(video.enabled);
  });
});

describe('toggling during a call', () => {
  it('mutes and unmutes the live track', async () => {
    const { result } = renderHook(() => useLocalMedia({ enabled: true }));
    await waitFor(() => expect(result.current.permission).toBe('GRANTED'));

    act(() => result.current.toggleMic());
    expect(result.current.micOn).toBe(false);
    expect(audio.enabled).toBe(false);

    act(() => result.current.toggleMic());
    expect(result.current.micOn).toBe(true);
    expect(audio.enabled).toBe(true);
  });

  it('survives being toggled repeatedly', async () => {
    const { result } = renderHook(() => useLocalMedia({ enabled: true }));
    await waitFor(() => expect(result.current.permission).toBe('GRANTED'));

    for (let i = 0; i < 3; i += 1) {
      act(() => result.current.toggleMic());
      act(() => result.current.toggleCamera());
    }
    for (let i = 0; i < 3; i += 1) {
      act(() => result.current.toggleMic());
      act(() => result.current.toggleCamera());
    }

    expect(result.current.micOn).toBe(audio.enabled);
    expect(result.current.cameraOn).toBe(video.enabled);
    expect(audio.enabled).toBe(true);
    expect(video.enabled).toBe(true);
  });

  it('releases the hardware when the call is left', async () => {
    const { result, unmount } = renderHook(() => useLocalMedia({ enabled: true }));
    await waitFor(() => expect(result.current.permission).toBe('GRANTED'));

    unmount();

    // A forgotten track leaves the camera light on after the call ends.
    expect(audio.stop).toHaveBeenCalled();
    expect(video.stop).toHaveBeenCalled();
  });
});
