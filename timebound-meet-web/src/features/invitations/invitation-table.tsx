import { useState } from 'react';
import { MailPlus, ShieldOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { EmptyState } from '@/components/common/empty-state';
import { ErrorState } from '@/components/common/error-state';
import { LoadingState } from '@/components/common/loading-state';
import { formatDateTime, formatRelative } from '@/lib/date/format';
import { notify } from '@/lib/toast';
import type { Invitation } from '@/lib/api/types';
import { InvitationStatusBadge } from './invitation-status-badge';
import { LoadMore } from '@/components/common/load-more';
import { useInfiniteInvitations, useRevokeInvitation } from './queries';

export function InvitationTable({ callId }: { callId: string }): React.JSX.Element {
  const invitations = useInfiniteInvitations(callId);
  const revoke = useRevokeInvitation(callId);
  const [pendingRevoke, setPendingRevoke] = useState<Invitation | null>(null);

  if (invitations.isPending) return <LoadingState label="Loading invitations…" rows={2} />;
  if (invitations.isError) {
    return <ErrorState error={invitations.error} onRetry={() => void invitations.refetch()} />;
  }

  const items = invitations.data.pages.flatMap((page) => page.items);

  if (items.length === 0) {
    return (
      <EmptyState
        icon={MailPlus}
        title="No invitations yet"
        description="Invite someone and we'll make them their own link."
      />
    );
  }

  return (
    <>
      {revoke.isError ? <ErrorState error={revoke.error} /> : null}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Participant</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Expires</TableHead>
            <TableHead>Last used</TableHead>
            <TableHead className="text-right">Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((invitation) => {
            const revoking = revoke.isPending && revoke.variables === invitation.id;

            return (
              <TableRow key={invitation.id}>
                <TableCell>
                  <div className="space-y-0.5">
                    <p className="font-medium">{invitation.participant?.name ?? 'Participant'}</p>
                    <p className="text-xs text-muted-foreground">
                      {invitation.participant?.email ?? '—'}
                    </p>
                  </div>
                </TableCell>
                <TableCell>
                  <InvitationStatusBadge status={invitation.status} />
                  {invitation.revokedAt ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatDateTime(invitation.revokedAt)}
                    </p>
                  ) : null}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  <span className="block">{formatDateTime(invitation.expiresAt)}</span>
                  <span className="text-xs">{formatRelative(invitation.expiresAt)}</span>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {formatDateTime(invitation.lastUsedAt, 'Never')}
                </TableCell>
                <TableCell className="text-right">
                  {invitation.status === 'ACTIVE' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      loading={revoking}
                      disabled={revoke.isPending}
                      onClick={() => setPendingRevoke(invitation)}
                    >
                      {revoking ? null : <ShieldOff aria-hidden="true" />}
                      Revoke
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <LoadMore
        hasMore={Boolean(invitations.hasNextPage)}
        loading={invitations.isFetchingNextPage}
        onLoadMore={() => void invitations.fetchNextPage()}
        loadedCount={items.length}
        noun="invitations"
      />

      <ConfirmDialog
        open={Boolean(pendingRevoke)}
        onOpenChange={(open) => (open ? undefined : setPendingRevoke(null))}
        title="Take back this invite?"
        destructive
        pending={revoke.isPending}
        confirmLabel="Take it back"
        description={
          <span>
            {pendingRevoke?.participant?.name ?? 'They'} won't be able to join any more, and if
            they're in the call right now, they'll drop out within seconds.
          </span>
        }
        onConfirm={() => {
          if (!pendingRevoke) return;
          const name = pendingRevoke.participant?.name ?? 'The participant';

          revoke.mutate(pendingRevoke.id, {
            onSuccess: () =>
              notify.success('Invite taken back', `${name} can't join this meeting any more.`),
            onError: notify.error,
            onSettled: () => setPendingRevoke(null),
          });
        }}
      />
    </>
  );
}
