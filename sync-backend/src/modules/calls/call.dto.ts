import { type CallStatus, type InvitationStatus } from '../../generated/prisma/enums.js';

/**
 * Explicit DTOs.
 *
 * Prisma records are never returned directly, so internal columns cannot leak
 * by accident when the schema grows a field.
 */
export interface CallDto {
  id: string;
  title: string;
  scheduledStart: string;
  scheduledEnd: string;
  timezone: string;
  status: CallStatus;
  organizerId: string;
  createdAt: string;
  // When the meeting actually ended, which can be before scheduledEnd.
  endedAt: string | null;
  /**
   * The caller's own invitation to this call, as of now: null for the
   * organizer, who needs none. A hint for whether to offer "Join" — entry
   * itself is still decided by the access policy.
   */
  viewerInvitationStatus?: InvitationStatus | null;
}

export interface CallSummaryDto extends CallDto {
  invitationCount?: number;
}

interface CallRecord {
  id: string;
  title: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  timezone: string;
  status: CallStatus;
  organizerId: string;
  createdAt: Date;
  endedAt?: Date | null;
}

export function toCallDto(call: CallRecord): CallDto {
  return {
    id: call.id,
    title: call.title,
    scheduledStart: call.scheduledStart.toISOString(),
    scheduledEnd: call.scheduledEnd.toISOString(),
    timezone: call.timezone,
    status: call.status,
    organizerId: call.organizerId,
    createdAt: call.createdAt.toISOString(),
    endedAt: call.endedAt ? call.endedAt.toISOString() : null,
  };
}

/** The reduced view a participant receives when joining. */
export interface JoinCallDto {
  id: string;
  title: string;
  scheduledStart: string;
  scheduledEnd: string;
  timezone: string;
  status: CallStatus;
}

export function toJoinCallDto(call: {
  id: string;
  title: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  timezone: string;
  status: CallStatus;
}): JoinCallDto {
  return {
    id: call.id,
    title: call.title,
    scheduledStart: call.scheduledStart.toISOString(),
    scheduledEnd: call.scheduledEnd.toISOString(),
    timezone: call.timezone,
    status: call.status,
  };
}

/**
 * The stored status is reconciled lazily, so an invitation past its expiry
 * can still read ACTIVE in the row. Report what it effectively is.
 */
export function effectiveInvitationStatus(
  invitation: { status: InvitationStatus; expiresAt: Date } | null | undefined,
  now: Date,
): InvitationStatus | null {
  if (!invitation) return null;
  if (invitation.status === 'ACTIVE' && invitation.expiresAt.getTime() <= now.getTime()) {
    return 'EXPIRED';
  }
  return invitation.status;
}
