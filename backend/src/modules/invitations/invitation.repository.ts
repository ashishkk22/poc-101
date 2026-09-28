import { type InvitationStatus, type Prisma } from '../../generated/prisma/client.js';
import { prisma, type DbClient } from '../../infrastructure/database/prisma.js';
import { decodeCursor } from '../../shared/http/pagination.js';

export interface CreateInvitationData {
  callId: string;
  participantId: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface ListInvitationsFilter {
  callId: string;
  status?: InvitationStatus;
  limit: number;
  cursor?: string;
}

const participantSelect = { select: { id: true, name: true, email: true } } as const;

export const invitationRepository = {
  async create(data: CreateInvitationData, db: DbClient = prisma) {
    return db.invitation.create({
      data: {
        callId: data.callId,
        participantId: data.participantId,
        tokenHash: data.tokenHash,
        expiresAt: data.expiresAt,
        status: 'ACTIVE',
      },
      include: { participant: participantSelect },
    });
  },

  async findById(id: string, db: DbClient = prisma) {
    return db.invitation.findUnique({ where: { id }, include: { participant: participantSelect } });
  },

  /** Lookup key for the join path. The raw token never touches the database. */
  async findByTokenHash(tokenHash: string, db: DbClient = prisma) {
    return db.invitation.findUnique({ where: { tokenHash } });
  },

  async findForCallAndParticipant(callId: string, participantId: string, db: DbClient = prisma) {
    return db.invitation.findUnique({
      where: { callId_participantId: { callId, participantId } },
    });
  },

  async list(filter: ListInvitationsFilter, db: DbClient = prisma) {
    const decoded = filter.cursor ? decodeCursor(filter.cursor) : null;

    const where: Prisma.InvitationWhereInput = {
      callId: filter.callId,
      ...(filter.status ? { status: filter.status } : {}),
      ...(decoded
        ? {
            OR: [
              { createdAt: { lt: new Date(decoded.ts) } },
              { createdAt: new Date(decoded.ts), id: { lt: decoded.id } },
            ],
          }
        : {}),
    };

    return db.invitation.findMany({
      where,
      include: { participant: participantSelect },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: filter.limit + 1,
    });
  },

  /**
   * Invitations issued TO one participant, newest first.
   *
   * Scoped by participantId at the database, so this can never return someone
   * else's invitation however the caller paginates.
   */
  async listForParticipant(
    filter: { participantId: string; status?: InvitationStatus; limit: number; cursor?: string },
    db: DbClient = prisma,
  ) {
    const decoded = filter.cursor ? decodeCursor(filter.cursor) : null;

    const where: Prisma.InvitationWhereInput = {
      participantId: filter.participantId,
      ...(filter.status ? { status: filter.status } : {}),
      ...(decoded
        ? {
            OR: [
              { createdAt: { lt: new Date(decoded.ts) } },
              { createdAt: new Date(decoded.ts), id: { lt: decoded.id } },
            ],
          }
        : {}),
    };

    return db.invitation.findMany({
      where,
      include: {
        participant: participantSelect,
        call: {
          select: {
            id: true,
            title: true,
            scheduledStart: true,
            scheduledEnd: true,
            timezone: true,
            status: true,
            organizer: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: filter.limit + 1,
    });
  },

  /**
   * Acquires a row-level lock on the invitation.
   *
   * This is the serialization point between join and revoke: both take this
   * lock, so once the revoking transaction commits, no concurrent join
   * transaction can still be holding a stale ACTIVE read.
   */
  async lockById(
    id: string,
    db: DbClient,
  ): Promise<{ id: string; status: InvitationStatus } | null> {
    const rows = await db.$queryRaw<Array<{ id: string; status: InvitationStatus }>>`
      SELECT "id", "status" FROM "invitations" WHERE "id" = ${id} FOR UPDATE
    `;
    return rows[0] ?? null;
  },

  async lockByTokenHash(
    tokenHash: string,
    db: DbClient,
  ): Promise<{ id: string; status: InvitationStatus } | null> {
    const rows = await db.$queryRaw<Array<{ id: string; status: InvitationStatus }>>`
      SELECT "id", "status" FROM "invitations" WHERE "tokenHash" = ${tokenHash} FOR UPDATE
    `;
    return rows[0] ?? null;
  },

  /**
   * The same row lock, reached by identity instead of by credential.
   *
   * Entry without a join link must serialize against revoke exactly as the
   * token path does, so it locks the very same row. A caller with no
   * invitation (the organizer) simply locks nothing.
   */
  async lockForCallAndParticipant(
    callId: string,
    participantId: string,
    db: DbClient,
  ): Promise<{ id: string; status: InvitationStatus } | null> {
    const rows = await db.$queryRaw<Array<{ id: string; status: InvitationStatus }>>`
      SELECT "id", "status" FROM "invitations"
      WHERE "callId" = ${callId} AND "participantId" = ${participantId}
      FOR UPDATE
    `;
    return rows[0] ?? null;
  },

  /**
   * Conditional revoke. The `status: 'ACTIVE'` predicate makes a concurrent
   * double-revoke a no-op at the database level rather than a lost update.
   */
  async revokeIfActive(
    id: string,
    revokedAt: Date,
    revokedById: string,
    db: DbClient = prisma,
  ): Promise<number> {
    const result = await db.invitation.updateMany({
      where: { id, status: 'ACTIVE' },
      data: { status: 'REVOKED', revokedAt, revokedById },
    });
    return result.count;
  },

  async markUsed(id: string, at: Date, db: DbClient = prisma) {
    return db.invitation.update({ where: { id }, data: { lastUsedAt: at } });
  },

  /** Lazily reconciles the stored status of invitations past their expiry. */
  async expireOverdue(now: Date, take: number, db: DbClient = prisma) {
    const overdue = await db.invitation.findMany({
      where: { status: 'ACTIVE', expiresAt: { lte: now } },
      select: { id: true, callId: true },
      take,
    });
    if (overdue.length === 0) return [];

    await db.invitation.updateMany({
      where: { id: { in: overdue.map((row) => row.id) }, status: 'ACTIVE' },
      data: { status: 'EXPIRED' },
    });
    return overdue;
  },
};
