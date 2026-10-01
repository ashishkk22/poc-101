import { useState } from "react";
import {
  ArrowLeft,
  Ban,
  CircleStop,
  FileText,
  Info,
  Link2,
  ScrollText,
  ShieldCheck,
} from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { PageHeader } from "@/components/common/PageHeader";
import { useIsOrganizer } from "@/features/auth";
import { AttendanceTable } from "@/features/attendance";
import { AuditTimeline } from "@/features/audit";
import {
  CallStatusBadge,
  CallSummary,
  JoinCallButton,
  useCall,
  useCancelCall,
  useEndCall,
} from "@/features/calls";
import { InvitationsPanel } from "@/features/invitations";
import { TranscriptView } from "@/features/transcript";
import { RealtimeEvent, useCallRoom, useRealtimeEvent } from "@/lib/realtime";
import { formatWindow } from "@/lib/date/format";
import { notify } from "@/lib/toast";
import { CallStatus } from "@/lib/api/types";

/**
 * The organizer's control surface for one call.
 *
 * Every panel is a separate authorized read. A participant who reaches this
 * URL sees the call and its transcript; the backend refuses the
 * organizer-only panels, so they are not rendered for them at all.
 */
export function CallDetailsPage(): React.JSX.Element {
  const { callId = "" } = useParams<{ callId: string }>();
  const call = useCall(callId);
  const isOrganizer = useIsOrganizer(call.data?.organizerId);

  const cancelCall = useCancelCall(callId);
  const endCall = useEndCall(callId);

  const [confirming, setConfirming] = useState<"cancel" | "end" | null>(null);

  // Live updates while the organizer watches; the server decides membership.
  useCallRoom(call.data ? callId : null);
  useRealtimeEvent(RealtimeEvent.CALL_ENDED, payload => {
    if (payload.callId === callId) void call.refetch();
  });

  if (call.isPending) return <LoadingState label="Loading call…" />;
  if (call.isError)
    return (
      <ErrorState error={call.error} onRetry={() => void call.refetch()} />
    );

  const data = call.data;
  const isLive = data.status === CallStatus.LIVE;
  const isActionable = data.status === CallStatus.SCHEDULED || isLive;
  const mutating = cancelCall.isPending || endCall.isPending;

  return (
    <div className="space-y-6">
      <PageHeader
        title={data.title}
        breadcrumb={
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" aria-hidden="true" />
            Back to calls
          </Link>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <CallStatusBadge status={data.status} />
            <span>{formatWindow(data.scheduledStart, data.scheduledEnd)}</span>
            <span className="inline-flex items-center gap-1.5 text-xs">
              <ShieldCheck className="size-3.5" aria-hidden="true" />
              {isOrganizer ? "You're hosting" : "You're invited"}
            </span>
          </span>
        }
        actions={
          isOrganizer ? (
            <>
              <JoinCallButton call={data} />
              {isLive ? (
                <Button
                  variant="outline"
                  onClick={() => setConfirming("end")}
                  disabled={mutating}
                  loading={endCall.isPending}
                >
                  {endCall.isPending ? null : <CircleStop aria-hidden="true" />}
                  End call
                </Button>
              ) : null}
              {isActionable ? (
                <Button
                  variant="destructive"
                  onClick={() => setConfirming("cancel")}
                  disabled={mutating}
                  loading={cancelCall.isPending}
                >
                  {cancelCall.isPending ? null : <Ban aria-hidden="true" />}
                  Cancel call
                </Button>
              ) : null}
            </>
          ) : (
            <>
              <JoinCallButton call={data} />
              <Button asChild variant="outline">
                <Link to={`/calls/${callId}/transcript`}>
                  <FileText aria-hidden="true" />
                  View transcript
                </Link>
              </Button>
            </>
          )
        }
      />

      <CallSummary call={data} />

      {cancelCall.isError ? <ErrorState error={cancelCall.error} /> : null}
      {endCall.isError ? <ErrorState error={endCall.error} /> : null}

      {isOrganizer ? (
        <Tabs defaultValue="invitations">
          <TabsList aria-label="Call details">
            <TabsTrigger value="invitations">Invitations</TabsTrigger>
            <TabsTrigger value="attendance">Attendance</TabsTrigger>
            <TabsTrigger value="transcript">Transcript</TabsTrigger>
            <TabsTrigger value="audit">
              <ScrollText className="size-3.5" aria-hidden="true" />
              Audit
            </TabsTrigger>
          </TabsList>

          <TabsContent value="invitations">
            <InvitationsPanel call={data} />
          </TabsContent>

          <TabsContent value="attendance">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Who came</CardTitle>
                <CardDescription>
                  How long everyone stayed, across every device they used.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AttendanceTable callId={callId} live={isLive} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="transcript">
            <Card>
              <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-base">Transcript</CardTitle>
                  <CardDescription>
                    Ready shortly after the meeting wraps up.
                  </CardDescription>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link to={`/calls/${callId}/transcript`}>Open full page</Link>
                </Button>
              </CardHeader>
              <CardContent>
                <TranscriptView callId={callId} />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="audit">
            <Card>
              <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="space-y-1">
                  <CardTitle className="text-base">What happened</CardTitle>
                  <CardDescription>
                    A running record of this meeting, start to finish.
                  </CardDescription>
                </div>
                <Button asChild variant="outline" size="sm">
                  <Link to={`/calls/${callId}/audit`}>Open full page</Link>
                </Button>
              </CardHeader>
              <CardContent>
                <AuditTimeline callId={callId} />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Getting in</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert variant="info">
                <Link2 aria-hidden="true" />
                <div>
                  <AlertTitle>No need to dig out the email</AlertTitle>
                  <AlertDescription>
                    You can join straight from here while you're signed in. The
                    emailed link is just a shortcut — we only ever show it once.
                  </AlertDescription>
                </div>
              </Alert>

              <ul className="space-y-2 text-sm text-muted-foreground">
                <li className="flex gap-2">
                  <Info
                    className="mt-0.5 size-3.5 shrink-0"
                    aria-hidden="true"
                  />
                  Turn up early if you like. Once the meeting wraps up, that's
                  that.
                </li>
                <li className="flex gap-2">
                  <Info
                    className="mt-0.5 size-3.5 shrink-0"
                    aria-hidden="true"
                  />
                  The host can take your invite back at any point, even
                  mid-call.
                </li>
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Transcript</CardTitle>
              <CardDescription>
                Ready once the meeting has been written up.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TranscriptView callId={callId} />
            </CardContent>
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={confirming === "cancel"}
        onOpenChange={open => (open ? undefined : setConfirming(null))}
        title="Call this meeting off?"
        destructive
        pending={cancelCall.isPending}
        confirmLabel="Call it off"
        cancelLabel="Never mind"
        description="Everyone loses access straight away, and anyone in the call drops out. You can always set up another."
        onConfirm={() =>
          cancelCall.mutate(undefined, {
            onSuccess: () =>
              notify.success(
                "Called off",
                "Nobody can join this one any more.",
              ),
            onError: notify.error,
            onSettled: () => setConfirming(null),
          })
        }
      />

      <ConfirmDialog
        open={confirming === "end"}
        onOpenChange={open => (open ? undefined : setConfirming(null))}
        title="End this meeting for everyone?"
        pending={endCall.isPending}
        confirmLabel="End it"
        description="Everyone drops out straight away, and we'll write up the transcript afterwards."
        onConfirm={() =>
          endCall.mutate(undefined, {
            onSuccess: () =>
              notify.success(
                "All wrapped up",
                "We're writing up the transcript now.",
              ),
            onError: notify.error,
            onSettled: () => setConfirming(null),
          })
        }
      />
    </div>
  );
}
