import { useInfiniteQuery } from '@tanstack/react-query';
import { ArrowRight, Clock, Globe, MailCheck, ShieldOff, UserRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { LoadMore } from '@/components/common/load-more';
import { LoadingState } from '@/components/common/loading-state';
import { invitationsApi } from '@/lib/api';
import type { MyInvitation, PaginatedResponse } from '@/lib/api/types';
import { formatRelative, formatWindow, parse } from '@/lib/date/format';
import { CallStatusBadge } from '@/features/calls';
import { InvitationStatusBadge } from './invitation-status-badge';

/** The caller's own invitations, newest first. */
export function useMyInvitations(limit = 25) {
  return useInfiniteQuery({
    queryKey: ['invitations', 'mine', { limit }] as const,
    queryFn: ({ signal, pageParam }) =>
      invitationsApi.listMine({ limit, ...(pageParam ? { cursor: pageParam } : {}) }, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage: PaginatedResponse<MyInvitation>) =>
      lastPage.nextCursor ?? undefined,
  });
}

/**
 * Whether the invitee can act on this invitation right now.
 *
 * It is a hint for the button, never a decision: the backend re-checks
 * everything when they actually try to enter, and its answer is the one that
 * counts.
 */
function joinability(invitation: MyInvitation): { canJoin: boolean; note: string } {
  const { call, status, expiresAt } = invitation;

  if (status === 'REVOKED') return { canJoin: false, note: 'The host took this one back.' };
  if (status === 'EXPIRED') return { canJoin: false, note: 'This invite has run out.' };
  if (call.status === 'CANCELLED') return { canJoin: false, note: 'The host called this one off.' };
  if (call.status === 'ENDED') return { canJoin: false, note: 'This one has wrapped up.' };

  const expiry = parse(expiresAt);
  if (expiry && expiry.getTime() <= Date.now()) {
    return { canJoin: false, note: 'This invite has run out.' };
  }

  const start = parse(call.scheduledStart);
  if (start && start.getTime() > Date.now()) {
    return { canJoin: true, note: 'You can go in early and wait.' };
  }

  return { canJoin: true, note: 'Open now — come on in.' };
}

function InvitationCard({ invitation }: { invitation: MyInvitation }): React.JSX.Element {
  const { call } = invitation;
  const { canJoin, note } = joinability(invitation);

  return (
    <Card className={canJoin ? 'border-primary/30' : undefined}>
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <CallStatusBadge status={call.status} />
            <InvitationStatusBadge status={invitation.status} />
            <Badge variant="neutral">
              <MailCheck className="size-3" aria-hidden="true" />
              You're invited
            </Badge>
          </div>

          <h3 className="truncate text-base font-medium">{call.title}</h3>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <UserRound className="size-3.5" aria-hidden="true" />
              {call.organizerName}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-3.5" aria-hidden="true" />
              {formatWindow(call.scheduledStart, call.scheduledEnd)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Globe className="size-3.5" aria-hidden="true" />
              {call.timezone}
            </span>
          </div>

          <p
            className={`flex items-center gap-1.5 text-xs ${
              canJoin ? 'text-muted-foreground' : 'text-destructive'
            }`}
          >
            {canJoin ? null : <ShieldOff className="size-3" aria-hidden="true" />}
            {note}
            {canJoin ? ` · access ends ${formatRelative(invitation.expiresAt)}` : ''}
          </p>
        </div>

        <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
          <Button asChild variant="outline" size="sm">
            <Link to={`/calls/${call.id}`}>Details</Link>
          </Button>
          {canJoin ? (
            <Button asChild size="sm">
              <Link to={`/call/${call.id}/lobby`}>
                Join
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function MyInvitationsList(): React.JSX.Element {
  const invitations = useMyInvitations();

  if (invitations.isPending) return <LoadingState label="Loading your invitations…" />;
  if (invitations.isError) {
    return <ErrorState error={invitations.error} onRetry={() => void invitations.refetch()} />;
  }

  const items = invitations.data.pages.flatMap((page) => page.items);

  if (items.length === 0) {
    return (
      <EmptyState
        icon={MailCheck}
        title="No invites just yet"
        description="When someone invites you to a meeting, it'll show up here."
      />
    );
  }

  return (
    <div className="space-y-3">
      {items.map((invitation) => (
        <InvitationCard key={invitation.id} invitation={invitation} />
      ))}
      <LoadMore
        hasMore={Boolean(invitations.hasNextPage)}
        loading={invitations.isFetchingNextPage}
        onLoadMore={() => void invitations.fetchNextPage()}
        loadedCount={items.length}
        noun="invitations"
      />
    </div>
  );
}
