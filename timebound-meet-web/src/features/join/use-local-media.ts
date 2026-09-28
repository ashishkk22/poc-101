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

export function useLocalMedia(options: { enabled: boolean } = { enabled: true }): LocalMedia {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [permission, setPermission] = useState<MediaPermission>('IDLE');
  const [micOn, setMicOnState] = useState(true);
  const [cameraOn, setCameraOnState] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);

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
