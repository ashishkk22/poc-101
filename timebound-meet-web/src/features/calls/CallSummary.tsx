import { CalendarClock, Clock, Globe, Hourglass } from "lucide-react";
import { Card, CardContent } from "@/components/ui/Card";
import {
  formatDateTime,
  formatDuration,
  formatRelative,
  parse,
} from "@/lib/date/format";
import {
  formatInZone,
  localTimeZone,
  zoneCity,
  zoneOffsetLabel,
  zonesDiffer,
} from "@/lib/date/timezone";
import type { Call } from "@/lib/api/types";

type FactProps = {
  icon: typeof Clock;
  label: string;
  value: string;
  hint?: string;
};

function Fact({ icon: Icon, label, value, hint }: FactProps) {
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

type CallSummaryProps = {
  call: Call;
};

/** The scheduled window, stated plainly — it is the boundary everything obeys. */
export function CallSummary({ call }: CallSummaryProps) {
  const start = parse(call.scheduledStart);
  const end = parse(call.scheduledEnd);
  const durationSeconds =
    start && end ? (end.getTime() - start.getTime()) / 1000 : 0;

  // Everything is shown in the viewer's own zone. The meeting's zone earns a
  // mention only when it is a different clock, and then it says so explicitly
  // rather than printing a zone name beside a local time.
  const viewerZone = localTimeZone();
  const elsewhere = zonesDiffer(call.timezone, viewerZone);

  return (
    <Card>
      <CardContent className="grid gap-5 p-5 sm:grid-cols-2 lg:grid-cols-4">
        <Fact
          icon={CalendarClock}
          label="Starts"
          value={formatDateTime(call.scheduledStart)}
          {...(elsewhere
            ? {
                hint: `${formatInZone(call.scheduledStart, call.timezone)} in ${zoneCity(call.timezone)}`,
              }
            : { hint: formatRelative(call.scheduledStart) })}
        />
        <Fact
          icon={Clock}
          label="Ends"
          value={formatDateTime(call.scheduledEnd)}
          {...(elsewhere
            ? {
                hint: `${formatInZone(call.scheduledEnd, call.timezone)} in ${zoneCity(call.timezone)}`,
              }
            : { hint: formatRelative(call.scheduledEnd) })}
        />
        <Fact
          icon={Hourglass}
          label="Lasts"
          value={formatDuration(durationSeconds)}
        />
        <Fact
          icon={Globe}
          label={elsewhere ? "Your time" : "Timezone"}
          value={zoneCity(viewerZone)}
          hint={
            elsewhere
              ? `Set in ${zoneCity(call.timezone)} · ${zoneOffsetLabel(call.timezone)}`
              : zoneOffsetLabel(viewerZone)
          }
        />
      </CardContent>
    </Card>
  );
}
