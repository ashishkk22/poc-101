import { useRef } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { BrandWordmark } from "@/components/common/Brand";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { useCurrentUser } from "@/features/auth";
import {
  CallLobby,
  newDeviceId,
  useAuthorizeJoin,
  useCallSession,
  useLocalMedia,
  useResolveLink,
} from "@/features/join";
import { ErrorCode, toDisplayError } from "@/lib/errors";

/** Denials no amount of retrying will change. */
const FINAL_DENIALS = new Set<string>([
  ErrorCode.INVITE_REVOKED,
  ErrorCode.INVITE_EXPIRED,
  ErrorCode.INVITE_NOT_FOUND,
  ErrorCode.JOIN_WINDOW_CLOSED,
  ErrorCode.CALL_CANCELLED,
]);

/**
 * The join gate, reached from an invitation link.
 *
 * The frontend makes no judgement about the token — not its shape, not its
 * expiry, not who it belongs to. It asks the backend to resolve the link,
 * which authorizes without any side effect, shows the lobby, and enters only
 * when the person says so.
 */
export function JoinPage(): React.JSX.Element {
  const { token = "" } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const { start } = useCallSession();

  const resolved = useResolveLink(token || null);
  const authorize = useAuthorizeJoin();
  const media = useLocalMedia({ enabled: resolved.isSuccess });
  const deviceId = useRef(newDeviceId());

  const failure = resolved.error ?? authorize.error;
  const display = failure ? toDisplayError(failure) : null;

  const isWrongAccount = display?.code === ErrorCode.PARTICIPANT_MISMATCH;
  const isRetryable =
    display !== null && !isWrongAccount && !FINAL_DENIALS.has(display.code);

  if (resolved.isSuccess && !display) {
    return (
      <div className="flex min-h-svh flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <BrandWordmark />
          <ThemeToggle />
        </header>

        <div className="flex flex-1 items-center">
          <CallLobby
            call={resolved.data.call}
            viewerName={user?.name ?? "You"}
            media={media}
            joining={authorize.isPending}
            error={authorize.error}
            roleLabel="You were invited"
            onCancel={() => navigate("/dashboard")}
            onJoin={() =>
              authorize.mutate(
                { token, deviceId: deviceId.current },
                {
                  onSuccess: result => {
                    start({
                      via: "INVITE_LINK",
                      token,
                      callId: result.call.id,
                      deviceId: deviceId.current,
                      role: result.role,
                      call: result.call,
                      attendanceSession: result.attendanceSession,
                      providerSession: result.providerSession,
                      micOn: media.micOn,
                      cameraOn: media.cameraOn,
                    });
                    // `replace` drops the raw token from the address bar.
                    navigate(`/call/${result.call.id}`, { replace: true });
                  },
                },
              )
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-svh flex-col px-4 py-6">
      <div className="mx-auto flex w-full max-w-md items-center justify-between gap-3">
        <BrandWordmark />
        <ThemeToggle />
      </div>

      <div className="flex flex-1 items-center justify-center py-8">
        <Card className="w-full max-w-md">
          {display ? (
            <>
              <CardHeader className="items-start">
                <div className="flex size-10 items-center justify-center rounded-lg bg-destructive/10">
                  <ShieldAlert
                    className="size-5 text-destructive"
                    aria-hidden="true"
                  />
                </div>
                <CardTitle>{display.title}</CardTitle>
                <CardDescription>{display.description}</CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                {isWrongAccount && user ? (
                  <p className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                    You're signed in as{" "}
                    <span className="font-medium text-foreground">
                      {user.email}
                    </span>
                    . Switch to the account it was sent to, then open the link
                    again.
                  </p>
                ) : null}

                {display.requestId ? (
                  <p className="text-xs text-muted-foreground">
                    Reference:{" "}
                    <code className="font-mono">{display.requestId}</code>
                  </p>
                ) : null}

                <div className="flex flex-col gap-2 sm:flex-row">
                  {isRetryable ? (
                    <Button
                      variant="outline"
                      onClick={() => {
                        authorize.reset();
                        void resolved.refetch();
                      }}
                      loading={resolved.isFetching}
                    >
                      Try again
                    </Button>
                  ) : null}

                  {isWrongAccount ? (
                    <Button asChild variant="outline">
                      <Link to="/login" state={{ from: `/join/${token}` }}>
                        Switch account
                      </Link>
                    </Button>
                  ) : null}

                  <Button asChild>
                    <Link to="/dashboard">Go to my calls</Link>
                  </Button>
                </div>
              </CardContent>
            </>
          ) : (
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                <Loader2
                  className="size-5 animate-spin text-primary"
                  aria-hidden="true"
                />
              </div>
              <div className="space-y-1" role="status" aria-live="polite">
                <p className="font-medium">One moment…</p>
                <p className="text-sm text-muted-foreground">
                  Just looking up your invite.
                </p>
              </div>
            </CardContent>
          )}
        </Card>
      </div>

      <p className="mx-auto max-w-md text-center text-xs text-muted-foreground">
        Invites are personal — this one was made just for you.
      </p>
    </div>
  );
}
