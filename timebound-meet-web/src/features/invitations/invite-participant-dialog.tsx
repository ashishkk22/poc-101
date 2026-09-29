import { useState } from "react";
import { CircleAlert, Link2, Search, UserPlus } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CopyButton } from "@/components/common/CopyButton";
import { ErrorState } from "@/components/common/ErrorState";
import { formatDateTime } from "@/lib/date/format";
import { notify } from "@/lib/toast";
import type { CreatedInvitation, Invitation, User } from "@/lib/api/types";
import { useCreateInvitation, useUserLookup } from "./queries";

/**
 * Two steps, deliberately: resolve the person, then issue the invitation.
 *
 * The join link comes back exactly once. It is shown for copying and never
 * written to storage or re-fetched, because the backend keeps only a hash.
 */
export function InviteParticipantDialog({
  callId,
  organizerId,
  existingInvitations,
  disabled,
  disabledReason,
  compact = false,
  open: controlledOpen,
  onOpenChange,
}: {
  callId: string;
  organizerId: string;
  /** Used to catch a duplicate before the backend has to reject it. */
  existingInvitations: Invitation[];
  disabled?: boolean;
  disabledReason?: string;
  /** Sized to sit inside a side panel rather than a page header. */
  compact?: boolean;
  /**
   * Opens the dialog from somewhere other than its own button — the call room
   * offers an "Invite someone" prompt away from the panel and needs to be able
   * to open this.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}): React.JSX.Element {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  const setOpen = (next: boolean): void => {
    if (!isControlled) setUncontrolledOpen(next);
    onOpenChange?.(next);
  };
  const [email, setEmail] = useState("");
  const [searchedEmail, setSearchedEmail] = useState("");
  const [issued, setIssued] = useState<CreatedInvitation | null>(null);

  const lookup = useUserLookup(searchedEmail, searchedEmail.length > 0);
  const createInvitation = useCreateInvitation(callId);

  const found: User | null = lookup.data ?? null;

  // The backend enforces both of these; catching them here turns a rejection
  // into guidance the organizer can act on before submitting.
  const alreadyInvited = found
    ? existingInvitations.find(
        invitation => invitation.participantId === found.id,
      )
    : undefined;
  const isOrganizer = Boolean(found && found.id === organizerId);
  const blocked = Boolean(alreadyInvited) || isOrganizer;

  function reset(): void {
    setEmail("");
    setSearchedEmail("");
    setIssued(null);
    createInvitation.reset();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button
          disabled={disabled}
          title={disabled ? disabledReason : undefined}
          size={compact ? "sm" : "default"}
          variant={compact ? "outline" : "default"}
        >
          <UserPlus aria-hidden="true" />
          {compact ? "Invite" : "Invite someone"}
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a participant</DialogTitle>
          <DialogDescription>
            Each link is made out to one person, so forwarding it on won't work.
          </DialogDescription>
        </DialogHeader>

        {issued ? (
          <div className="space-y-4">
            <Alert variant="success">
              <Link2 aria-hidden="true" />
              <div className="space-y-2">
                <AlertTitle>
                  Invitation issued to{" "}
                  {issued.participant?.name ?? "the participant"}
                </AlertTitle>
                <AlertDescription>
                  Copy it now — we only show it this once.
                </AlertDescription>
              </div>
            </Alert>

            <div className="space-y-2">
              <Label htmlFor="join-url">Join link</Label>
              <div className="flex gap-2">
                <Input
                  id="join-url"
                  readOnly
                  value={issued.joinUrl}
                  className="font-mono text-xs"
                />
                <CopyButton value={issued.joinUrl} />
              </div>
              <p className="text-xs text-muted-foreground">
                Works until {formatDateTime(issued.expiresAt)}. You can take it
                back whenever you like, even mid-call.
              </p>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={reset}>
                Invite someone else
              </Button>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form
            noValidate
            className="space-y-4"
            onSubmit={event => {
              event.preventDefault();

              if (!found) {
                setSearchedEmail(email.trim().toLowerCase());
                return;
              }
              if (blocked) return;

              createInvitation.mutate(
                { participantId: found.id },
                {
                  onSuccess: invitation => {
                    setIssued(invitation);
                    notify.success(
                      "Invitation issued",
                      `${found.name} can join whenever they're ready.`,
                    );
                  },
                  onError: notify.error,
                },
              );
            }}
          >
            {createInvitation.error ? (
              <ErrorState error={createInvitation.error} />
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="participant-email">Participant email</Label>
              <div className="flex gap-2">
                <Input
                  id="participant-email"
                  type="email"
                  autoComplete="off"
                  placeholder="alice@example.com"
                  value={email}
                  onChange={event => {
                    setEmail(event.target.value);
                    setSearchedEmail("");
                  }}
                  aria-describedby="participant-hint"
                />
                <Button
                  type="button"
                  variant="outline"
                  loading={lookup.isFetching}
                  onClick={() => setSearchedEmail(email.trim().toLowerCase())}
                  disabled={!email.includes("@")}
                >
                  {lookup.isFetching ? null : <Search aria-hidden="true" />}
                  Find
                </Button>
              </div>
              <p
                id="participant-hint"
                className="text-xs text-muted-foreground"
              >
                Use the email they signed up with.
              </p>
            </div>

            {searchedEmail && !lookup.isFetching ? (
              found ? (
                blocked ? (
                  <Alert variant="warning">
                    <CircleAlert aria-hidden="true" />
                    <div>
                      <AlertTitle>{found.name}</AlertTitle>
                      <AlertDescription>
                        {isOrganizer
                          ? "That's you! Hosts don't need an invite."
                          : `Already invited (${alreadyInvited?.status.toLowerCase()}). Take that one back first if you'd like to send a new one.`}
                      </AlertDescription>
                    </div>
                  </Alert>
                ) : (
                  <Alert variant="info">
                    <UserPlus aria-hidden="true" />
                    <div>
                      <AlertTitle>{found.name}</AlertTitle>
                      <AlertDescription>{found.email}</AlertDescription>
                    </div>
                  </Alert>
                )
              ) : (
                <Alert variant="warning">
                  <CircleAlert aria-hidden="true" />
                  <AlertDescription>
                    Nobody here with that email yet — ask them to sign up first.
                  </AlertDescription>
                </Alert>
              )
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                loading={createInvitation.isPending}
                disabled={Boolean(found) && blocked}
              >
                {found ? "Issue invitation" : "Find participant"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
