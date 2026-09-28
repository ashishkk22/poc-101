import type { AuditOutcome } from '@/lib/api/types';

/**
 * Human labels for the backend's audit taxonomy.
 *
 * Unknown actions degrade to a readable form rather than being hidden — a new
 * backend action should still show up in an organizer's timeline.
 */
const LABELS: Record<string, string> = {
  CALL_CREATED: 'Call created',
  CALL_CANCELLED: 'Call cancelled',
  CALL_ENDED: 'Call ended',
  CALL_ACCESS_DENIED: 'Call access denied',
  INVITATION_CREATED: 'Invitation created',
  INVITATION_REVOKED: 'Invitation revoked',
  INVITATION_EXPIRED: 'Invitation expired',
  INVITATION_ACCESS_DENIED: 'Invitation access denied',
  JOIN_AUTHORIZED: 'Join authorized',
  JOIN_DENIED: 'Join denied',
  HEARTBEAT_DENIED: 'Heartbeat denied',
  ATTENDANCE_JOINED: 'Participant joined',
  ATTENDANCE_LEFT: 'Participant left',
  ATTENDANCE_ACCESS_DENIED: 'Attendance access denied',
  FORCED_DISCONNECT: 'Forced disconnect',
  TRANSCRIPT_ACCESS_GRANTED: 'Transcript accessed',
  TRANSCRIPT_ACCESS_DENIED: 'Transcript access denied',
  TRANSCRIPT_READY: 'Transcript ready',
  TRANSCRIPT_FAILED: 'Transcript failed',
  TRANSCRIPT_DELETED: 'Transcript deleted',
  AUDIT_ACCESS_DENIED: 'Audit access denied',
  PROVIDER_FAILURE: 'Provider failure',
  CAPTION_FAILURE: 'Captions failed',
  RATE_LIMITED: 'Rate limited',
};

export function auditActionLabel(action: string): string {
  return (
    LABELS[action] ??
    action
      .toLowerCase()
      .split('_')
      .map((word, index) => (index === 0 ? word.charAt(0).toUpperCase() + word.slice(1) : word))
      .join(' ')
  );
}

export const OUTCOME_VARIANT: Record<AuditOutcome, 'success' | 'destructive' | 'warning'> = {
  SUCCESS: 'success',
  DENIED: 'destructive',
  FAILURE: 'warning',
};

/**
 * Metadata keys safe to surface. Fingerprints, provider identifiers and any
 * other internal detail stay out of the organizer's view.
 */
const VISIBLE_KEYS = new Set([
  'code',
  'reason',
  'deviceId',
  'timezone',
  'scheduledStart',
  'scheduledEnd',
  'totalConnectedSeconds',
  'operation',
  'status',
]);

export function visibleMetadata(
  metadata: Record<string, unknown> | null,
): Array<{ key: string; value: string }> {
  if (!metadata) return [];

  return Object.entries(metadata)
    .filter(([key, value]) => VISIBLE_KEYS.has(key) && value !== null && value !== undefined)
    .map(([key, value]) => ({ key, value: String(value) }));
}
