import { Crown, ShieldOff, UserPlus, Users } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import {
  InviteParticipantDialog,
  useInfiniteInvitations,
  useRevokeInvitation,
} from "@/features/invitations";
import type { CallParticipant, Invitation } from "@/lib/api/types";
import { formatTime } from "@/lib/date/format";
import { notify } from "@/lib/toast";
import { InvitationStatus } from "@/lib/api/types";

type CallPeoplePanelProps = {
  callId: string;
  participants: CallParticipant[];
  currentUserId: string | undefined;
  isOrganizer: boolean;
  loading?: boolean;
  inviteOpen?: boolean;
  onInviteOpenChange?: (open: boolean) => void;
};

/**
 * Who is here, who was invited, and what the host can do about it — without
 * leaving the call.
 *
 * Sending someone away to another page to manage guests would drop them out of
 * the meeting entirely: the room unmounts, the camera stops and every peer
 * connection closes. Inviting and uninviting belong in here.
 */
export function CallPeoplePanel({
  callId,
  participants,
  currentUserId,
  isOrganizer,
  loading = false,
  inviteOpen,
  onInviteOpenChange,
}: CallPeoplePanelProps) {
  // Only the host may read the guest list, so only the host asks for it.
  const invitations = useInfiniteInvitations(isOrganizer ? callId : undefined);
  const revoke = useRevokeInvitation(callId);
  const [pendingRevoke, setPendingRevoke] = useState<Invitation | null>(null);

  const invited = invitations.data?.pages.flatMap(page => page.items) ?? [];
  const present = new Set(participants.map(person => person.id));

  // Someone invited who has not arrived, or has stepped out.
  const awaited = invited.filter(
    invitation =>
      invitation.status === InvitationStatus.ACTIVE && !present.has(invitation.participantId),
  );

  function invitationFor(userId: string): Invitation | undefined {
    return invited.find(
      invitation =>
        invitation.participantId === userId && invitation.status === InvitationStatus.ACTIVE,
    );
  }

  return (
    <section
      aria-label="People"
      className="flex h-full min-h-40 flex-col rounded-lg border border-border bg-card"
    >
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <h3 className="inline-flex items-center gap-2 text-sm font-medium">
          <Users className="size-4" aria-hidden="true" />
          People
        </h3>

        {isOrganizer ? (
          <InviteParticipantDialog
            compact
            callId={callId}
            organizerId={currentUserId ?? ""}
            existingInvitations={invited}
            {...(inviteOpen !== undefined ? { open: inviteOpen } : {})}
            {...(onInviteOpenChange
              ? { onOpenChange: onInviteOpenChange }
              : {})}
          />
        ) : (
          <Badge variant="neutral">{loading ? "…" : participants.length}</Badge>
        )}
      </header>

      <div className="flex-1 overflow-y-auto">
        <p className="px-4 pt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          In the call · {participants.length}
        </p>

        <ul className="divide-y divide-border" aria-live="polite">
          {participants.map(person => {
            const invitation = isOrganizer
              ? invitationFor(person.id)
              : undefined;
            const revoking =
              revoke.isPending && revoke.variables === invitation?.id;

            return (
              <li
                key={person.id}
                className="flex items-center justify-between gap-2 px-4 py-2.5"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                    {person.name}
                    {person.id === currentUserId ? (
                      <span className="text-xs font-normal text-muted-foreground">
                        (you)
                      </span>
                    ) : null}
                    {person.isOrganizer ? (
                      <Crown
                        className="size-3 text-warning"
                        aria-label="Host"
                      />
                    ) : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    joined {formatTime(person.joinedAt)}
                    {person.connections > 1
                      ? ` · ${person.connections} devices`
                      : ""}
                  </p>
                </div>

                {/* Removing someone mid-call is the point of the product. */}
                {invitation && person.id !== currentUserId ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="shrink-0 text-destructive hover:text-destructive"
                    loading={revoking}
                    disabled={revoke.isPending}
                    onClick={() => setPendingRevoke(invitation)}
                    aria-label={`Remove ${person.name} from the call`}
                  >
                    {revoking ? null : <ShieldOff aria-hidden="true" />}
                    Remove
                  </Button>
                ) : (
                  <span
                    className="size-2 shrink-0 rounded-full bg-success"
                    aria-label="Here"
                  />
                )}
              </li>
            );
          })}

          {participants.length === 0 && !loading ? (
            <li className="px-4 py-4 text-sm text-muted-foreground">
              Nobody else here just yet.
            </li>
          ) : null}
        </ul>

        {isOrganizer && awaited.length > 0 ? (
          <>
            <p className="px-4 pt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Invited · {awaited.length}
            </p>
            <ul className="divide-y divide-border">
              {awaited.map(invitation => {
                const revoking =
                  revoke.isPending && revoke.variables === invitation.id;

                return (
                  <li
                    key={invitation.id}
                    className="flex items-center justify-between gap-2 px-4 py-2.5"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm">
                        {invitation.participant?.name ?? "Invited guest"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Not here yet
                      </p>
                    </div>

                    <Button
                      size="sm"
                      variant="ghost"
                      className="shrink-0 text-muted-foreground"
                      loading={revoking}
                      disabled={revoke.isPending}
                      onClick={() => setPendingRevoke(invitation)}
                      aria-label={`Take back ${invitation.participant?.name ?? "this"} invite`}
                    >
                      Uninvite
                    </Button>
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}

        {isOrganizer && participants.length <= 1 && awaited.length === 0 ? (
          <p className="flex items-start gap-2 px-4 py-4 text-xs text-muted-foreground">
            <UserPlus className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            Invite a few people and they can join whenever they like.
          </p>
        ) : null}
      </div>

      <ConfirmDialog
        open={Boolean(pendingRevoke)}
        onOpenChange={open => (open ? undefined : setPendingRevoke(null))}
        title="Take back this invite?"
        destructive
        pending={revoke.isPending}
        confirmLabel="Take it back"
        description={
          <span>
            {pendingRevoke?.participant?.name ?? "They"} won't be able to join
            any more, and if they're in the call right now, they'll drop out
            within seconds.
          </span>
        }
        onConfirm={() => {
          if (!pendingRevoke) return;
          const name = pendingRevoke.participant?.name ?? "They";

          revoke.mutate(pendingRevoke.id, {
            onSuccess: () =>
              notify.success(
                "Invite taken back",
                `${name} can't join any more.`,
              ),
            onError: notify.error,
            onSettled: () => setPendingRevoke(null),
          });
        }}
      />
    </section>
  );
}
