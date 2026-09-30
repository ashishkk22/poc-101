import {
  CalendarClock,
  Clock,
  Mic,
  MicOff,
  ShieldCheck,
  Video,
  VideoOff,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ErrorState } from "@/components/common/ErrorState";
import { formatRelative, formatWindow, parse } from "@/lib/date/format";
import type { JoinCall } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { useVideoStream, type LocalMedia } from "./useLocalMedia";

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

type CallLobbyProps = {
  call: JoinCall;
  viewerName: string;
  media: LocalMedia;
  joining: boolean;
  error: unknown;
  onJoin: () => void;
  onCancel: () => void;
  roleLabel: string;
};

/**
 * The pre-join step.
 *
 * Nothing here has been authorized yet beyond a read-only check: no
 * attendance row exists, no provider session has been minted. The person sees
 * what they are about to walk into, checks their devices, and only then
 * commits. Arriving before the scheduled start is fine — the invitation is
 * the gate, not the clock — and the copy says so.
 */
export function CallLobby({
  call,
  viewerName,
  media,
  joining,
  error,
  onJoin,
  onCancel,
  roleLabel,
}: CallLobbyProps) {
  const attachPreview = useVideoStream(media.stream);

  const start = parse(call.scheduledStart);
  const notStartedYet = start ? start.getTime() > Date.now() : false;
  const showVideo = Boolean(media.stream) && media.cameraOn;

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-8 lg:grid-cols-[1.35fr_1fr] lg:items-center">
      {/* Device check */}
      <div className="space-y-3">
        <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-2xl border border-border bg-[oklch(0.24_0.02_258)] text-white">
          {/* Always mounted: unmounting it loses the stream attachment. */}
          <video
            ref={attachPreview}
            autoPlay
            playsInline
            muted
            className={cn(
              "size-full scale-x-[-1] object-cover",
              showVideo ? "block" : "hidden",
            )}
          />

          {showVideo ? null : (
            <div className="flex flex-col items-center gap-3 px-6 text-center">
              <span className="flex size-20 items-center justify-center rounded-full bg-white/10 text-2xl font-semibold">
                {initials(viewerName)}
              </span>
              <p className="text-sm text-white/60">
                {media.permission === "PROMPTING"
                  ? "Just checking your camera…"
                  : media.cameraOn
                    ? "We can't see a camera — you can still join"
                    : "Camera off"}
              </p>
            </div>
          )}

          <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-gradient-to-t from-black/60 to-transparent p-4">
            <Button
              variant={media.micOn ? "secondary" : "destructive"}
              size="icon"
              onClick={media.toggleMic}
              aria-pressed={!media.micOn}
              aria-label={
                media.micOn ? "Turn microphone off" : "Turn microphone on"
              }
            >
              {media.micOn ? (
                <Mic aria-hidden="true" />
              ) : (
                <MicOff aria-hidden="true" />
              )}
            </Button>
            <Button
              variant={media.cameraOn ? "secondary" : "destructive"}
              size="icon"
              onClick={media.toggleCamera}
              aria-pressed={!media.cameraOn}
              aria-label={media.cameraOn ? "Turn camera off" : "Turn camera on"}
            >
              {media.cameraOn ? (
                <Video aria-hidden="true" />
              ) : (
                <VideoOff aria-hidden="true" />
              )}
            </Button>
          </div>
        </div>

        {media.error ? (
          <Alert variant="warning">
            <VideoOff aria-hidden="true" />
            <AlertDescription>{media.error}</AlertDescription>
          </Alert>
        ) : null}
      </div>

      {/* What you are about to join */}
      <div className="space-y-5">
        <div className="space-y-2">
          <Badge variant="neutral">{roleLabel}</Badge>
          <h1 className="text-2xl font-semibold tracking-tight">
            {call.title}
          </h1>

          <div className="space-y-1 text-sm text-muted-foreground">
            <p className="flex items-center gap-2">
              <Clock className="size-3.5" aria-hidden="true" />
              {formatWindow(call.scheduledStart, call.scheduledEnd)}
            </p>
            <p className="flex items-center gap-2">
              <CalendarClock className="size-3.5" aria-hidden="true" />
              {call.timezone}
            </p>
          </div>
        </div>

        {notStartedYet ? (
          <Alert variant="info">
            <Clock aria-hidden="true" />
            <AlertDescription>
              You're a bit early — it starts{" "}
              {formatRelative(call.scheduledStart)}. Go on in and make yourself
              comfortable.
            </AlertDescription>
          </Alert>
        ) : null}

        {error ? <ErrorState error={error} /> : null}

        <div className="flex flex-col gap-2 sm:flex-row">
          <Button
            size="lg"
            onClick={onJoin}
            loading={joining}
            className={cn("sm:flex-1")}
          >
            {joining ? "One moment…" : "Join now"}
          </Button>
          <Button
            size="lg"
            variant="outline"
            onClick={onCancel}
            disabled={joining}
          >
            Cancel
          </Button>
        </div>

        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheck
            className="mt-0.5 size-3.5 shrink-0"
            aria-hidden="true"
          />
          Only people the host invited can get in.
        </p>
      </div>
    </div>
  );
}
