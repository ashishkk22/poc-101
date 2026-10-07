import { type CallStatus, type Prisma } from '../../generated/prisma/client.js';
import { prisma, type DbClient } from '../../infrastructure/database/prisma.js';
import { decodeCursor } from '../../shared/http/pagination.js';

export interface CreateCallData {
  organizerId: string;
  title: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  timezone: string;
  providerCallId?: string | null;
}

export interface ListCallsFilter {
  userId: string;
  role: 'organizer' | 'participant' | 'any';
  status?: CallStatus;
  startAfter?: Date;
  startBefore?: Date;
  limit: number;
  cursor?: string;
}

export const callRepository = {
  async create(data: CreateCallData, db: DbClient = prisma) {
    return db.call.create({
      data: {
        organizerId: data.organizerId,
        title: data.title,
        scheduledStart: data.scheduledStart,
        scheduledEnd: data.scheduledEnd,
        timezone: data.timezone,
        status: 'SCHEDULED',
        providerCallId: data.providerCallId ?? null,
      },
    });
  },

  async findById(id: string, db: DbClient = prisma) {
    return db.call.findUnique({ where: { id } });
  },

  /**
   * Keyset pagination over (scheduledStart DESC, id DESC), matching the
   * `organizerId + scheduledStart DESC` index. Fetches limit + 1 rows so the
   * caller can derive `nextCursor` without a second count query.
   */
  async list(filter: ListCallsFilter, db: DbClient = prisma) {
    const decoded = filter.cursor ? decodeCursor(filter.cursor) : null;

    const relationClause: Prisma.CallWhereInput =
      filter.role === 'organizer'
        ? { organizerId: filter.userId }
        : filter.role === 'participant'
          ? { invitations: { some: { participantId: filter.userId } } }
          : {
              OR: [
                { organizerId: filter.userId },
                { invitations: { some: { participantId: filter.userId } } },
              ],
            };

    const where: Prisma.CallWhereInput = {
      ...relationClause,
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.startAfter || filter.startBefore
        ? {
            scheduledStart: {
              ...(filter.startAfter ? { gte: filter.startAfter } : {}),
              ...(filter.startBefore ? { lte: filter.startBefore } : {}),
            },
          }
        : {}),
      ...(decoded
        ? {
            OR: [
              { scheduledStart: { lt: new Date(decoded.ts) } },
              { scheduledStart: new Date(decoded.ts), id: { lt: decoded.id } },
            ],
          }
        : {}),
    };

    return db.call.findMany({
      where,
      orderBy: [{ scheduledStart: 'desc' }, { id: 'desc' }],
      take: filter.limit + 1,
    });
  },

  async updateStatus(
    id: string,
    status: CallStatus,
    extra: { cancelledAt?: Date; endedAt?: Date } = {},
    db: DbClient = prisma,
  ) {
    return db.call.update({ where: { id }, data: { status, ...extra } });
  },

  async setProviderCallId(id: string, providerCallId: string, db: DbClient = prisma) {
    return db.call.update({ where: { id }, data: { providerCallId } });
  },

  /**
   * Calls whose stored status has fallen behind the clock. Bounded by `take`
   * so the lifecycle sweep can never pull an unbounded result set into memory.
   */
  async findLifecycleCandidates(now: Date, take: number, db: DbClient = prisma) {
    return db.call.findMany({
      where: {
        OR: [
          { status: 'SCHEDULED', scheduledStart: { lte: now } },
          { status: 'LIVE', scheduledEnd: { lte: now } },
        ],
      },
      orderBy: { scheduledStart: 'asc' },
      take,
    });
  },
};
