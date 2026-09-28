import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { formatCountdown, formatTime, parse } from '@/lib/date/format';

/**
 * Informational only.
 *
 * Nothing in the application gates on this timer: the backend closes the join
 * window and ends the call. If the two ever disagree, the backend wins and the
 * heartbeat will say so within one interval.
 */
export function CallTimer({
  scheduledStart,
  scheduledEnd,
  /** Server clock from the last heartbeat, used to correct local drift. */
  serverTime,
}: {
  scheduledStart: string;
  scheduledEnd: string;
  serverTime?: string | null;
}): React.JSX.Element {
  const [now, setNow] = useState(() => Date.now());
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const server = parse(serverTime);
    if (server) setOffset(server.getTime() - Date.now());
  }, [serverTime]);

  const start = parse(scheduledStart)?.getTime() ?? 0;
  const end = parse(scheduledEnd)?.getTime() ?? 0;
  const current = now + offset;

  const notStarted = current < start;
  const remaining = notStarted ? start - current : end - current;
  const elapsedRatio = end > start ? Math.min(1, Math.max(0, (current - start) / (end - start))) : 0;
  const endingSoon = !notStarted && remaining <= 5 * 60_000 && remaining > 0;

  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-col items-end">
        <span
          className={`inline-flex items-center gap-1.5 font-mono text-sm tabular-nums ${
            endingSoon ? 'text-warning-foreground' : ''
          }`}
          role="timer"
          aria-live="off"
        >
          <Clock className="size-3.5" aria-hidden="true" />
          {remaining > 0 ? formatCountdown(remaining) : '00:00'}
        </span>
        <span className="text-xs text-muted-foreground">
          {notStarted
            ? `starts ${formatTime(scheduledStart)}`
            : remaining > 0
              ? `ends ${formatTime(scheduledEnd)}`
              : 'window closed'}
        </span>
      </div>

      <div
        className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-muted sm:block"
        role="progressbar"
        aria-label="Elapsed call time"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(elapsedRatio * 100)}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-1000 ${
            endingSoon ? 'bg-warning' : 'bg-primary'
          }`}
          style={{ width: `${elapsedRatio * 100}%` }}
        />
      </div>
    </div>
  );
}
