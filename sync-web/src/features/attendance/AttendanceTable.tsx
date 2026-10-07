import { Badge } from "@/components/ui/Badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/Table";
import { EmptyState } from "@/components/common/EmptyState";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { formatDateTime, formatDuration } from "@/lib/date/format";
import type { AttendanceStatus } from "@/lib/api/types";
import { LoadMore } from "@/components/common/LoadMore";
import { useInfiniteAttendance } from "./queries";
import { AttendanceSessionStatus } from "@/lib/api/types";

type Status = { label: string; variant: "success" | "neutral" };

const STATUS: Record<AttendanceStatus, Status> = {
  NOT_JOINED: { label: "Not joined", variant: "neutral" },
  ACTIVE: { label: "Connected", variant: "success" },
  COMPLETED: { label: "Completed", variant: "neutral" },
};

type AttendanceTableProps = {
  callId: string;
  live?: boolean;
};

/**
 * Device identifiers are shown because a participant's own concurrent
 * connections are meaningful to an organizer. Internal database ids are not.
 */
export function AttendanceTable({
  callId,
  live = false,
}: AttendanceTableProps) {
  const attendance = useInfiniteAttendance(callId, {
    refetchInterval: live ? 15_000 : false,
  });

  if (attendance.isPending)
    return <LoadingState label="Loading attendance…" rows={2} />;
  if (attendance.isError) {
    return (
      <ErrorState
        error={attendance.error}
        onRetry={() => void attendance.refetch()}
      />
    );
  }

  const items = attendance.data.pages.flatMap(page => page.items);

  if (items.length === 0) {
    return (
      <EmptyState
        title="Nobody's turned up yet"
        description="As people join, you'll see them here."
      />
    );
  }

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Participant</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>First joined</TableHead>
            <TableHead>Last left</TableHead>
            <TableHead>Connected time</TableHead>
            <TableHead>Sessions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map(record => {
            const status = STATUS[record.status] ?? {
              label: record.status,
              variant: "neutral" as const,
            };
            const connectedSessions =
              record.sessions?.filter(session => session.status === AttendanceSessionStatus.CONNECTED)
                .length ?? 0;

            return (
              <TableRow key={record.id}>
                <TableCell>
                  <div className="space-y-0.5">
                    <p className="font-medium">
                      {record.participant?.name ?? "Participant"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {record.participant?.email ?? "—"}
                    </p>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={status.variant}>{status.label}</Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDateTime(record.firstJoinedAt, "Never")}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDateTime(record.lastLeftAt, "—")}
                </TableCell>
                <TableCell className="text-sm">
                  {formatDuration(record.totalConnectedSeconds)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {record.sessions?.length ?? 0}
                  {connectedSessions > 0 ? (
                    <span className="ml-1 text-success">
                      ({connectedSessions} live)
                    </span>
                  ) : null}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <LoadMore
        hasMore={Boolean(attendance.hasNextPage)}
        loading={attendance.isFetchingNextPage}
        onLoadMore={() => void attendance.fetchNextPage()}
        loadedCount={items.length}
        noun="participants"
      />
    </div>
  );
}
