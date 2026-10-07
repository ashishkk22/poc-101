import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PropsWithChildren } from "react";
import type { AttendanceSession, CallEndReason, CallRole, JoinCall, ProviderSession } from "@/lib/api/types";

/**
 * The active call session, held in memory only.
 *
 * Whatever credential got the participant in — a raw invitation token, or
 * simply their identity — lives here for exactly as long as the tab is on the
 * call. Nothing is written to localStorage, sessionStorage or a cookie: a
 * refresh legitimately loses the session, and entry is re-authorized.
 */
export interface ActiveCallSession {
  /**
   * Which door was used. The backend reaches the same decision either way;
   * this only tells the client which endpoints to keep talking to.
   */
  via: EntryDoor;
  /** Raw invitation credential, present only for link entry. Never persisted. */
  token: string | null;
  callId: string;
  deviceId: string;
  role: CallRole;
  call: JoinCall;
  attendanceSession: AttendanceSession;
  providerSession: ProviderSession;
  /** Local device preferences chosen in the lobby. */
  micOn: boolean;
  cameraOn: boolean;
}

/**
 * Which door someone came in by.
 *
 * The backend reaches the same decision either way; this only tells the client
 * which endpoints to keep talking to.
 */
export const EntryDoor = {
  INVITE_LINK: "INVITE_LINK",
  CALL_ID: "CALL_ID",
} as const;
export type EntryDoor = (typeof EntryDoor)[keyof typeof EntryDoor];

/** Why a call session ended. */
export const TerminationKind = {
  REVOKED: "REVOKED",
  CALL_ENDED: "CALL_ENDED",
  FORCED_DISCONNECT: "FORCED_DISCONNECT",
  WINDOW_CLOSED: "WINDOW_CLOSED",
  LEFT: "LEFT",
  ENDED_BY_ME: "ENDED_BY_ME",
  ERROR: "ERROR",
} as const;
export type TerminationKind =
  (typeof TerminationKind)[keyof typeof TerminationKind];

export type TerminationReason =
  | { kind: typeof TerminationKind.REVOKED }
  | { kind: typeof TerminationKind.CALL_ENDED; reason: CallEndReason }
  | { kind: typeof TerminationKind.FORCED_DISCONNECT }
  | { kind: typeof TerminationKind.WINDOW_CLOSED }
  | { kind: typeof TerminationKind.LEFT }
  | { kind: typeof TerminationKind.ENDED_BY_ME }
  | { kind: typeof TerminationKind.ERROR; error: unknown };

interface CallSessionContextValue {
  session: ActiveCallSession | null;
  termination: TerminationReason | null;
  start: (session: ActiveCallSession) => void;
  /** Drops the credential and provider descriptor, then records why. */
  terminate: (reason: TerminationReason) => void;
  clearTermination: () => void;
  setDevicePreferences: (preferences: {
    micOn?: boolean;
    cameraOn?: boolean;
  }) => void;
}

const CallSessionContext = createContext<CallSessionContextValue | null>(null);

export function CallSessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<ActiveCallSession | null>(null);
  const [termination, setTermination] = useState<TerminationReason | null>(
    null,
  );
  // Guards against a revoke and a leave racing to terminate the same session.
  const terminated = useRef(false);

  const start = useCallback((next: ActiveCallSession) => {
    terminated.current = false;
    setTermination(null);
    setSession(next);
  }, []);

  const terminate = useCallback((reason: TerminationReason) => {
    if (terminated.current) return;
    terminated.current = true;
    // Credential first: it must not survive the decision to end the session.
    setSession(null);
    setTermination(reason);
  }, []);

  const clearTermination = useCallback(() => setTermination(null), []);

  const setDevicePreferences = useCallback(
    (preferences: { micOn?: boolean; cameraOn?: boolean }) =>
      setSession(previous =>
        previous ? { ...previous, ...preferences } : previous,
      ),
    [],
  );

  const value = useMemo<CallSessionContextValue>(
    () => ({
      session,
      termination,
      start,
      terminate,
      clearTermination,
      setDevicePreferences,
    }),
    [
      session,
      termination,
      start,
      terminate,
      clearTermination,
      setDevicePreferences,
    ],
  );

  return (
    <CallSessionContext.Provider value={value}>
      {children}
    </CallSessionContext.Provider>
  );
}

export function useCallSession(): CallSessionContextValue {
  const context = useContext(CallSessionContext);
  if (!context)
    throw new Error("useCallSession must be used inside CallSessionProvider");
  return context;
}

/** A stable per-tab device id, so concurrent tabs are distinct sessions. */
export function newDeviceId(): string {
  const random =
    globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `web-${random.replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 24)}`;
}
