import { Loader2, MicOff, VideoOff, WifiOff } from "lucide-react";
import { useVideoStream } from "@/features/join";
import { cn } from "@/lib/utils";

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

/**
 * One person's tile.
 *
 * The local tile renders the viewer's real camera; everyone else gets an
 * avatar until a provider adapter supplies their media. The distinction is
 * visible on purpose — a fake remote video would be a lie.
 */
export type TileState = "CONNECTING" | "CONNECTED" | "RECONNECTING" | "FAILED";

type VideoTileProps = {
  name: string;
  stream?: MediaStream | null;
  cameraOn: boolean;
  micOn: boolean;
  isSelf?: boolean;
  isOrganizer?: boolean;
  connections?: number;
  /** Peer connection state. Only meaningful for remote tiles. */
  state?: TileState;
  className?: string;
};

export function VideoTile({
  name,
  stream,
  cameraOn,
  micOn,
  isSelf = false,
  isOrganizer = false,
  connections = 1,
  state = "CONNECTED",
  className,
}: VideoTileProps) {
  const attachStream = useVideoStream(stream);

  // A remote stream whose camera is off still carries audio, so the element
  // stays mounted and is merely hidden — muting the tile would mute the person.
  const hasVideoTrack = Boolean(
    stream
      ?.getVideoTracks()
      .some(track => track.enabled && track.readyState === "live"),
  );
  const showVideo = isSelf ? Boolean(stream) && cameraOn : hasVideoTrack;

  return (
    <div
      className={cn(
        "group relative flex min-h-40 items-center justify-center overflow-hidden rounded-xl border border-white/10 bg-[oklch(0.24_0.02_258)] text-white",
        className,
      )}
    >
      {/* Always mounted for a remote peer: this element plays their audio. */}
      <video
        ref={attachStream}
        autoPlay
        playsInline
        // Muting the local preview is what stops a feedback howl.
        muted={isSelf}
        className={cn(
          "size-full object-cover",
          isSelf && "scale-x-[-1]",
          showVideo ? "block" : "hidden",
        )}
      />

      {showVideo ? null : (
        <div className="flex flex-col items-center gap-2">
          <span
            className="flex size-16 items-center justify-center rounded-full bg-white/10 text-lg font-semibold"
            aria-hidden="true"
          >
            {initials(name)}
          </span>
          {isSelf ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-white/50">
              <VideoOff className="size-3" aria-hidden="true" />
              Camera off
            </span>
          ) : state === "FAILED" ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-destructive">
              <WifiOff className="size-3" aria-hidden="true" />
              Could not connect
            </span>
          ) : state === "CONNECTED" ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-white/50">
              <VideoOff className="size-3" aria-hidden="true" />
              Camera off
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs text-white/50">
              <Loader2 className="size-3 animate-spin" aria-hidden="true" />
              {state === "RECONNECTING" ? "Reconnecting…" : "Connecting…"}
            </span>
          )}
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-2 bottom-2 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 rounded-md bg-black/55 px-2 py-1 text-xs backdrop-blur">
          {!micOn ? (
            <MicOff className="size-3 text-destructive" aria-hidden="true" />
          ) : null}
          <span className="max-w-40 truncate">
            {name}
            {isSelf ? " (you)" : ""}
          </span>
          {isOrganizer ? <span className="text-white/50">· host</span> : null}
        </span>

        {connections > 1 ? (
          <span className="rounded-md bg-black/55 px-2 py-1 text-xs backdrop-blur">
            {connections} devices
          </span>
        ) : null}
      </div>
    </div>
  );
}
