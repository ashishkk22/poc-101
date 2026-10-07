import { Wifi, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { useRealtime } from "@/lib/realtime";
import { RealtimeStatus } from "@/lib/realtime";

/**
 * Shows connectivity, not authority. A dropped socket never implies the user
 * lost access — the backend is still asked on every action.
 */
export function RealtimeStatusBadge(): React.JSX.Element | null {
  const { status } = useRealtime();

  if (status === RealtimeStatus.IDLE || status === RealtimeStatus.CONNECTED) {
    return (
      <Badge
        variant="neutral"
        className="hidden sm:inline-flex"
        title="Live updates connected"
      >
        <Wifi className="size-3" aria-hidden="true" />
        Live
      </Badge>
    );
  }

  return (
    <Badge
      variant="warning"
      title="Live updates unavailable — access is unaffected"
    >
      <WifiOff className="size-3" aria-hidden="true" />
      {status === RealtimeStatus.CONNECTING ? "Connecting" : "Offline"}
    </Badge>
  );
}
