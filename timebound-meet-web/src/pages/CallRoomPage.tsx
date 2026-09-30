import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Captions,
  History,
  ShieldAlert,
  ShieldOff,
  SignalHigh,
  SignalLow,
  UserPlus,
  Users,
} from "lucide-react";
import { Link, Navigate, useParams } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { BrandMark, BrandWordmark } from "@/components/common/Brand";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { CallControls } from "@/components/call/CallControls";
import { CallTimer } from "@/components/call/CallTimer";
import { VideoTile } from "@/components/call/VideoTile";
import { useCurrentUser } from "@/features/auth";
import { CallStatusBadge, useEndCall } from "@/features/calls";
import { LiveCaptionPanel } from "@/features/captions";
import {
  CallPeoplePanel,
  MESH_LIMIT,
  useCallActivity,
  useLiveCaptions,
  useWebRtcMesh,
} from "@/features/call-media";
import { ActivityPanel } from "@/components/call/ActivityPanel";
import {
  useCallRoster,
  useCallSession,
  useHeartbeat,
  useLeaveCall,
  useLocalMedia,
  type TerminationReason,
} from "@/features/join";
import { callsApi, joinApi } from "@/lib/api";
import type { CallParticipant } from "@/lib/api/types";
import { RealtimeEvent, useCallRoom, useRealtimeEvent } from "@/lib/realtime";
import { toDisplayError } from "@/lib/errors";
import { notify } from "@/lib/toast";
import { cn } from "@/lib/utils";

/**
 * Endings the participant chose.
 *
 * These need no explanation and no dead-end screen — the person is told in
 * passing and put somewhere they can act. Every other ending is something
 * that happened TO them, and is shown in full.
 */
const VOLUNTARY_EXITS = new Set<TerminationReason["kind"]>([
  "LEFT",
  "ENDED_BY_ME",
]);

/** A peer we answered before learning its name is still on the roster. */
function nameFor(userId: string, roster: CallParticipant[]): string {
  return roster.find(person => person.id === userId)?.name ?? "Participant";
}

/** Copy for every way a call can end. The reason is always stated plainly. */
const TERMINATION_COPY: Record<
  TerminationReason["kind"],
  {
    title: string;
    description: string;
    tone: "destructive" | "warning" | "default";
  }
> = {
  REVOKED: {
    title: "You were removed from this call",
    description: "The host took you off the guest list.",
    tone: "destructive",
  },
  FORCED_DISCONNECT: {
    title: "The host disconnected you",
    description: "You were dropped from the call.",
    tone: "destructive",
  },
  CALL_ENDED: {
    title: "That's a wrap",
    description: "The host ended the call for everyone.",
    tone: "default",
  },
  ENDED_BY_ME: {
    title: "Call ended",
    description:
      "Everyone's been disconnected. We're writing up the transcript now.",
    tone: "default",
  },
  WINDOW_CLOSED: {
    title: "Time's up",
    description:
      "The call reached its finish time, so everyone was disconnected.",
    tone: "warning",
  },
  LEFT: {
    title: "You left the call",
    description: "See you next time.",
    tone: "default",
  },
  ERROR: {
    title: "The call stopped",
    description: "Something got in the way and we couldn't keep it going.",
    tone: "warning",
  },
};

function TerminationScreen({
  termination,
  callId,
  canRejoin,
}: {
  termination: TerminationReason;
  callId: string;
  canRejoin: boolean;
}): React.JSX.Element {
  const copy = TERMINATION_COPY[termination.kind];
  const detail =
    termination.kind === "ERROR" ? toDisplayError(termination.error) : null;
  const removed = copy.tone === "destructive";

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <BrandWordmark />
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-lg space-y-6 text-center">
          <div
            className={cn(
              "mx-auto flex size-14 items-center justify-center rounded-2xl",
              removed ? "bg-destructive/10" : "bg-muted",
            )}
          >
            {removed ? (
              <ShieldOff
                className="size-7 text-destructive"
                aria-hidden="true"
              />
            ) : (
              <ShieldAlert
                className="size-7 text-muted-foreground"
                aria-hidden="true"
              />
            )}
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {detail?.title ?? copy.title}
            </h1>
            <p
              className="text-muted-foreground"
              role="status"
              aria-live="assertive"
            >
              {detail?.description ?? copy.description}
            </p>
          </div>

          {detail?.requestId ? (
            <p className="text-xs text-muted-foreground">
              Reference: <code className="font-mono">{detail.requestId}</code>
            </p>
          ) : null}

          <div className="flex flex-col justify-center gap-2 sm:flex-row">
            {canRejoin ? (
              <Button asChild>
                <Link to={`/call/${callId}/lobby`}>Try rejoining</Link>
              </Button>
            ) : null}
            <Button asChild variant={canRejoin ? "outline" : "default"}>
              <Link to={`/calls/${callId}`}>Call details</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/dashboard">My calls</Link>
            </Button>
          </div>

          {removed ? (
            <p className="text-xs text-muted-foreground">
              Think this was a mistake? Have a word with the host.
            </p>
          ) : null}
        </div>
      </main>
    </div>
  );
}

/**
 * The active call.
 *
 * Four independent things can end this session, and any one is enough: a
 * realtime event, a denied heartbeat, the participant leaving, or the
 * organizer ending it for everyone. Realtime is the fastest path, never the
 * authority — if it is down, the heartbeat still tears the call down within
 * one interval.
 */
export function CallRoomPage(): React.JSX.Element {
  const { callId = "" } = useParams<{ callId: string }>();
  const { user } = useCurrentUser();
  const { session, termination, terminate, setDevicePreferences } =
    useCallSession();

  const leaveCall = useLeaveCall();
  const endCall = useEndCall(callId);

  const [confirming, setConfirming] = useState<"leave" | "end" | null>(null);
  const [rosterOpenOnMobile, setRosterOpenOnMobile] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [sidePanel, setSidePanel] = useState<
    "participants" | "captions" | "activity"
  >("participants");

  const active = Boolean(session);
  const isOrganizer = session?.role === "ORGANIZER";

  // The lobby is where these were decided; the call honours them.
  const media = useLocalMedia({
    enabled: active,
    initialMicOn: session?.micOn ?? true,
    initialCameraOn: session?.cameraOn ?? true,
  });

  // The room subscription both authorizes us and tells us who is already here.
  const room = useCallRoom(session ? callId : null);

  /**
   * The media plane.
   *
   * Audio and video travel browser-to-browser; the server only introduced the
   * peers. Losing the socket costs new connections, not existing ones.
   */
  const mesh = useWebRtcMesh({
    callId: session ? callId : null,
    localStream: media.stream,
    initialPeers: room.peers,
    enabled: active && room.joined,
  });

  const captions = useLiveCaptions({
    callId: session ? callId : null,
    enabled: active && room.joined,
    selfUserId: user?.id,
    selfName: user?.name ?? "You",
  });

  // Who came and went, live, for everyone in the room.
  const activity = useCallActivity({
    callId: session ? callId : null,
    enabled: active,
    selfUserId: user?.id,
    selfName: user?.name ?? "You",
  });

  // --- roster --------------------------------------------------------------

  const roster = useCallRoster(session ? callId : null, active);
  const [optimisticRoster, setOptimisticRoster] = useState<
    CallParticipant[] | null
  >(null);

  const participants = useMemo(
    () => optimisticRoster ?? roster.data ?? [],
    [optimisticRoster, roster.data],
  );
  const others = useMemo(
    () => participants.filter(person => person.id !== user?.id),
    [participants, user?.id],
  );

  useEffect(() => {
    // The fetched roster supersedes any optimistic patch as soon as it lands.
    if (roster.data) setOptimisticRoster(null);
  }, [roster.data]);

  useRealtimeEvent(
    RealtimeEvent.PARTICIPANT_JOINED,
    payload => {
      if (payload.callId !== callId) return;
      setOptimisticRoster(previous => {
        const base = previous ?? roster.data ?? [];
        if (base.some(person => person.id === payload.participantId))
          return base;
        return [
          ...base,
          {
            id: payload.participantId,
            name: payload.name,
            isOrganizer: payload.isOrganizer,
            joinedAt: payload.joinedAt,
            connections: 1,
          },
        ];
      });
      if (payload.participantId !== user?.id)
        notify.info(`${payload.name} joined`);
    },
    active,
  );

  useRealtimeEvent(
    RealtimeEvent.PARTICIPANT_LEFT,
    payload => {
      if (payload.callId !== callId) return;
      setOptimisticRoster(previous =>
        (previous ?? roster.data ?? []).filter(
          person => person.id !== payload.participantId,
        ),
      );
    },
    active,
  );

  // --- captions ------------------------------------------------------------

  // --- teardown paths ------------------------------------------------------

  const heartbeat = useHeartbeat({
    via: session?.via ?? "CALL_ID",
    token: session?.token ?? null,
    callId: session ? callId : null,
    sessionId: session?.attendanceSession.id ?? null,
    deviceId: session?.deviceId ?? null,
    enabled: active,
    onDenied: useCallback(
      (error: unknown) => {
        const code = (error as { code?: string }).code;
        media.stop();

        if (code === "INVITE_REVOKED") terminate({ kind: "REVOKED" });
        else if (code === "JOIN_WINDOW_CLOSED")
          terminate({ kind: "WINDOW_CLOSED" });
        else if (code === "CALL_CANCELLED")
          terminate({ kind: "CALL_ENDED", reason: "CANCELLED" });
        else terminate({ kind: "ERROR", error });
      },
      [terminate, media],
    ),
  });

  useRealtimeEvent(
    RealtimeEvent.INVITATION_REVOKED,
    payload => {
      // Targeted at this participant by the server; acting on it is safe, and
      // the heartbeat would reach the same conclusion a moment later anyway.
      if (payload.callId === callId) {
        media.stop();
        terminate({ kind: "REVOKED" });
      }
    },
    active,
  );

  useRealtimeEvent(
    RealtimeEvent.FORCED_DISCONNECT,
    payload => {
      if (payload.callId === callId) {
        media.stop();
        terminate({ kind: "FORCED_DISCONNECT" });
      }
    },
    active,
  );

  useRealtimeEvent(
    RealtimeEvent.CALL_ENDED,
    payload => {
      if (payload.callId === callId) {
        media.stop();
        terminate({ kind: "CALL_ENDED", reason: payload.reason });
      }
    },
    active,
  );

  const handleLeave = useCallback(() => {
    if (!session) return;
    media.stop();

    leaveCall.mutate(
      {
        via: session.via,
        token: session.token,
        callId: session.callId,
        sessionId: session.attendanceSession.id,
        deviceId: session.deviceId,
        reason: "USER_LEFT",
      },
      {
        // Leaving always succeeds from the participant's point of view: even
        // if the request fails, their local session is over.
        onSettled: () => {
          notify.success(
            "You left the call",
            "Your attendance has been recorded.",
          );
          terminate({ kind: "LEFT" });
        },
      },
    );
  }, [session, leaveCall, terminate, media]);

  const handleEndForAll = useCallback(() => {
    media.stop();
    endCall.mutate(undefined, {
      onSuccess: () => {
        notify.success(
          "Call ended",
          "Everyone was disconnected and the transcript is queued.",
        );
        terminate({ kind: "ENDED_BY_ME" });
      },
      onError: error => {
        notify.error(error);
        terminate({ kind: "ERROR", error });
      },
    });
  }, [endCall, terminate, media]);

  // Closing the tab should still close the attendance session.
  const sessionRef = useRef(session);
  sessionRef.current = session;

  useEffect(() => {
    function onPageHide(): void {
      const current = sessionRef.current;
      if (!current) return;

      const body = {
        sessionId: current.attendanceSession.id,
        deviceId: current.deviceId,
        reason: "TAB_CLOSED" as const,
      };

      void (
        current.via === "INVITE_LINK" && current.token
          ? joinApi.leave(current.token, body, { keepalive: true })
          : callsApi.leave(current.callId, body, { keepalive: true })
      ).catch(() => undefined);
    }

    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, []);

  // Keep the stored preferences in step with the live tracks.
  useEffect(() => {
    if (active)
      setDevicePreferences({ micOn: media.micOn, cameraOn: media.cameraOn });
  }, [active, media.micOn, media.cameraOn, setDevicePreferences]);

  // --- rendering -----------------------------------------------------------

  if (!session) {
    if (termination) {
      // You know why you left, so there is nothing to read: go somewhere
      // useful. You do NOT know why you were removed, so that gets a screen.
      if (VOLUNTARY_EXITS.has(termination.kind)) {
        return <Navigate to={`/calls/${callId}`} replace />;
      }

      return (
        <TerminationScreen
          termination={termination}
          callId={callId}
          // A transient failure is worth retrying; a withdrawal is not.
          canRejoin={termination.kind === "ERROR"}
        />
      );
    }

    // A refresh drops the in-memory credential by design — so send them back
    // to the lobby rather than to a dead end.
    return <Navigate to={`/call/${callId}/lobby`} replace />;
  }

  const { call } = session;
  const alone = others.length === 0;

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <BrandMark className="hidden size-6 shrink-0 sm:block" />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-base font-semibold">{call.title}</h1>
            <CallStatusBadge status={call.status} />
            {isOrganizer ? <Badge variant="warning">Host</Badge> : null}
          </div>
          <p className="text-xs text-muted-foreground">{call.timezone}</p>
        </div>

        <Badge variant={heartbeat.degraded ? "warning" : "neutral"}>
          {heartbeat.degraded ? (
            <SignalLow className="size-3" aria-hidden="true" />
          ) : (
            <SignalHigh className="size-3" aria-hidden="true" />
          )}
          {heartbeat.degraded ? "Reconnecting" : "Connected"}
        </Badge>

        <CallTimer
          scheduledStart={call.scheduledStart}
          scheduledEnd={call.scheduledEnd}
          serverTime={heartbeat.serverTime}
        />
      </header>

      <main className="flex flex-1 flex-col gap-4 p-4 lg:flex-row">
        <div className="flex flex-1 flex-col gap-4">
          {/* Tile grid: one column alone, two from sm, three past four people. */}
          <div
            className={cn(
              "grid flex-1 gap-3",
              mesh.peers.length === 0
                ? "grid-cols-1"
                : mesh.peers.length <= 3
                  ? "grid-cols-1 sm:grid-cols-2"
                  : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3",
            )}
          >
            <VideoTile
              name={user?.name ?? "You"}
              stream={media.stream}
              cameraOn={media.cameraOn}
              micOn={media.micOn}
              isSelf
              isOrganizer={isOrganizer}
            />

            {/*
              One tile per peer connection, not per person on the roster: a
              participant on two devices is two peers, and each carries its own
              stream. The roster row is who they are; the tile is what arrived.
            */}
            {mesh.peers.map(peer => (
              <VideoTile
                key={peer.peerId}
                name={peer.name || nameFor(peer.userId, others)}
                stream={peer.stream}
                cameraOn
                micOn
                state={peer.state}
                isOrganizer={peer.isOrganizer}
              />
            ))}
          </div>

          {alone ? (
            <Card>
              <CardContent className="flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <p className="flex items-center gap-2 font-medium">
                    <Users
                      className="size-4 text-muted-foreground"
                      aria-hidden="true"
                    />
                    Just you so far
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {isOrganizer
                      ? "Invite a few people and they can join whenever they like."
                      : "Others can drop in any time while the call's open."}
                  </p>
                </div>

                {isOrganizer ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      // Show the panel behind it, then open the dialog itself —
                      // switching panels alone does nothing once it is already
                      // the one on screen.
                      setSidePanel("participants");
                      setRosterOpenOnMobile(true);
                      setInviteOpen(true);
                    }}
                  >
                    <UserPlus aria-hidden="true" />
                    Invite someone
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {mesh.overCapacity ? (
            <Alert variant="warning">
              <Users aria-hidden="true" />
              <div>
                <AlertTitle>Busy in here</AlertTitle>
                <AlertDescription>
                  With more than {MESH_LIMIT} people, video and sound may start
                  to struggle.
                </AlertDescription>
              </div>
            </Alert>
          ) : null}

          {heartbeat.degraded ? (
            <Alert variant="warning">
              <SignalLow aria-hidden="true" />
              <div>
                <AlertTitle>Hang on, reconnecting…</AlertTitle>
                <AlertDescription>
                  Your connection is a bit wobbly. The call is still going —
                  we'll catch you up as soon as it steadies.
                </AlertDescription>
              </div>
            </Alert>
          ) : null}
        </div>

        <aside
          className={cn(
            "w-full shrink-0 flex-col gap-4 lg:flex lg:w-80",
            rosterOpenOnMobile ? "flex" : "hidden lg:flex",
          )}
        >
          {/* One panel at a time — three side by side would crowd the video. */}
          <div
            role="tablist"
            aria-label="Call panels"
            className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1"
          >
            {(
              [
                {
                  key: "participants",
                  label: "People",
                  icon: Users,
                  badge: participants.length,
                },
                {
                  key: "captions",
                  label: "Captions",
                  icon: Captions,
                  badge: 0,
                },
                {
                  key: "activity",
                  label: "Activity",
                  icon: History,
                  badge: activity.unseen,
                },
              ] as const
            ).map(({ key, label, icon: Icon, badge }) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={sidePanel === key}
                onClick={() => {
                  setSidePanel(key);
                  if (key === "activity") activity.markSeen();
                }}
                className={cn(
                  "relative inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium transition-colors",
                  sidePanel === key
                    ? "bg-card text-foreground shadow-xs"
                    : "text-muted-foreground",
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                <span className="hidden sm:inline lg:hidden xl:inline">
                  {label}
                </span>
                {badge > 0 && key !== "participants" ? (
                  <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[0.6rem] font-semibold text-primary-foreground">
                    {badge > 9 ? "9+" : badge}
                  </span>
                ) : null}
              </button>
            ))}
          </div>

          {sidePanel === "participants" ? (
            <CallPeoplePanel
              callId={callId}
              participants={participants}
              currentUserId={user?.id}
              isOrganizer={isOrganizer}
              loading={roster.isPending}
              inviteOpen={inviteOpen}
              onInviteOpenChange={setInviteOpen}
            />
          ) : null}

          {sidePanel === "captions" ? (
            <LiveCaptionPanel captions={captions} selfUserId={user?.id} />
          ) : null}

          {sidePanel === "activity" ? (
            <ActivityPanel entries={activity.entries} />
          ) : null}
        </aside>
      </main>

      <footer className="border-t border-border p-4">
        <CallControls
          micOn={media.micOn}
          cameraOn={media.cameraOn}
          onToggleMic={media.toggleMic}
          onToggleCamera={media.toggleCamera}
          onLeave={() => setConfirming("leave")}
          onEndForAll={() => setConfirming("end")}
          leaving={leaveCall.isPending}
          ending={endCall.isPending}
          canEndForAll={isOrganizer}
          participantCount={participants.length}
          onToggleRoster={() => setRosterOpenOnMobile(open => !open)}
        />
      </footer>

      <ConfirmDialog
        open={confirming === "leave"}
        onOpenChange={open => (open ? undefined : setConfirming(null))}
        title="Leave this call?"
        confirmLabel="Leave call"
        cancelLabel="Stay"
        pending={leaveCall.isPending}
        description={
          isOrganizer
            ? "Everyone else carries on without you. You can hop back in any time."
            : "You can hop back in any time while the call's still going."
        }
        onConfirm={() => {
          setConfirming(null);
          handleLeave();
        }}
      />

      <ConfirmDialog
        open={confirming === "end"}
        onOpenChange={open => (open ? undefined : setConfirming(null))}
        title="End the call for everyone?"
        destructive
        confirmLabel="End for everyone"
        cancelLabel="Keep it running"
        pending={endCall.isPending}
        description="Everyone gets disconnected straight away and nobody can rejoin. We'll write up the transcript afterwards."
        onConfirm={() => {
          setConfirming(null);
          handleEndForAll();
        }}
      />
    </div>
  );
}
