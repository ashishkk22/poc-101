import { type TranscriptStatus } from '../../generated/prisma/enums.js';
import { prisma, type DbClient } from '../../infrastructure/database/prisma.js';

export const transcriptRepository = {
  async findForCall(callId: string, db: DbClient = prisma) {
    return db.transcript.findUnique({ where: { callId } });
  },

  /** Unique(callId) makes a concurrent double-finalize collapse to one row. */
  async ensureForCall(callId: string, expiresAt: Date, db: DbClient = prisma) {
    return db.transcript.upsert({
      where: { callId },
      create: { callId, status: 'PENDING', expiresAt },
      update: {},
    });
  },

  /**
   * Conditional claim: only a PENDING or FAILED transcript may move to
   * PROCESSING, so two workers racing on the same job cannot both proceed.
   */
  async claimForProcessing(callId: string, db: DbClient = prisma): Promise<number> {
    const result = await db.transcript.updateMany({
      where: { callId, status: { in: ['PENDING', 'FAILED'] } },
      data: { status: 'PROCESSING', attempts: { increment: 1 } },
    });
    return result.count;
  },

  async markReady(
    callId: string,
    data: { content: string; generatedAt: Date; expiresAt: Date },
    db: DbClient = prisma,
  ) {
    return db.transcript.update({
      where: { callId },
      data: {
        status: 'READY',
        content: data.content,
        generatedAt: data.generatedAt,
        expiresAt: data.expiresAt,
        failureCode: null,
      },
    });
  },

  async markFailed(callId: string, failureCode: string, db: DbClient = prisma) {
    return db.transcript.update({
      where: { callId },
      data: { status: 'FAILED', failureCode },
    });
  },

  async resetToPending(callId: string, db: DbClient = prisma) {
    return db.transcript.updateMany({
      where: { callId, status: 'PROCESSING' },
      data: { status: 'PENDING' },
    });
  },

  /** Retention candidates. Bounded; never an unbounded scan. */
  async findExpired(now: Date, take: number, db: DbClient = prisma) {
    return db.transcript.findMany({
      where: { status: { in: ['READY', 'FAILED'] }, expiresAt: { lte: now } },
      select: { id: true, callId: true, status: true },
      orderBy: { expiresAt: 'asc' },
      take,
    });
  },

  /**
   * Conditional delete. The status predicate makes retention idempotent: a
   * second run over an already-DELETED transcript updates zero rows.
   */
  async deleteContentIfEligible(
    id: string,
    deletedAt: Date,
    db: DbClient = prisma,
  ): Promise<number> {
    const result = await db.transcript.updateMany({
      where: { id, status: { in: ['READY', 'FAILED'] } },
      data: { status: 'DELETED', content: null, deletedAt },
    });
    return result.count;
  },

  async findById(id: string, db: DbClient = prisma) {
    return db.transcript.findUnique({ where: { id } });
  },

  async statusOf(callId: string, db: DbClient = prisma): Promise<TranscriptStatus | null> {
    const row = await db.transcript.findUnique({ where: { callId }, select: { status: true } });
    return row?.status ?? null;
  },
};
