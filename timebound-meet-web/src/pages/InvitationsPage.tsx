import { PageHeader } from '@/components/common/page-header';
import { MyInvitationsList } from '@/features/invitations';

/**
 * "You have been invited to these."
 *
 * The join link an organizer sends is shown once and stored only as a hash,
 * so it cannot be reissued here. It does not need to be: a signed-in invitee
 * enters by identity, and the backend reaches the same decision either way.
 */
export function InvitationsPage(): React.JSX.Element {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Your invites"
        description="Meetings people have invited you to. Turn up early if you like — we'll keep you company."
      />
      <MyInvitationsList />
    </div>
  );
}
