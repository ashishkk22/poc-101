import { useCallback, useEffect, useRef, useState } from "react";
import { emitSignal, onSocketEvent } from "@/lib/realtime/socket";
import {
  SignalEvent,
  type CaptionUtterancePayload,
} from "@/lib/realtime/events";

/**
 * Live captions, recognised on the speaker's own device.
 *
 * With no media server there is no central place to transcribe audio, so each
 * browser transcribes its own microphone and publishes the text. The server
 * relays the line and stamps who said it, which is what stops a client
 * attributing words to somebody else.
 *
 * PRIVACY: Chrome's implementation of this API streams microphone audio to
 * Google's servers for recognition. On a product whose premise is tightly
 * controlled access, that is a real disclosure — captions are therefore off
 * until the participant turns them on, and the UI says where the audio goes.
 */

export interface CaptionLine {
  id: string;
  userId: string;
  name: string;
  text: string;
  isFinal: boolean;
  at: string;
}

/** Whether this browser can transcribe speech at all. */
export const CaptionSupport = {
  SUPPORTED: "SUPPORTED",
  UNSUPPORTED: "UNSUPPORTED",
} as const;
export type CaptionSupport =
  (typeof CaptionSupport)[keyof typeof CaptionSupport];

export interface LiveCaptionsState {
  lines: CaptionLine[];
  /** Whether this browser can transcribe at all. */
  support: CaptionSupport;
  /** Whether this participant is currently publishing their own captions. */
  publishing: boolean;
  togglePublishing: () => void;
  error: string | null;
}

/** The API is still vendor-prefixed nearly everywhere. */
interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}

type RecognitionConstructor = new () => SpeechRecognitionLike;

function getRecognitionConstructor(): RecognitionConstructor | null {
  const scope = window as unknown as {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

/** Keeps the transcript bounded; a long call would otherwise grow forever. */
const MAX_LINES = 60;
/** Interim results fire many times a second; this keeps the socket calm. */
const INTERIM_THROTTLE_MS = 400;

type UseLiveCaptionsOptions = {
  callId: string | null;
  enabled: boolean;
  selfUserId: string | undefined;
  selfName: string;
};

export function useLiveCaptions(
  options: UseLiveCaptionsOptions,
): LiveCaptionsState {
  const { callId, enabled, selfUserId, selfName } = options;

  const [lines, setLines] = useState<CaptionLine[]>([]);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const support: CaptionSupport = getRecognitionConstructor()
    ? "SUPPORTED"
    : "UNSUPPORTED";

  const recognition = useRef<SpeechRecognitionLike | null>(null);
  const lastInterimAt = useRef(0);
  const wantsToPublish = useRef(false);

  /**
   * An interim line from a speaker replaces their previous interim; a final
   * line settles it. That is what makes captions read as speech firming up
   * rather than as a wall of repeated fragments.
   */
  const append = useCallback((line: CaptionLine) => {
    setLines(previous => {
      const withoutInterim = previous.filter(
        existing => !(existing.userId === line.userId && !existing.isFinal),
      );
      return [...withoutInterim, line].slice(-MAX_LINES);
    });
  }, []);

  // --- receive other people's captions -------------------------------------

  useEffect(() => {
    if (!enabled || !callId) return;

    return onSocketEvent<CaptionUtterancePayload>(
      SignalEvent.CAPTION,
      payload => {
        if (payload.callId !== callId) return;
        append({
          id: `${payload.userId}-${payload.at}`,
          userId: payload.userId,
          name: payload.name,
          text: payload.text,
          isFinal: payload.isFinal,
          at: payload.at,
        });
      },
    );
  }, [enabled, callId, append]);

  // --- publish our own -----------------------------------------------------

  useEffect(() => {
    if (!enabled || !callId || !publishing) return;

    const Recognition = getRecognitionConstructor();
    if (!Recognition) {
      setError("This browser cannot transcribe speech.");
      setPublishing(false);
      return;
    }

    wantsToPublish.current = true;
    const instance = new Recognition();
    recognition.current = instance;

    instance.continuous = true;
    instance.interimResults = true;
    instance.lang = navigator.language || "en-US";

    instance.onresult = event => {
      for (
        let index = event.resultIndex;
        index < event.results.length;
        index += 1
      ) {
        const result = event.results[index];
        if (!result) continue;

        const text = result[0].transcript.trim();
        if (!text) continue;

        const isFinal = result.isFinal;

        // Throttle interims, never finals: a dropped final loses a sentence.
        if (!isFinal) {
          const now = Date.now();
          if (now - lastInterimAt.current < INTERIM_THROTTLE_MS) continue;
          lastInterimAt.current = now;
        }

        const at = new Date().toISOString();

        // Show our own words immediately; the server echoes them to others.
        append({
          id: `${selfUserId ?? "self"}-${at}`,
          userId: selfUserId ?? "self",
          name: selfName,
          text,
          isFinal,
          at,
        });

        emitSignal(SignalEvent.CAPTION, { callId, text, isFinal });
      }
    };

    instance.onerror = event => {
      if (
        event.error === "not-allowed" ||
        event.error === "service-not-allowed"
      ) {
        setError("Microphone access is needed for captions.");
        wantsToPublish.current = false;
        setPublishing(false);
        return;
      }
      // 'no-speech' and 'aborted' are routine; onend restarts.
      if (event.error === "network")
        setError("Caption service is unreachable.");
    };

    // Recognition stops itself after a pause; restart while still wanted.
    instance.onend = () => {
      if (!wantsToPublish.current) return;
      try {
        instance.start();
      } catch {
        // Already starting; the next onend will try again.
      }
    };

    try {
      instance.start();
      setError(null);
    } catch {
      setError("Captions could not be started.");
      setPublishing(false);
    }

    return () => {
      wantsToPublish.current = false;
      instance.onresult = null;
      instance.onerror = null;
      instance.onend = null;
      try {
        instance.stop();
      } catch {
        // Already stopped.
      }
      recognition.current = null;
    };
  }, [enabled, callId, publishing, selfUserId, selfName, append]);

  // Leaving the call must not leave the microphone being transcribed.
  useEffect(() => {
    if (!enabled) setPublishing(false);
  }, [enabled]);

  return {
    lines,
    support,
    publishing,
    togglePublishing: useCallback(() => setPublishing(value => !value), []),
    error,
  };
}
