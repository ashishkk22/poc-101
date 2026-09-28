import { prisma, type DbClient } from '../../infrastructure/database/prisma.js';

/**
 * Lines people actually said.
 *
 * Only settled ("final") utterances land here — interim guesses belong to the
 * live caption panel and are never written down. Attribution comes from the
 * speaker's session, so a stored line always names who really said it.
 */
export const captionLineRepository = {
  async append(
    data: { callId: string; speakerId: string; speakerName: string; text: string; spokenAt: Date },
    db: DbClient = prisma,
  ) {
    return db.captionLine.create({ data });
  },

  /**
   * Every line for a call, in the order it was spoken.
   *
   * Bounded: a transcript is assembled in memory, so an unbounded read would
   * be a way to exhaust the process rather than a feature.
   */
  async listForCall(callId: string, take = 5000, db: DbClient = prisma) {
    return db.captionLine.findMany({
      where: { callId },
      orderBy: [{ spokenAt: 'asc' }, { createdAt: 'asc' }],
      take,
    });
  },

  async countForCall(callId: string, db: DbClient = prisma): Promise<number> {
    return db.captionLine.count({ where: { callId } });
  },

  /** Removed with the transcript, so retention covers both. */
  async deleteForCall(callId: string, db: DbClient = prisma): Promise<number> {
    const result = await db.captionLine.deleteMany({ where: { callId } });
    return result.count;
  },
};
