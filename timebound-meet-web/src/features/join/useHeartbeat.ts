import { useEffect, useRef, useState } from "react";
import { callsApi, joinApi } from "@/lib/api";
import { ApiError, ErrorCode } from "@/lib/errors";
import { config } from "@/lib/config/env";

/**
 * The heartbeat is not a keep-alive; it is a recurring authorization check.
 *
 * This is what makes revocation authoritative when a realtime event is missed
 * or the socket never connected: the backend denies the next heartbeat and the
 * client tears the call down on its own.
 */
const TERMINAL_CODES = new Set<string>([
  ErrorCode.INVITE_REVOKED,
  ErrorCode.INVITE_EXPIRED,
  ErrorCode.INVITE_NOT_FOUND,
  ErrorCode.PARTICIPANT_MISMATCH,
  ErrorCode.JOIN_WINDOW_CLOSED,
  ErrorCode.CALL_CANCELLED,
  ErrorCode.CALL_NOT_JOINABLE,
  ErrorCode.CALL_NOT_FOUND,
  ErrorCode.AUTHENTICATION_REQUIRED,
  ErrorCode.FORBIDDEN,
]);

export interface HeartbeatState {
  /** Server clock from the last successful heartbeat. */
  serverTime: string | null;
  callEndsAt: string | null;
  lastBeatAt: number | null;
  /** A transient failure: shown as degraded, never as a loss of access. */
  degraded: boolean;
}

type HeartbeatOptions = {
  via: "INVITE_LINK" | "CALL_ID";
  token: string | null;
  callId: string | null;
  sessionId: string | null;
  deviceId: string | null;
  enabled: boolean;
  onDenied: (error: ApiError) => void;
};

export function useHeartbeat(options: HeartbeatOptions): HeartbeatState {
  const { via, token, callId, sessionId, deviceId, enabled, onDenied } =
    options;

  const [state, setState] = useState<HeartbeatState>({
    serverTime: null,
    callEndsAt: null,
    lastBeatAt: null,
    degraded: false,
  });

  const onDeniedRef = useRef(onDenied);
  onDeniedRef.current = onDenied;

  useEffect(() => {
    if (!enabled || !callId) return;

    let cancelled = false;

    async function beat(): Promise<void> {
      const body = {
        ...(sessionId ? { sessionId } : {}),
        ...(deviceId ? { deviceId } : {}),
      };

      try {
        // Whichever door was used stays the door: the link path keeps
        // presenting the link, so revoking it is felt immediately.
        const result =
          via === "INVITE_LINK" && token
            ? await joinApi.heartbeat(token, body)
            : await callsApi.heartbeat(callId as string, body);

        if (cancelled) return;

        setState({
          serverTime: result.serverTime,
          callEndsAt: result.callEndsAt,
          lastBeatAt: Date.now(),
          degraded: false,
        });
      } catch (error) {
        if (cancelled) return;

        if (ApiError.isApiError(error) && TERMINAL_CODES.has(error.code)) {
          // Access is gone. The caller stops media and navigates away.
          onDeniedRef.current(error);
          return;
        }

        // Anything else — a 5xx, a dropped connection — is a degraded
        // heartbeat, not a revocation. The next beat decides.
        setState(previous => ({ ...previous, degraded: true }));
      }
    }

    void beat();
    const timer = setInterval(() => void beat(), config.heartbeatIntervalMs);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled, via, token, callId, sessionId, deviceId]);

  return state;
}
