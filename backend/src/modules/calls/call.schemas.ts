import { z } from 'zod';
import { PAGINATION } from '../../config/constants.js';
import { isoDateTimeSchema, timezoneSchema } from '../../shared/validation/common.schemas.js';

export const createCallSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(200),
    scheduledStart: isoDateTimeSchema,
    scheduledEnd: isoDateTimeSchema,
    timezone: timezoneSchema,
  })
  .refine(
    (value) => new Date(value.scheduledEnd).getTime() > new Date(value.scheduledStart).getTime(),
    { message: 'scheduledEnd must be after scheduledStart', path: ['scheduledEnd'] },
  );

export type CreateCallInput = z.infer<typeof createCallSchema>;

export const listCallsQuerySchema = z.object({
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(PAGINATION.maxLimit).default(PAGINATION.defaultLimit),
  status: z.enum(['DRAFT', 'SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED']).optional(),
  startAfter: isoDateTimeSchema.optional(),
  startBefore: isoDateTimeSchema.optional(),
  role: z.enum(['organizer', 'participant', 'any']).default('organizer'),
});

export type ListCallsQuery = z.infer<typeof listCallsQuerySchema>;
