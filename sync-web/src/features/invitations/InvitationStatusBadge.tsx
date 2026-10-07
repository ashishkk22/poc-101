import { Badge } from "@/components/ui/Badge";
import type { InvitationStatus } from "@/lib/api/types";

type StatusEntry = {
  label: string;
  variant: "success" | "destructive" | "neutral";
};

const STATUS: Record<InvitationStatus, StatusEntry> = {
  ACTIVE: { label: "Active", variant: "success" },
  REVOKED: { label: "Revoked", variant: "destructive" },
  EXPIRED: { label: "Expired", variant: "neutral" },
};

type InvitationStatusBadgeProps = {
  status: InvitationStatus;
};

export function InvitationStatusBadge({ status }: InvitationStatusBadgeProps) {
  const entry = STATUS[status] ?? {
    label: status,
    variant: "neutral" as const,
  };
  return <Badge variant={entry.variant}>{entry.label}</Badge>;
}
