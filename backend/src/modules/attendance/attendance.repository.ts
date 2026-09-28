import {
  type AttendanceSessionStatus,
  type AttendanceStatus,
} from '../../generated/prisma/enums.js';
import { prisma, type DbClient } from '../../infrastructure/database/prisma.js';
import { decodeCursor } from '../../shared/http/pagination.js';

const participantSelect = { select: { id: true, name: true, email: true } } as const;

export const attendanceRepository = {
  /**
   * One logical attendance row per (call, participant), enforced by a unique
   * constraint. `upsert` makes concurrent first-joins from two devices
   * converge on the same row instead of racing to insert duplicates.
   */
  async findOrCreate(callId: string, participantId: string, db: DbClient = prisma) {
    return db.attendance.upsert({
      where: { callId_participantId: { callId, participantId } },
      create: { callId, participantId, status: 'NOT_JOINED' },
      update: {},
    });
  },

  async findForParticipant(callId: string, participantId: string, db: DbClient = prisma) {
    return db.attendance.findUnique({
      where: { callId_participantId: { callId, participantId } },
      include: { sessions: { orderBy: { joinedAt: 'asc' } } },
    });
  },

  async findById(id: string, db: DbClient = prisma) {
    return db.attendance.findUnique({ where: { id }, include: { sessions: true } });
  },

  /**
   * Everyone with at least one live session on this call.
   *
   * Bounded by `take` like every other read here: a roster is small, but
   * "small in practice" is not a guarantee worth relying on.
   */
  async listConnected(callId: string, take = 100, db: DbClient = prisma) {
    return db.attendance.findMany({
      where: { callId, sessions: { some: { status: 'CONNECTED' } } },
      include: {
        participant: participantSelect,
        sessions: { where: { status: 'CONNECTED' }, orderBy: { joinedAt: 'asc' } },
      },
      orderBy: [{ firstJoinedAt: 'asc' }, { id: 'asc' }],
      take,
    });
  },

  async listForCall(
    filter: { callId: string; limit: number; cursor?: string },
    db: DbClient = prisma,
  ) {
    const decoded = filter.cursor ? decodeCursor(filter.cursor) : null;

    return db.attendance.findMany({
      where: {
        callId: filter.callId,
        ...(decoded
          ? {
              OR: [
                { createdAt: { lt: new Date(decoded.ts) } },
                { createdAt: new Date(decoded.ts), id: { lt: decoded.id } },
              ],
            }
          : {}),
      },
      include: {
        participant: participantSelect,
        sessions: { orderBy: { joinedAt: 'asc' } },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: filter.limit + 1,
    });
  },

  async createSession(
    data: {
      attendanceId: string;
      deviceId: string;
      providerSessionId: string | null;
      joinedAt: Date;
    },
    db: DbClient = prisma,
  ) {
    return db.attendanceSession.create({
      data: {
        attendanceId: data.attendanceId,
        deviceId: data.deviceId,
        providerSessionId: data.providerSessionId,
        joinedAt: data.joinedAt,
        lastHeartbeatAt: data.joinedAt,
        status: 'CONNECTED',
      },
    });
  },

  async findSessionById(id: string, db: DbClient = prisma) {
    return db.attendanceSession.findUnique({ where: { id } });
  },

  async findConnectedSessions(attendanceId: string, db: DbClient = prisma) {
    return db.attendanceSession.findMany({
      where: { attendanceId, status: 'CONNECTED' },
      orderBy: { joinedAt: 'desc' },
    });
  },

  async findSessionForDevice(attendanceId: string, deviceId: string, db: DbClient = prisma) {
    return db.attendanceSession.findFirst({
      where: { attendanceId, deviceId, status: 'CONNECTED' },
      orderBy: { joinedAt: 'desc' },
    });
  },

  async touchSession(id: string, at: Date, db: DbClient = prisma) {
    return db.attendanceSession.update({ where: { id }, data: { lastHeartbeatAt: at } });
  },

  /**
   * Conditional close. The `status: 'CONNECTED'` predicate is what makes
   * repeated leave requests idempotent: the second one updates zero rows.
   */
  async closeSessionIfConnected(
    id: string,
    data: { leftAt: Date; leftReason: string; status: AttendanceSessionStatus },
    db: DbClient = prisma,
  ): Promise<number> {
    const result = await db.attendanceSession.updateMany({
      where: { id, status: 'CONNECTED' },
      data: { leftAt: data.leftAt, leftReason: data.leftReason, status: data.status },
    });
    return result.count;
  },

  async allSessions(attendanceId: string, db: DbClient = prisma) {
    return db.attendanceSession.findMany({
      where: { attendanceId },
      orderBy: { joinedAt: 'asc' },
    });
  },

  async updateTotals(
    id: string,
    data: {
      firstJoinedAt?: Date | null;
      lastLeftAt?: Date | null;
      totalConnectedSeconds: number;
      status: AttendanceStatus;
    },
    db: DbClient = prisma,
  ) {
    return db.attendance.update({ where: { id }, data });
  },

  /** Sessions whose heartbeat has lapsed; reaped as DISCONNECTED. */
  async findStaleSessions(threshold: Date, take: number, db: DbClient = prisma) {
    return db.attendanceSession.findMany({
      where: {
        status: 'CONNECTED',
        OR: [
          { lastHeartbeatAt: { lt: threshold } },
          { lastHeartbeatAt: null, joinedAt: { lt: threshold } },
        ],
      },
      select: { id: true, attendanceId: true },
      take,
    });
  },
};
