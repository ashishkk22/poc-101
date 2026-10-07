import { z } from 'zod';
import { deviceIdSchema, idSchema } from '../../shared/validation/common.schemas.js';

export const joinBodySchema = z
  .object({
    /** Distinguishes concurrent device connections for one participant. */
    deviceId: deviceIdSchema.optional(),
  })
  .default({});

export const heartbeatBodySchema = z
  .object({
    sessionId: idSchema.optional(),
    deviceId: deviceIdSchema.optional(),
  })
  .default({});

export const leaveBodySchema = z
  .object({
    sessionId: idSchema.optional(),
    deviceId: deviceIdSchema.optional(),
    reason: z.enum(['USER_LEFT', 'TAB_CLOSED', 'NETWORK_LOST']).default('USER_LEFT'),
  })
  .default({ reason: 'USER_LEFT' });

export type JoinBody = z.infer<typeof joinBodySchema>;
export type HeartbeatBody = z.infer<typeof heartbeatBodySchema>;
export type LeaveBody = z.infer<typeof leaveBodySchema>;

/**
 * Bodies for the call-id door.
 *
 * Identical in shape to the link bodies; named separately so the two routes
 * can diverge later without one silently loosening the other.
 */
export const callJoinBodySchema = joinBodySchema;
export const callHeartbeatBodySchema = heartbeatBodySchema;
export const callLeaveBodySchema = leaveBodySchema;
