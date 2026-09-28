import { CalendarClock, Clock, Globe, Hourglass } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { formatDateTime, formatDuration, formatRelative, parse } from '@/lib/date/format';
import type { Call } from '@/lib/api/types';

function Fact({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Clock;
  label: string;
  value: string;
  hint?: string;
}): React.JSX.Element {
  return (
    <div className="flex gap-3">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
        <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
      </span>
      <div className="min-w-0 space-y-0.5">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-medium">{value}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );
}

/** The scheduled window, stated plainly — it is the boundary everything obeys. */
export function CallSummary({ call }: { call: Call }): React.JSX.Element {
  const start = parse(call.scheduledStart);
  const end = parse(call.scheduledEnd);
  const durationSeconds = start && end ? (end.getTime() - start.getTime()) / 1000 : 0;

  return (
    <Card>
      <CardContent className="grid gap-5 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <Fact
          icon={CalendarClock}
          label="Opens"
          value={formatDateTime(call.scheduledStart)}
          hint={formatRelative(call.scheduledStart)}
        />
        <Fact
          icon={Clock}
          label="Closes"
          value={formatDateTime(call.scheduledEnd)}
          hint={formatRelative(call.scheduledEnd)}
        />
        <Fact icon={Hourglass} label="Window" value={formatDuration(durationSeconds)} />
        <Fact
          icon={Globe}
          label="Scheduled in"
          value={call.timezone}
          hint="Times shown in your local timezone"
        />
      </CardContent>
    </Card>
  );
}
