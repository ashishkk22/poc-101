import { CircleDot, LogIn, LogOut, PhoneOff, ShieldOff } from 'lucide-react';
import type { ActivityEntry, ActivityKind } from '@/features/call-media';
import { formatTime } from '@/lib/date/format';
import { cn } from '@/lib/utils';

const ICON: Record<ActivityKind, typeof LogIn> = {
  YOU_JOINED: CircleDot,
  JOINED: LogIn,
  LEFT: LogOut,
  REVOKED: ShieldOff,
  CALL_ENDED: PhoneOff,
};

const TONE: Record<ActivityKind, string> = {
  YOU_JOINED: 'text-muted-foreground',
  JOINED: 'text-success',
  LEFT: 'text-muted-foreground',
  REVOKED: 'text-destructive',
  CALL_ENDED: 'text-warning',
};

/**
 * Live activity in the call.
 *
 * The organizer's audit trail on the call page remains the record; this is the
 * same story told as it unfolds, to everyone in the room.
 */
export function ActivityPanel({ entries }: { entries: ActivityEntry[] }): React.JSX.Element {
  return (
    <section
      aria-label="Call activity"
      className="flex h-full min-h-40 flex-col rounded-lg border border-border bg-card"
    >
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <h3 className="text-sm font-medium">Activity</h3>
        <span className="text-xs text-muted-foreground">this call</span>
      </header>

      <ol className="flex-1 space-y-2 overflow-y-auto px-4 py-3" aria-live="polite">
        {entries.length === 0 ? (
          <li className="text-sm text-muted-foreground">Nothing to report yet.</li>
        ) : (
          entries.map((entry) => {
            const Icon = ICON[entry.kind];
            return (
              <li key={entry.id} className="flex items-start gap-2 text-sm">
                <Icon
                  className={cn('mt-0.5 size-3.5 shrink-0', TONE[entry.kind])}
                  aria-hidden="true"
                />
                <span className="flex-1">{entry.text}</span>
                <time className="shrink-0 text-xs text-muted-foreground" dateTime={entry.at}>
                  {formatTime(entry.at)}
                </time>
              </li>
            );
          })
        )}
      </ol>
    </section>
  );
}
