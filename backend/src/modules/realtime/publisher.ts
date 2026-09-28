import { REALTIME } from '../../config/constants.js';
import { logger } from '../../infrastructure/logger/logger.js';
import { redis } from '../../infrastructure/redis/redis.js';
import { RealtimeEvent, type RealtimePayload } from './realtime.events.js';

/**
 * Publishes to Redis Pub/Sub; the Socket.IO gateway (in every API process)
 * consumes and fans out to authorized rooms.
 *
 * Publication failures are logged and swallowed: realtime is best-effort, and
 * the database state change it announces has already committed. Security does
 * not degrade when this channel is down — the next heartbeat re-checks
 * authorization and denies.
 */
export async function publish(payload: RealtimePayload): Promise<void> {
  try {
    await redis.publish(REALTIME.revocationChannel, JSON.stringify(payload));
  } catch (error) {
    logger.error({ err: error, type: payload.type }, 'realtime publish failed');
  }
}

export async function publishInvitationRevoked(input: {
  callId: string;
  invitationId: string;
  participantId: string;
  revokedAt: Date;
}): Promise<void> {
  await publish({
    type: RealtimeEvent.INVITATION_REVOKED,
    callId: input.callId,
    invitationId: input.invitationId,
    participantId: input.participantId,
    revokedAt: input.revokedAt.toISOString(),
  });
  await publish({
    type: RealtimeEvent.FORCED_DISCONNECT,
    callId: input.callId,
    participantId: input.participantId,
    reason: 'INVITE_REVOKED',
  });
}

export async function publishCallEnded(input: {
  callId: string;
  reason: 'ENDED' | 'CANCELLED';
}): Promise<void> {
  await publish({ type: RealtimeEvent.CALL_ENDED, callId: input.callId, reason: input.reason });
}

/** Announced to the call room so every viewer's roster stays current. */
export async function publishParticipantJoined(input: {
  callId: string;
  participantId: string;
  name: string;
  isOrganizer: boolean;
  joinedAt: Date;
}): Promise<void> {
  await publish({
    type: RealtimeEvent.PARTICIPANT_JOINED,
    callId: input.callId,
    participantId: input.participantId,
    name: input.name,
    isOrganizer: input.isOrganizer,
    joinedAt: input.joinedAt.toISOString(),
  });
}

export async function publishParticipantLeft(input: {
  callId: string;
  participantId: string;
  name: string;
}): Promise<void> {
  await publish({
    type: RealtimeEvent.PARTICIPANT_LEFT,
    callId: input.callId,
    participantId: input.participantId,
    name: input.name,
  });
}

export async function publishCaptionStatus(input: {
  callId: string;
  status: 'AVAILABLE' | 'DEGRADED';
}): Promise<void> {
  await publish({
    type: RealtimeEvent.CAPTION_STATUS_CHANGED,
    callId: input.callId,
    status: input.status,
  });
}
