import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { formatPreciseDateTime, formatRelative } from "@/lib/date/format";
import {
  auditActionLabel,
  OUTCOME_VARIANT,
  visibleMetadata,
} from "./auditLabels";
import { LoadMore } from "@/components/common/LoadMore";
import { useInfiniteAuditEvents } from "./queries";
import { AuditOutcome } from "@/lib/api/types";

type AuditTimelineProps = {
  callId: string;
};

/**
 * Timestamps are stored UTC and rendered in the reader's local timezone —
 * the timeline is read by a person, in the place they are sitting.
 */
export function AuditTimeline({ callId }: AuditTimelineProps) {
  const audit = useInfiniteAuditEvents(callId);

  if (audit.isPending)
    return <LoadingState label="Loading audit trail…" rows={3} />;
  if (audit.isError)
    return (
      <ErrorState error={audit.error} onRetry={() => void audit.refetch()} />
    );

  const items = audit.data.pages.flatMap(page => page.items);

  if (items.length === 0) {
    return (
      <EmptyState
        title="Nothing to show yet"
        description="Everything that happens in this meeting gets noted here."
      />
    );
  }

  return (
    <div className="space-y-4">
      <ol className="relative space-y-1 border-l border-border pl-6">
        {items.map(event => {
          const metadata = visibleMetadata(event.metadata);

          return (
            <li key={event.id} className="relative py-3">
              <span
                className={`absolute -left-[1.6875rem] top-5 size-2.5 rounded-full ring-4 ring-[var(--background)] ${
                  event.outcome === AuditOutcome.DENIED
                    ? "bg-destructive"
                    : event.outcome === AuditOutcome.FAILURE
                      ? "bg-warning"
                      : "bg-success"
                }`}
                aria-hidden="true"
              />

              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{auditActionLabel(event.action)}</p>
                <Badge variant={OUTCOME_VARIANT[event.outcome] ?? "neutral"}>
                  {event.outcome.toLowerCase()}
                </Badge>
              </div>

              <p className="mt-0.5 text-xs text-muted-foreground">
                <time
                  dateTime={event.createdAt}
                  title={formatPreciseDateTime(event.createdAt)}
                >
                  {formatPreciseDateTime(event.createdAt)}
                </time>
                <span className="mx-1.5">·</span>
                {formatRelative(event.createdAt)}
              </p>

              {metadata.length > 0 ? (
                <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  {metadata.map(({ key, value }) => (
                    <div key={key} className="flex gap-1">
                      <dt className="font-medium">{key}:</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </li>
          );
        })}
      </ol>

      <LoadMore
        hasMore={Boolean(audit.hasNextPage)}
        loading={audit.isFetchingNextPage}
        onLoadMore={() => void audit.fetchNextPage()}
        loadedCount={items.length}
        noun="events"
      />
    </div>
  );
}
