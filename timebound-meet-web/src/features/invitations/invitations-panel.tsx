import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import type { Call } from "@/lib/api/types";
import { InvitationTable } from "./invitation-table";
import { InviteParticipantDialog } from "./invite-participant-dialog";
import { useInvitations } from "./queries";

/**
 * Owns the invitation list for a call.
 *
 * Both the dialog and the table read the same query key, so TanStack serves
 * them from one request and the duplicate check the dialog performs is made
 * against exactly what the table shows.
 */
export function InvitationsPanel({ call }: { call: Call }): React.JSX.Element {
  const invitations = useInvitations(call.id);

  const closed = call.status === "CANCELLED" || call.status === "ENDED";
  const disabledReason = closed
    ? "You can't invite people once a meeting is over or called off."
    : undefined;

  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <CardTitle className="text-base">Guests</CardTitle>
          <CardDescription>
            Everyone gets their own link, and you can take it back any time.
          </CardDescription>
        </div>

        <InviteParticipantDialog
          callId={call.id}
          organizerId={call.organizerId}
          existingInvitations={invitations.data?.items ?? []}
          disabled={closed || invitations.isPending}
          disabledReason={disabledReason}
        />
      </CardHeader>

      <CardContent>
        {invitations.isPending ? (
          <LoadingState label="Loading invitations…" rows={2} />
        ) : invitations.isError ? (
          <ErrorState
            error={invitations.error}
            onRetry={() => void invitations.refetch()}
          />
        ) : (
          <InvitationTable callId={call.id} />
        )}
      </CardContent>
    </Card>
  );
}
