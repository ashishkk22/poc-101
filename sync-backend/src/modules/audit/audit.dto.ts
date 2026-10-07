import { type AuditOutcome } from '../../generated/prisma/enums.js';

export interface AuditEventDto {
  id: string;
  action: string;
  outcome: AuditOutcome;
  actorUserId: string | null;
  invitationId: string | null;
  requestId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

/**
 * IP address and user agent are recorded for investigation but are not
 * serialized to the organizer API — a call's audit log is not a surveillance
 * feed on its participants' devices.
 */
export function toAuditEventDto(event: {
  id: string;
  action: string;
  outcome: AuditOutcome;
  actorUserId: string | null;
  invitationId: string | null;
  requestId: string | null;
  metadata: unknown;
  createdAt: Date;
}): AuditEventDto {
  return {
    id: event.id,
    action: event.action,
    outcome: event.outcome,
    actorUserId: event.actorUserId,
    invitationId: event.invitationId,
    requestId: event.requestId,
    metadata: (event.metadata as Record<string, unknown> | null) ?? null,
    createdAt: event.createdAt.toISOString(),
  };
}
