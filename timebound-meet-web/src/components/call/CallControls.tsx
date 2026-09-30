import {
  LogOut,
  Mic,
  MicOff,
  PhoneOff,
  Users,
  Video,
  VideoOff,
} from "lucide-react";
import { Button } from "@/components/ui/Button";

type CallControlsProps = {
  micOn: boolean;
  cameraOn: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onLeave: () => void;
  onEndForAll?: () => void;
  leaving: boolean;
  ending?: boolean;
  canEndForAll: boolean;
  participantCount: number;
  onToggleRoster?: () => void;
};

/**
 * Local media toggles, plus the two ways out.
 *
 * Mute and camera are purely local state — they never touch authorization.
 * Leaving closes your own attendance; ending closes the call for everyone and
 * is offered to the organizer alone, because the backend allows it to nobody
 * else.
 */
export function CallControls({
  micOn,
  cameraOn,
  onToggleMic,
  onToggleCamera,
  onLeave,
  onEndForAll,
  leaving,
  ending,
  canEndForAll,
  participantCount,
  onToggleRoster,
}: CallControlsProps) {
  return (
    <div
      role="toolbar"
      aria-label="Call controls"
      className="flex flex-wrap items-center justify-center gap-2 rounded-xl border border-border bg-card p-3"
    >
      <Button
        variant={micOn ? "outline" : "secondary"}
        onClick={onToggleMic}
        aria-pressed={!micOn}
        aria-label={micOn ? "Mute microphone" : "Unmute microphone"}
      >
        {micOn ? <Mic aria-hidden="true" /> : <MicOff aria-hidden="true" />}
        <span className="hidden sm:inline">{micOn ? "Mute" : "Unmute"}</span>
      </Button>

      <Button
        variant={cameraOn ? "outline" : "secondary"}
        onClick={onToggleCamera}
        aria-pressed={!cameraOn}
        aria-label={cameraOn ? "Turn camera off" : "Turn camera on"}
      >
        {cameraOn ? (
          <Video aria-hidden="true" />
        ) : (
          <VideoOff aria-hidden="true" />
        )}
        <span className="hidden sm:inline">
          {cameraOn ? "Camera" : "Camera off"}
        </span>
      </Button>

      {onToggleRoster ? (
        <Button
          variant="outline"
          onClick={onToggleRoster}
          className="lg:hidden"
          aria-label={`Show participants (${participantCount})`}
        >
          <Users aria-hidden="true" />
          {participantCount}
        </Button>
      ) : null}

      <span
        className="mx-1 hidden h-6 w-px bg-border sm:block"
        aria-hidden="true"
      />

      <Button variant="outline" onClick={onLeave} loading={leaving}>
        {leaving ? null : <LogOut aria-hidden="true" />}
        Leave
      </Button>

      {canEndForAll && onEndForAll ? (
        <Button variant="destructive" onClick={onEndForAll} loading={ending}>
          {ending ? null : <PhoneOff aria-hidden="true" />}
          <span className="hidden sm:inline">End for everyone</span>
          <span className="sm:hidden">End</span>
        </Button>
      ) : null}
    </div>
  );
}
