import { useMemo } from "react";
import { CalendarClock, CalendarPlus, CheckCircle2, Radio } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/Button";
import { Card, CardContent } from "@/components/ui/Card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadMore } from "@/components/common/LoadMore";
import { LoadingState } from "@/components/common/LoadingState";
import { PageHeader } from "@/components/common/PageHeader";
import {
  CallCard,
  flattenPages,
  useCalls,
  useInfiniteCalls,
} from "@/features/calls";
import { useCurrentUser } from "@/features/auth";
import type { Call, ListCallsQuery } from "@/lib/api/types";
import { parse } from "@/lib/date/format";

/** A 30-day horizon keeps "next up" both bounded and honestly labelled. */
const UPCOMING_HORIZON_DAYS = 30;

function horizon(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function byStartAscending(a: Call, b: Call): number {
  return (
    (parse(a.scheduledStart)?.getTime() ?? 0) -
    (parse(b.scheduledStart)?.getTime() ?? 0)
  );
}

interface SectionProps {
  query: ListCallsQuery;
  emptyTitle: string;
  emptyDescription: string;
  /**
   * The API always orders `scheduledStart DESC`. Future-facing lists read
   * backwards that way, so they are re-sorted for display.
   */
  sortAscending?: boolean;
  highlight?: boolean;
  noun?: string;
}

function CallSection({
  query,
  emptyTitle,
  emptyDescription,
  sortAscending = false,
  highlight = false,
  noun = "calls",
}: SectionProps): React.JSX.Element {
  const { user } = useCurrentUser();
  const calls = useInfiniteCalls(query);

  const items = useMemo(() => {
    const flat = flattenPages(calls.data?.pages);
    return sortAscending ? [...flat].sort(byStartAscending) : flat;
  }, [calls.data?.pages, sortAscending]);

  if (calls.isPending) return <LoadingState label="Loading calls…" />;
  if (calls.isError)
    return (
      <ErrorState error={calls.error} onRetry={() => void calls.refetch()} />
    );

  if (items.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="space-y-3">
      {items.map(call => (
        <CallCard
          key={call.id}
          call={call}
          currentUserId={user?.id}
          highlight={highlight}
        />
      ))}
      <LoadMore
        hasMore={Boolean(calls.hasNextPage)}
        loading={calls.isFetchingNextPage}
        onLoadMore={() => void calls.fetchNextPage()}
        loadedCount={items.length}
        noun={noun}
      />
    </div>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  count,
  more,
  loading,
  tone = "default",
}: {
  icon: typeof Radio;
  label: string;
  count: number;
  /** True when the backend has further pages, so the figure is a floor. */
  more: boolean;
  loading: boolean;
  tone?: "default" | "success";
}): React.JSX.Element {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <span
          className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${
            tone === "success" ? "bg-success/12" : "bg-primary/10"
          }`}
        >
          <Icon
            className={`size-5 ${tone === "success" ? "text-success" : "text-primary"}`}
            aria-hidden="true"
          />
        </span>
        <div className="min-w-0">
          <p className="text-2xl font-semibold tabular-nums">
            {loading ? "—" : `${count}${more ? "+" : ""}`}
          </p>
          <p className="truncate text-sm text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * The organizer's home.
 *
 * Each panel is a bounded, server-paginated query — the dashboard never pulls
 * a full history and slices it in the browser.
 */
export function DashboardPage(): React.JSX.Element {
  const { user } = useCurrentUser();
  const greeting = useMemo(() => user?.name?.split(" ")[0] ?? "there", [user]);
  const upcomingWindow = useMemo(
    () => ({
      after: new Date().toISOString(),
      before: horizon(UPCOMING_HORIZON_DAYS),
    }),
    [],
  );

  // Small, capped reads purely for the counters above the tabs.
  const live = useCalls({ role: "any", status: "LIVE", limit: 25 });
  const upcoming = useCalls({
    role: "any",
    status: "SCHEDULED",
    startAfter: upcomingWindow.after,
    startBefore: upcomingWindow.before,
    limit: 25,
  });
  const ended = useCalls({ role: "any", status: "ENDED", limit: 25 });

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Hello, ${greeting}`}
        description="Everything you're hosting, and everything you've been invited to."
        actions={
          <Button asChild>
            <Link to="/calls/new">
              <CalendarPlus aria-hidden="true" />
              New meeting
            </Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <SummaryCard
          icon={Radio}
          label="Happening now"
          count={live.data?.items.length ?? 0}
          more={Boolean(live.data?.nextCursor)}
          loading={live.isPending}
          tone="success"
        />
        <SummaryCard
          icon={CalendarClock}
          label={`Scheduled in ${UPCOMING_HORIZON_DAYS} days`}
          count={upcoming.data?.items.length ?? 0}
          more={Boolean(upcoming.data?.nextCursor)}
          loading={upcoming.isPending}
        />
        <SummaryCard
          icon={CheckCircle2}
          label="Recently ended"
          count={ended.data?.items.length ?? 0}
          more={Boolean(ended.data?.nextCursor)}
          loading={ended.isPending}
        />
      </div>

      <Tabs defaultValue="upcoming">
        <TabsList aria-label="Meeting views">
          <TabsTrigger value="upcoming">Next up</TabsTrigger>
          <TabsTrigger value="live">
            <Radio className="size-3.5" aria-hidden="true" />
            Live
          </TabsTrigger>
          <TabsTrigger value="ended">Past</TabsTrigger>
          <TabsTrigger value="invited">Invited</TabsTrigger>
        </TabsList>

        <TabsContent value="upcoming">
          <CallSection
            query={{
              role: "any",
              status: "SCHEDULED",
              startAfter: upcomingWindow.after,
              startBefore: upcomingWindow.before,
              limit: 25,
            }}
            sortAscending
            emptyTitle="Nothing coming up"
            emptyDescription="Set up a meeting and invite whoever you need."
          />
        </TabsContent>

        <TabsContent value="live">
          <CallSection
            query={{ role: "any", status: "LIVE", limit: 25 }}
            highlight
            emptyTitle="Nothing happening right now"
            emptyDescription="Meetings show up here while they're running."
          />
        </TabsContent>

        <TabsContent value="ended">
          <CallSection
            query={{ role: "any", status: "ENDED", limit: 25 }}
            emptyTitle="Nothing here yet"
            emptyDescription="Once a meeting wraps up, you'll find it here with its transcript."
          />
        </TabsContent>

        <TabsContent value="invited">
          <CallSection
            query={{ role: "participant", limit: 25 }}
            emptyTitle="No invites yet"
            emptyDescription="When someone invites you, it'll show up here."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
