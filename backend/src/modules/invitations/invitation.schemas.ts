import { z } from 'zod';
import { PAGINATION } from '../../config/constants.js';
import { idSchema, isoDateTimeSchema } from '../../shared/validation/common.schemas.js';

export const createInvitationSchema = z.object({
  participantId: idSchema,
  /** Optional override; clamped to the call window plus the configured grace. */
  expiresAt: isoDateTimeSchema.optional(),
});

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

export const listInvitationsQuerySchema = z.object({
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(PAGINATION.maxLimit).default(PAGINATION.defaultLimit),
  status: z.enum(['ACTIVE', 'REVOKED', 'EXPIRED']).optional(),
});

export type ListInvitationsQuery = z.infer<typeof listInvitationsQuerySchema>;
