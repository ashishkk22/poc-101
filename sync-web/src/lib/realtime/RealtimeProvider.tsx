import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PropsWithChildren } from "react";
import {
  connectSocket,
  disconnectSocket,
  subscribeToCall,
  unsubscribeFromCall,
} from "./socket";
import {
  RealtimeEvent,
  type PeerDescriptor,
  type RealtimeEventMap,
} from "./events";

type Listener<E extends RealtimeEvent> = (payload: RealtimeEventMap[E]) => void;

/** Connectivity of the realtime channel. Never an authorization signal. */
export const RealtimeStatus = {
  IDLE: "IDLE",
  CONNECTING: "CONNECTING",
  CONNECTED: "CONNECTED",
  DISCONNECTED: "DISCONNECTED",
} as const;
export type RealtimeStatus =
  (typeof RealtimeStatus)[keyof typeof RealtimeStatus];

interface RealtimeContextValue {
  status: RealtimeStatus;
  /** Returns an unsubscribe function; safe to call when disconnected. */
  on: <E extends RealtimeEvent>(event: E, listener: Listener<E>) => () => void;
  subscribeCall: (
    callId: string,
    options?: { media?: boolean },
  ) => Promise<{
    ok: boolean;
    code?: string;
    peers?: PeerDescriptor[];
  }>;
  unsubscribeCall: (callId: string) => void;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

const EVENTS: RealtimeEvent[] = [
  RealtimeEvent.INVITATION_REVOKED,
  RealtimeEvent.CALL_ENDED,
  RealtimeEvent.FORCED_DISCONNECT,
  RealtimeEvent.CAPTION_STATUS_CHANGED,
  RealtimeEvent.PARTICIPANT_JOINED,
  RealtimeEvent.PARTICIPANT_LEFT,
];

type RealtimeProviderProps = {
  enabled: boolean;
} & PropsWithChildren;

/**
 * Owns the socket lifecycle and fans events out to React subscribers.
 *
 * The socket is opened only once an authenticated session exists, and torn
 * down on sign-out so a connection never outlives the session behind it.
 */
export function RealtimeProvider({ enabled, children }: RealtimeProviderProps) {
  const [status, setStatus] = useState<RealtimeStatus>("IDLE");
  const listeners = useRef(
    new Map<RealtimeEvent, Set<(payload: never) => void>>(),
  );

  useEffect(() => {
    if (!enabled) {
      disconnectSocket();
      setStatus("IDLE");
      return;
    }

    setStatus("CONNECTING");
    const socket = connectSocket();

    const onConnect = () => setStatus("CONNECTED");
    const onDisconnect = () => setStatus("DISCONNECTED");
    const onConnectError = () => setStatus("DISCONNECTED");

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);

    const handlers = EVENTS.map(event => {
      const handler = (payload: RealtimeEventMap[typeof event]) => {
        for (const listener of listeners.current.get(event) ?? []) {
          (listener as (value: typeof payload) => void)(payload);
        }
      };
      socket.on(event, handler);
      return { event, handler } as const;
    });

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      for (const { event, handler } of handlers) socket.off(event, handler);
      disconnectSocket();
      setStatus("IDLE");
    };
  }, [enabled]);

  const value = useMemo<RealtimeContextValue>(
    () => ({
      status,
      on: (event, listener) => {
        const set = listeners.current.get(event) ?? new Set();
        set.add(listener as (payload: never) => void);
        listeners.current.set(event, set);
        return () => {
          set.delete(listener as (payload: never) => void);
        };
      },
      subscribeCall: subscribeToCall,
      unsubscribeCall: unsubscribeFromCall,
    }),
    [status],
  );

  return (
    <RealtimeContext.Provider value={value}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime(): RealtimeContextValue {
  const context = useContext(RealtimeContext);
  if (!context)
    throw new Error("useRealtime must be used inside RealtimeProvider");
  return context;
}

/** Subscribes to one realtime event for the lifetime of the component. */
export function useRealtimeEvent<E extends RealtimeEvent>(
  event: E,
  listener: Listener<E>,
  enabled = true,
): void {
  const { on } = useRealtime();
  const ref = useRef(listener);
  ref.current = listener;

  useEffect(() => {
    if (!enabled) return;
    return on(event, ((payload: RealtimeEventMap[E]) =>
      ref.current(payload)) as Listener<E>);
  }, [on, event, enabled]);
}

/**
 * Joins a call room while mounted. The server decides whether to allow it.
 *
 * On success the ack also reports who is already in the room, which is what
 * the WebRTC mesh needs to know who to connect to.
 */
export function useCallRoom(
  callId: string | null | undefined,
  options: { media?: boolean } = {},
): {
  joined: boolean;
  code?: string;
  peers: PeerDescriptor[] | null;
} {
  const { status, subscribeCall, unsubscribeCall } = useRealtime();
  const media = options.media === true;
  const [state, setState] = useState<{
    joined: boolean;
    code?: string;
    peers: PeerDescriptor[] | null;
  }>({ joined: false, peers: null });

  useEffect(() => {
    if (!callId || status !== RealtimeStatus.CONNECTED) {
      setState({ joined: false, peers: null });
      return;
    }

    let cancelled = false;
    void subscribeCall(callId, { media }).then(ack => {
      if (cancelled) return;
      setState(
        ack.ok
          ? { joined: true, peers: ack.peers ?? [] }
          : { joined: false, code: ack.code, peers: null },
      );
    });

    return () => {
      cancelled = true;
      unsubscribeCall(callId);
    };
  }, [callId, media, status, subscribeCall, unsubscribeCall]);

  return state;
}
