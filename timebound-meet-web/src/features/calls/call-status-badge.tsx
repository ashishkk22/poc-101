import { Badge } from '@/components/ui/badge';
import type { CallStatus } from '@/lib/api/types';

const STATUS: Record<
  CallStatus,
  { label: string; variant: 'default' | 'neutral' | 'success' | 'warning' | 'destructive' }
> = {
  DRAFT: { label: 'Draft', variant: 'neutral' },
  SCHEDULED: { label: 'Scheduled', variant: 'default' },
  LIVE: { label: 'Live', variant: 'success' },
  ENDED: { label: 'Ended', variant: 'neutral' },
  CANCELLED: { label: 'Cancelled', variant: 'destructive' },
};

export function CallStatusBadge({ status }: { status: CallStatus }): React.JSX.Element {
  const entry = STATUS[status] ?? { label: status, variant: 'neutral' as const };

  return (
    <Badge variant={entry.variant}>
      {status === 'LIVE' ? (
        <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
      ) : null}
      {entry.label}
    </Badge>
  );
}
