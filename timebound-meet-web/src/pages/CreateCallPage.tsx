import { ArrowLeft } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/Card";
import { PageHeader } from "@/components/common/PageHeader";
import { CallForm, useCreateCall } from "@/features/calls";
import { notify } from "@/lib/toast";

export function CreateCallPage(): React.JSX.Element {
  const navigate = useNavigate();
  const createCall = useCreateCall();

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Set up a meeting"
        description="Pick a time, and we'll handle the rest."
        breadcrumb={
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Back to my meetings
          </Link>
        }
      />

      <Card>
        <CardContent className="pt-5">
          <CallForm
            pending={createCall.isPending}
            error={createCall.error}
            onCancel={() => navigate("/dashboard")}
            onSubmit={input =>
              createCall.mutate(input, {
                onSuccess: call => {
                  notify.success(
                    "All set",
                    "Now invite the people you want there.",
                  );
                  navigate(`/calls/${call.id}`, { replace: true });
                },
                onError: notify.error,
              })
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}
