import { useEffect, useRef } from 'react';
import { Captions, CaptionsOff, Info } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { LiveCaptionsState } from '@/features/call-media';
import { formatTime } from '@/lib/date/format';
import { cn } from '@/lib/utils';

/**
 * The running transcript.
 *
 * Each line is attributed by the server, not by the sender. Interim text is
 * dimmed so it reads as speech still firming up rather than as a correction.
 */
export function LiveCaptionPanel({
  captions,
  selfUserId,
}: {
  captions: LiveCaptionsState;
  selfUserId: string | undefined;
}): React.JSX.Element {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [captions.lines]);

  return (
    <section
      aria-label="Live captions"
      className="flex h-full min-h-48 flex-col rounded-lg border border-border bg-card"
    >
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <h3 className="inline-flex items-center gap-2 text-sm font-medium">
          {captions.publishing ? (
            <Captions className="size-4" aria-hidden="true" />
          ) : (
            <CaptionsOff className="size-4" aria-hidden="true" />
          )}
          Captions
        </h3>

        {captions.support === 'UNSUPPORTED' ? (
          <Badge variant="neutral">unavailable</Badge>
        ) : (
          <Button
            size="sm"
            variant={captions.publishing ? 'secondary' : 'outline'}
            onClick={captions.togglePublishing}
            aria-pressed={captions.publishing}
          >
            {captions.publishing ? 'Stop captioning' : 'Caption my speech'}
          </Button>
        )}
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3" aria-live="polite">
        {captions.lines.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {captions.support === 'UNSUPPORTED'
              ? "This browser can't do captions. Chrome or Edge will."
              : captions.publishing
                ? "Listening — say something!"
                : "Captions show up here for anyone who switches them on. Turn yours on so others can follow along."}
          </p>
        ) : (
          captions.lines.map((line) => (
            <p key={line.id} className={cn('text-sm', !line.isFinal && 'text-muted-foreground')}>
              <span className="font-medium">
                {line.userId === selfUserId ? 'You' : line.name}
              </span>
              <span className="ml-1.5 text-xs text-muted-foreground">{formatTime(line.at)}</span>
              <span className="mt-0.5 block">{line.text}</span>
            </p>
          ))
        )}
        <div ref={endRef} />
      </div>

      {captions.error ? (
        <p className="border-t border-border px-4 py-2 text-xs text-destructive">
          {captions.error}
        </p>
      ) : null}

      {captions.publishing ? (
        <p className="flex gap-2 border-t border-border px-4 py-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
          Your browser sends what you say to its speech service to turn it into text.
        </p>
      ) : null}
    </section>
  );
}
