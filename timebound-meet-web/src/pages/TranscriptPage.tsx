import { ArrowLeft } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { ErrorState } from '@/components/common/error-state';
import { LoadingState } from '@/components/common/loading-state';
import { PageHeader } from '@/components/common/page-header';
import { CallStatusBadge, useCall } from '@/features/calls';
import { TranscriptView } from '@/features/transcript';
import { formatWindow } from '@/lib/date/format';

export function TranscriptPage(): React.JSX.Element {
  const { callId = '' } = useParams<{ callId: string }>();
  const call = useCall(callId);

  return (
    <div className="space-y-6">
      <PageHeader
        title={call.data?.title ?? 'Transcript'}
        breadcrumb={
          <Link
            to={`/calls/${callId}`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Back to the meeting
          </Link>
        }
        description={
          call.data ? (
            <span className="flex flex-wrap items-center gap-3">
              <CallStatusBadge status={call.data.status} />
              <span>{formatWindow(call.data.scheduledStart, call.data.scheduledEnd)}</span>
            </span>
          ) : null
        }
      />

      {call.isPending ? <LoadingState label="Loading call…" rows={1} /> : null}
      {call.isError ? <ErrorState error={call.error} onRetry={() => void call.refetch()} /> : null}

      <Card>
        <CardContent className="pt-5">
          <TranscriptView callId={callId} />
        </CardContent>
      </Card>
    </div>
  );
}
