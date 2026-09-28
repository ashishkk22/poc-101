import { z } from 'zod';
import { isValidTimezone } from '../time/window.js';

/** Database identifiers are opaque to clients; only shape is validated. */
export const idSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, 'Invalid identifier');

export const rawTokenSchema = z
  .string()
  .min(32)
  .max(256)
  .regex(/^[A-Za-z0-9_-]+$/, 'Invalid token');

export const isoDateTimeSchema = z.iso.datetime({ offset: true }).or(z.iso.datetime());

export const timezoneSchema = z
  .string()
  .min(1)
  .max(64)
  .refine(isValidTimezone, { message: 'Unknown IANA timezone' });

export const deviceIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_.-]+$/, 'Invalid device identifier');

export const callIdParamsSchema = z.object({ callId: idSchema });
export const invitationIdParamsSchema = z.object({ invitationId: idSchema });
export const tokenParamsSchema = z.object({ token: rawTokenSchema });
