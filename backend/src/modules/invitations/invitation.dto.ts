import { type CallStatus, type InvitationStatus } from '../../generated/prisma/enums.js';

/**
 * Invitation DTO.
 *
 * `tokenHash` is not in this type at all — it cannot leak through a spread or
 * a forgotten field, because there is no field to forget.
 */
export interface InvitationDto {
  id: string;
  callId: string;
  participantId: string;
  participant?: { id: string; name: string; email: string };
  status: InvitationStatus;
  issuedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
}

/** Returned exactly once, at creation. The raw token is never persisted. */
export interface CreatedInvitationDto extends InvitationDto {
  joinUrl: string;
}

interface InvitationRecord {
  id: string;
  callId: string;
  participantId: string;
  status: InvitationStatus;
  issuedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  participant?: { id: string; name: string; email: string };
}

export function toInvitationDto(invitation: InvitationRecord): InvitationDto {
  return {
    id: invitation.id,
    callId: invitation.callId,
    participantId: invitation.participantId,
    ...(invitation.participant ? { participant: invitation.participant } : {}),
    status: invitation.status,
    issuedAt: invitation.issuedAt.toISOString(),
    expiresAt: invitation.expiresAt.toISOString(),
    revokedAt: invitation.revokedAt ? invitation.revokedAt.toISOString() : null,
    lastUsedAt: invitation.lastUsedAt ? invitation.lastUsedAt.toISOString() : null,
  };
}

export interface RevokedInvitationDto {
  invitationId: string;
  status: InvitationStatus;
  revokedAt: string;
}

/**
 * An invitation as its own recipient sees it.
 *
 * Carries enough of the call to render "you have an invitation to this" —
 * and the organizer's display name, because knowing who invited you is the
 * point. No token, no hash, no other participant.
 */
export interface MyInvitationDto {
  id: string;
  status: InvitationStatus;
  issuedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
  call: {
    id: string;
    title: string;
    scheduledStart: string;
    scheduledEnd: string;
    timezone: string;
    status: CallStatus;
    organizerName: string;
  };
}

export function toMyInvitationDto(invitation: {
  id: string;
  status: InvitationStatus;
  issuedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  call: {
    id: string;
    title: string;
    scheduledStart: Date;
    scheduledEnd: Date;
    timezone: string;
    status: CallStatus;
    organizer: { id: string; name: string } | null;
  };
}): MyInvitationDto {
  return {
    id: invitation.id,
    status: invitation.status,
    issuedAt: invitation.issuedAt.toISOString(),
    expiresAt: invitation.expiresAt.toISOString(),
    revokedAt: invitation.revokedAt ? invitation.revokedAt.toISOString() : null,
    lastUsedAt: invitation.lastUsedAt ? invitation.lastUsedAt.toISOString() : null,
    call: {
      id: invitation.call.id,
      title: invitation.call.title,
      scheduledStart: invitation.call.scheduledStart.toISOString(),
      scheduledEnd: invitation.call.scheduledEnd.toISOString(),
      timezone: invitation.call.timezone,
      status: invitation.call.status,
      organizerName: invitation.call.organizer?.name ?? 'Organizer',
    },
  };
}
