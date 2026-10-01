import { useCallback, useEffect, useRef, useState } from "react";
import { RealtimeEvent, useRealtimeEvent } from "@/lib/realtime";
import { CallEndReason } from "@/features/join";

/**
 * What has happened in this call, as it happens.
 *
 * The same events the audit trail records, surfaced live to the people in the
 * room. It is a view of activity, not a second source of truth: nothing here
 * grants or withdraws anything, and a missed event costs a gap in the list,
 * never a wrong decision. The organizer's full audit trail remains the record.
 */
/** What kind of thing happened in the call. */
export const ActivityKind = {
  JOINED: "JOINED",
  LEFT: "LEFT",
  REVOKED: "REVOKED",
  CALL_ENDED: "CALL_ENDED",
  YOU_JOINED: "YOU_JOINED",
} as const;
export type ActivityKind = (typeof ActivityKind)[keyof typeof ActivityKind];

export interface ActivityEntry {
  id: string;
  kind: ActivityKind;
  /** Already-resolved copy, so the panel stays a renderer. */
  text: string;
  at: string;
}

/** A long call should not accumulate an unbounded list in memory. */
const MAX_ENTRIES = 50;

type UseCallActivityOptions = {
  callId: string | null;
  enabled: boolean;
  selfUserId: string | undefined;
  selfName: string;
};

export function useCallActivity(options: UseCallActivityOptions) {
  const { callId, enabled, selfUserId, selfName } = options;

  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [unseen, setUnseen] = useState(0);
  const seeded = useRef(false);

  const add = useCallback((kind: ActivityKind, text: string) => {
    const at = new Date().toISOString();
    setEntries(previous =>
      [...previous, { id: `${kind}-${at}-${text}`, kind, text, at }].slice(
        -MAX_ENTRIES,
      ),
    );
    setUnseen(count => count + 1);
  }, []);

  // Your own arrival opens the list, so it never starts empty.
  useEffect(() => {
    if (!enabled || seeded.current) return;
    seeded.current = true;
    add("YOU_JOINED", `${selfName} joined`);
  }, [enabled, selfName, add]);

  useEffect(() => {
    if (!enabled) {
      seeded.current = false;
      setEntries([]);
      setUnseen(0);
    }
  }, [enabled]);

  useRealtimeEvent(
    RealtimeEvent.PARTICIPANT_JOINED,
    payload => {
      if (payload.callId !== callId || payload.participantId === selfUserId)
        return;
      add("JOINED", `${payload.name} joined`);
    },
    enabled,
  );

  useRealtimeEvent(
    RealtimeEvent.PARTICIPANT_LEFT,
    payload => {
      if (payload.callId !== callId || payload.participantId === selfUserId)
        return;
      add("LEFT", `${payload.name} left`);
    },
    enabled,
  );

  useRealtimeEvent(
    RealtimeEvent.INVITATION_REVOKED,
    payload => {
      if (payload.callId !== callId) return;
      // The server sends this only to the affected participant, so anyone who
      // receives it is the one losing access.
      add("REVOKED", "Your access to this call was withdrawn");
    },
    enabled,
  );

  useRealtimeEvent(
    RealtimeEvent.CALL_ENDED,
    payload => {
      if (payload.callId !== callId) return;
      add(
        "CALL_ENDED",
        payload.reason === CallEndReason.CANCELLED
          ? "The call was cancelled"
          : "The call was ended",
      );
    },
    enabled,
  );

  return {
    entries,
    unseen,
    markSeen: useCallback(() => setUnseen(0), []),
  };
}
