import { Badge } from "@/components/ui/Badge";
import { CallStatus } from "@/lib/api/types";

type StatusEntry = {
  label: string;
  variant: "default" | "neutral" | "success" | "warning" | "destructive";
};

const STATUS: Record<CallStatus, StatusEntry> = {
  DRAFT: { label: "Draft", variant: "neutral" },
  SCHEDULED: { label: "Scheduled", variant: "default" },
  LIVE: { label: "Live", variant: "success" },
  ENDED: { label: "Ended", variant: "neutral" },
  CANCELLED: { label: "Cancelled", variant: "destructive" },
};

type CallStatusBadgeProps = {
  status: CallStatus;
};

export function CallStatusBadge({ status }: CallStatusBadgeProps) {
  const entry = STATUS[status] ?? {
    label: status,
    variant: "neutral" as const,
  };

  return (
    <Badge variant={entry.variant}>
      {status === CallStatus.LIVE ? (
        <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
      ) : null}
      {entry.label}
    </Badge>
  );
}
