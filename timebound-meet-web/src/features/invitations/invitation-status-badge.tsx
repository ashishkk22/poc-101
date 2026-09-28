import { Badge } from '@/components/ui/badge';
import type { InvitationStatus } from '@/lib/api/types';

const STATUS: Record<
  InvitationStatus,
  { label: string; variant: 'success' | 'destructive' | 'neutral' }
> = {
  ACTIVE: { label: 'Active', variant: 'success' },
  REVOKED: { label: 'Revoked', variant: 'destructive' },
  EXPIRED: { label: 'Expired', variant: 'neutral' },
};

export function InvitationStatusBadge({ status }: { status: InvitationStatus }): React.JSX.Element {
  const entry = STATUS[status] ?? { label: status, variant: 'neutral' as const };
  return <Badge variant={entry.variant}>{entry.label}</Badge>;
}
