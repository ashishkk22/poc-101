import { ArrowLeft } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/Card";
import { PageHeader } from "@/components/common/PageHeader";
import { AuditTimeline } from "@/features/audit";
import { useCall } from "@/features/calls";

export function AuditPage(): React.JSX.Element {
  const { callId = "" } = useParams<{ callId: string }>();
  const call = useCall(callId);

  return (
    <div className="space-y-6">
      <PageHeader
        title={
          call.data ? `What happened — ${call.data.title}` : "What happened"
        }
        description="A running record of this meeting, shown in your local time."
        breadcrumb={
          <Link
            to={`/calls/${callId}`}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Back to the meeting
          </Link>
        }
      />

      <Card>
        <CardContent className="pt-5">
          <AuditTimeline callId={callId} />
        </CardContent>
      </Card>
    </div>
  );
}
