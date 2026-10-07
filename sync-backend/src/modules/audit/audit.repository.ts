import { type AuditOutcome } from '../../generated/prisma/enums.js';
import { prisma, type DbClient } from '../../infrastructure/database/prisma.js';
import { decodeCursor } from '../../shared/http/pagination.js';
import { type AuditAction } from './audit.actions.js';

export interface AppendAuditInput {
  action: AuditAction;
  outcome: AuditOutcome;
  actorUserId?: string | null;
  callId?: string | null;
  invitationId?: string | null;
  requestId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface ListAuditInput {
  callId: string;
  limit: number;
  cursor?: string;
}

export const auditRepository = {
  /** Append-only. Audit rows are never updated or deleted by application code. */
  async append(input: AppendAuditInput, db: DbClient = prisma) {
    return db.auditEvent.create({
      data: {
        action: input.action,
        outcome: input.outcome,
        actorUserId: input.actorUserId ?? null,
        callId: input.callId ?? null,
        invitationId: input.invitationId ?? null,
        requestId: input.requestId ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        metadata: (input.metadata ?? undefined) as never,
      },
    });
  },

  async listForCall({ callId, limit, cursor }: ListAuditInput, db: DbClient = prisma) {
    const decoded = cursor ? decodeCursor(cursor) : null;

    return db.auditEvent.findMany({
      where: {
        callId,
        ...(decoded
          ? {
              OR: [
                { createdAt: { lt: new Date(decoded.ts) } },
                { createdAt: new Date(decoded.ts), id: { lt: decoded.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
  },

  async countByAction(callId: string, action: AuditAction, db: DbClient = prisma) {
    return db.auditEvent.count({ where: { callId, action } });
  },
};
