import { useRef } from 'react';
import { Loader2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { BrandWordmark } from '@/components/common/brand';
import { ErrorState } from '@/components/common/error-state';
import { ThemeToggle } from '@/components/layout/theme-toggle';
import { useCurrentUser } from '@/features/auth';
import { useCall } from '@/features/calls';
import { CallLobby, newDeviceId, useCallSession, useJoinCall, useLocalMedia } from '@/features/join';

/**
 * The pre-join step for entry without a link.
 *
 * This is how an organizer reaches their own call — they are never issued an
 * invitation — and how a signed-in invitee gets in without hunting for the
 * email. The backend reaches the same decision either way.
 */
export function CallLobbyPage(): React.JSX.Element {
  const { callId = '' } = useParams<{ callId: string }>();
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const { start } = useCallSession();

  const call = useCall(callId);
  const joinCall = useJoinCall();
  const media = useLocalMedia({ enabled: call.isSuccess });
  const deviceId = useRef(newDeviceId());

  if (call.isPending) {
    return (
      <div className="flex min-h-svh items-center justify-center" role="status" aria-live="polite">
        <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">Loading the call…</span>
      </div>
    );
  }

  if (call.isError) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <ErrorState error={call.error} onRetry={() => void call.refetch()} />
      </div>
    );
  }

  const isOrganizer = user?.id === call.data.organizerId;

  return (
    <div className="flex min-h-svh flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <BrandWordmark />
        <ThemeToggle />
      </header>

      <div className="flex flex-1 items-center">
        <CallLobby
          call={call.data}
          viewerName={user?.name ?? 'You'}
          media={media}
          joining={joinCall.isPending}
          error={joinCall.error}
          roleLabel={isOrganizer ? 'You are the host' : 'You were invited'}
          onCancel={() => navigate(`/calls/${callId}`)}
          onJoin={() =>
            joinCall.mutate(
              { callId, deviceId: deviceId.current },
              {
                onSuccess: (result) => {
                  start({
                    via: 'CALL_ID',
                    token: null,
                    callId: result.call.id,
                    deviceId: deviceId.current,
                    role: result.role,
                    call: result.call,
                    attendanceSession: result.attendanceSession,
                    providerSession: result.providerSession,
                    micOn: media.micOn,
                    cameraOn: media.cameraOn,
                  });
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
