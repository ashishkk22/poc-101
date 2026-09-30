import {
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
import type { Transcript, TranscriptStatus } from "@/lib/api/types";
import { useTranscript } from "./queries";

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
};

function TranscriptBody({ transcript }: TranscriptBodyProps) {
  switch (transcript.status) {
    case "PENDING":
    case "PROCESSING":
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
};

export function TranscriptView({ callId }: TranscriptViewProps) {
  const transcript = useTranscript(callId);

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
      <TranscriptBody transcript={transcript.data} />
    </div>
  );
}
