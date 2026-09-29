import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * The local camera and microphone.
 *
 * This is genuinely the viewer's own hardware — the self-view is a real
 * stream, not a placeholder. Remote participants stay placeholders until a
 * provider adapter is connected, and nothing here influences authorization:
 * a denied camera never blocks entry, it only changes what you send.
 */
export type MediaPermission = 'IDLE' | 'PROMPTING' | 'GRANTED' | 'DENIED' | 'UNAVAILABLE';

export interface LocalMedia {
  stream: MediaStream | null;
  permission: MediaPermission;
  micOn: boolean;
  cameraOn: boolean;
  setMicOn: (on: boolean) => void;
  setCameraOn: (on: boolean) => void;
  toggleMic: () => void;
  toggleCamera: () => void;
  /** Releases the hardware. Always called when leaving a call. */
  stop: () => void;
  error: string | null;
}

/**
 * Attaches a stream to a `<video>` element.
 *
 * Deliberately a callback ref rather than an effect keyed on the stream: the
 * ELEMENT comes and goes (a preview hidden while the camera is off, a tile
 * that unmounts), and a stream that has not changed would leave a freshly
 * mounted element blank while the camera light stayed on.
 */
export function useVideoStream(
  stream: MediaStream | null | undefined,
): (element: HTMLVideoElement | null) => void {
  return useCallback(
    (element: HTMLVideoElement | null) => {
      if (element) element.srcObject = stream ?? null;
    },
    [stream],
  );
}

export function useLocalMedia(
  options: {
    enabled: boolean;
    /**
     * Where the microphone and camera should start.
     *
     * Someone who muted themselves in the lobby has said what they want; the
     * call must open that way rather than quietly putting them back on air.
     */
    initialMicOn?: boolean;
    initialCameraOn?: boolean;
  } = { enabled: true },
): LocalMedia {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [permission, setPermission] = useState<MediaPermission>('IDLE');
  const [micOn, setMicOnState] = useState(options.initialMicOn ?? true);
  const [cameraOn, setCameraOnState] = useState(options.initialCameraOn ?? true);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);

  // Read inside the grant handler without making it re-request the devices.
  const desired = useRef({ micOn, cameraOn });
  desired.current = { micOn, cameraOn };

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStream(null);
  }, []);

  useEffect(() => {
    if (!options.enabled) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      setPermission('UNAVAILABLE');
      setError('This browser cannot access a camera or microphone.');
      return;
    }

    let cancelled = false;
    setPermission('PROMPTING');

    navigator.mediaDevices
      .getUserMedia({ video: true, audio: true })
      .then((granted) => {
        if (cancelled) {
          granted.getTracks().forEach((track) => track.stop());
          return;
        }
        // Newly granted tracks always arrive enabled. Publishing them before
        // reconciling would broadcast a participant who believes they are
        // muted — so the desired state is applied first, then the stream.
        for (const track of granted.getAudioTracks()) track.enabled = desired.current.micOn;
        for (const track of granted.getVideoTracks()) track.enabled = desired.current.cameraOn;

        streamRef.current = granted;
        setStream(granted);
        setPermission('GRANTED');
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setPermission('DENIED');
        setError(
          cause instanceof DOMException && cause.name === 'NotFoundError'
            ? 'No camera or microphone was found.'
            : 'Camera and microphone access was blocked. You can still join without them.',
        );
      });

    return () => {
      cancelled = true;
    };
  }, [options.enabled]);

  // Releasing the hardware when the component goes away is not optional:
  // a forgotten track leaves the camera light on after the call ends.
  useEffect(() => stop, [stop]);

  // Toggles act on the live tracks, so what the user sees matches what is sent.
  const setMicOn = useCallback((on: boolean) => {
    setMicOnState(on);
    streamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = on;
    });
  }, []);

  const setCameraOn = useCallback((on: boolean) => {
    setCameraOnState(on);
    streamRef.current?.getVideoTracks().forEach((track) => {
      track.enabled = on;
    });
  }, []);

  return {
    stream,
    permission,
    micOn,
    cameraOn,
    setMicOn,
    setCameraOn,
    toggleMic: useCallback(() => setMicOn(!micOn), [micOn, setMicOn]),
    toggleCamera: useCallback(() => setCameraOn(!cameraOn), [cameraOn, setCameraOn]),
    stop,
    error,
  };
}
