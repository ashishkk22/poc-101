import { ArrowUpRight, Clock, Globe, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { formatRelative, formatWindow, parse } from "@/lib/date/format";
import {
  formatTimeInZone,
  localTimeZone,
  zoneCity,
  zonesDiffer,
} from "@/lib/date/timezone";
import type { Call } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { CallStatusBadge } from "./call-status-badge";
import { JoinCallButton } from "./join-call-button";

/**
 * A call in a list.
 *
 * The role badge is derived from the signed-in user against `organizerId`,
 * which the API already returns — it labels the row, it does not gate
 * anything.
 */
export function CallCard({
  call,
  currentUserId,
  highlight = false,
}: {
  call: Call;
  currentUserId?: string | undefined;
  highlight?: boolean;
}): React.JSX.Element {
  const isOrganizer = Boolean(
    currentUserId && call.organizerId === currentUserId,
  );
  const start = parse(call.scheduledStart);
  const isFuture = start ? start.getTime() > Date.now() : false;

  // Times read in the viewer's own zone. The meeting's zone is only worth
  // mentioning when it is a different clock from theirs.
  const viewerZone = localTimeZone();
  const elsewhere = zonesDiffer(call.timezone, viewerZone);

  return (
    <Card
      className={cn(
        "transition-colors hover:border-primary/40",
        highlight && "border-success/40 bg-success/[0.04]",
      )}
    >
      <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <CallStatusBadge status={call.status} />
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Users className="size-3" aria-hidden="true" />
              {isOrganizer ? "You organize" : "You were invited"}
            </span>
            <span className="text-xs text-muted-foreground">
              {isFuture ? "starts " : ""}
              {formatRelative(call.scheduledStart)}
            </span>
          </div>

          <h3 className="truncate text-base font-medium">{call.title}</h3>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-3.5" aria-hidden="true" />
              {formatWindow(call.scheduledStart, call.scheduledEnd)}
            </span>
            {elsewhere ? (
              <span className="inline-flex items-center gap-1.5">
                <Globe className="size-3.5" aria-hidden="true" />
                {formatTimeInZone(call.scheduledStart, call.timezone)} in{" "}
                {zoneCity(call.timezone)}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2 self-start sm:self-auto">
          <JoinCallButton call={call} size="sm" />
          <Link
            to={`/calls/${call.id}`}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-accent"
          >
            Open
            <ArrowUpRight className="size-4" aria-hidden="true" />
            <span className="sr-only">{call.title}</span>
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
