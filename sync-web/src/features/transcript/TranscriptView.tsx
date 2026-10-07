import {
  Ban,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileText,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { formatDateTime } from "@/lib/date/format";
import {
  CallStatus,
  type Call,
  type Transcript,
  type TranscriptStatus,
} from "@/lib/api/types";
import { useTranscript } from "./queries";

/**
 * A transcript is normally ready a minute or two after the meeting ends.
 * Past this, "a minute or two" would be untrue, so the page says it's late.
 */
const OVERDUE_AFTER_MS = 10 * 60_000;

type TranscriptCall = Pick<Call, "status" | "scheduledEnd" | "endedAt">;

function isOverdue(call: TranscriptCall | undefined, now: number): boolean {
  if (!call) return false;
  const endedAt = Date.parse(call.endedAt ?? call.scheduledEnd);
  return Number.isFinite(endedAt) && now - endedAt > OVERDUE_AFTER_MS;
}

const STATUS: Record<
  TranscriptStatus,
  {
    label: string;
    variant: "default" | "neutral" | "success" | "warning" | "destructive";
  }
> = {
  PENDING: { label: "Queued", variant: "warning" },
  PROCESSING: { label: "Processing", variant: "warning" },
  READY: { label: "Ready", variant: "success" },
  FAILED: { label: "Failed", variant: "destructive" },
  DELETED: { label: "Deleted", variant: "neutral" },
};

type TranscriptStatusBadgeProps = {
  status: TranscriptStatus;
};

export function TranscriptStatusBadge({ status }: TranscriptStatusBadgeProps) {
  const entry = STATUS[status] ?? {
    label: status,
    variant: "neutral" as const,
  };
  return <Badge variant={entry.variant}>{entry.label}</Badge>;
}

type TranscriptBodyProps = {
  transcript: Transcript;
  overdue: boolean;
};

function TranscriptBody({ transcript, overdue }: TranscriptBodyProps) {
  switch (transcript.status) {
    case "PENDING":
    case "PROCESSING":
      if (overdue) {
        return (
          <Alert variant="warning">
            <Clock aria-hidden="true" />
            <div>
              <AlertTitle>This is taking longer than it should</AlertTitle>
              <AlertDescription>
                Transcripts are usually ready a minute or two after the meeting
                ends. We'll keep checking, but if it stays like this, the
                transcript service may not be running.
              </AlertDescription>
            </div>
          </Alert>
        );
      }
      return (
        <Alert variant="info">
          <Clock aria-hidden="true" />
          <div>
            <AlertTitle>We're writing this up</AlertTitle>
            <AlertDescription>
              It takes a minute or two. This page updates on its own, so feel
              free to wander off.
            </AlertDescription>
          </div>
        </Alert>
      );

    case "FAILED":
      return (
        <Alert variant="destructive">
          <TriangleAlert aria-hidden="true" />
          <div>
            <AlertTitle>We couldn't write this one up</AlertTitle>
            <AlertDescription>
              Something went wrong turning the audio into text. Everything else
              about the meeting is still here.
            </AlertDescription>
          </div>
        </Alert>
      );

    case "DELETED":
      return (
        <Alert variant="warning">
          <Trash2 aria-hidden="true" />
          <div>
            <AlertTitle>This transcript is gone</AlertTitle>
            <AlertDescription>
              We only keep transcripts for a while, and this one's past that.
            </AlertDescription>
          </div>
        </Alert>
      );

    case "READY":
    default:
      if (!transcript.content) {
        return (
          <Alert variant="warning">
            <FileText aria-hidden="true" />
            <div>
              <AlertTitle>Nothing to show</AlertTitle>
              <AlertDescription>
                This one's marked as ready, but there's no text to show.
              </AlertDescription>
            </div>
          </Alert>
        );
      }

      return (
        <div className="space-y-3">
          <Alert variant="success">
            <CheckCircle2 aria-hidden="true" />
            <AlertDescription>
              Generated {formatDateTime(transcript.generatedAt)}
              {transcript.expiresAt
                ? ` · retained until ${formatDateTime(transcript.expiresAt)}`
                : ""}
            </AlertDescription>
          </Alert>
          <article className="rounded-lg border border-border bg-card p-5">
            <pre className="whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">
              {transcript.content}
            </pre>
          </article>
        </div>
      );
  }
}

type TranscriptViewProps = {
  callId: string;
  /** When known, lets the view tell "not yet" and "late" apart from "soon". */
  call?: TranscriptCall;
};

export function TranscriptView({ callId, call }: TranscriptViewProps) {
  // Only an ended meeting is written up; asking before then would just poll.
  const awaitingEnd =
    call !== undefined &&
    call.status !== CallStatus.ENDED &&
    call.status !== CallStatus.CANCELLED;
  const cancelled = call?.status === CallStatus.CANCELLED;
  const transcript = useTranscript(callId, {
    enabled: !awaitingEnd && !cancelled,
  });

  if (awaitingEnd) {
    return (
      <Alert variant="info">
        <CalendarClock aria-hidden="true" />
        <div>
          <AlertTitle>Written up after the meeting</AlertTitle>
          <AlertDescription>
            The transcript is put together once the meeting ends. Check back
            then.
          </AlertDescription>
        </div>
      </Alert>
    );
  }

  if (cancelled) {
    return (
      <Alert>
        <Ban aria-hidden="true" />
        <div>
          <AlertTitle>No transcript</AlertTitle>
          <AlertDescription>
            This meeting was cancelled, so there's nothing to write up.
          </AlertDescription>
        </div>
      </Alert>
    );
  }

  if (transcript.isPending)
    return <LoadingState label="Loading transcript…" rows={2} />;
  if (transcript.isError) {
    return (
      <ErrorState
        error={transcript.error}
        onRetry={() => void transcript.refetch()}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Status</span>
        <TranscriptStatusBadge status={transcript.data.status} />
      </div>
      <TranscriptBody
        transcript={transcript.data}
        // Measured at the last check, so it stays current while polling.
        overdue={isOverdue(call, transcript.dataUpdatedAt)}
      />
    </div>
  );
}
