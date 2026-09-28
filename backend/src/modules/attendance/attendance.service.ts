import { type AttendanceStatus } from '../../generated/prisma/enums.js';
import { prisma, type DbClient } from '../../infrastructure/database/prisma.js';
import { buildPage } from '../../shared/http/pagination.js';
import { totalUnionSeconds, type Interval } from '../../shared/time/interval-union.js';
import {
  authorizeAttendanceRead,
  authorizeRealtimeCallRoom,
  unwrap,
} from '../access/index.js';
import { AppError, type ErrorCode } from '../../shared/errors/index.js';
import { systemClock } from '../../shared/time/clock.js';
import { toAttendanceDto, type AttendanceDto } from './attendance.dto.js';
import { attendanceRepository } from './attendance.repository.js';

/**
 * Attendance totals are RECOMPUTED from the full session list on every change
 * rather than incremented. Recomputation is inherently idempotent: a retried
 * leave, a duplicate request or a replayed job all converge on the same
 * number, and overlapping device sessions are merged rather than summed.
 */
export async function recomputeAttendanceTotals(
  attendanceId: string,
  now: Date,
  db: DbClient = prisma,
): Promise<{ totalConnectedSeconds: number; status: AttendanceStatus }> {
  const sessions = await attendanceRepository.allSessions(attendanceId, db);

  if (sessions.length === 0) {
    await attendanceRepository.updateTotals(
      attendanceId,
      { totalConnectedSeconds: 0, status: 'NOT_JOINED', firstJoinedAt: null, lastLeftAt: null },
      db,
    );
    return { totalConnectedSeconds: 0, status: 'NOT_JOINED' };
  }

  // An open session counts up to "now"; a closed one to its recorded end.
  const intervals: Interval[] = sessions.map((session) => ({
    start: session.joinedAt,
    end: session.leftAt ?? now,
  }));

  const totalConnectedSeconds = totalUnionSeconds(intervals);
  const hasConnected = sessions.some((session) => session.status === 'CONNECTED');

  const firstJoinedAt = sessions.reduce<Date>(
    (earliest, session) => (session.joinedAt < earliest ? session.joinedAt : earliest),
    sessions[0]!.joinedAt,
  );

  const closedEnds = sessions
    .map((session) => session.leftAt)
    .filter((value): value is Date => value !== null);
  const lastLeftAt = hasConnected
    ? null
    : closedEnds.length > 0
      ? new Date(Math.max(...closedEnds.map((date) => date.getTime())))
      : null;

  const status: AttendanceStatus = hasConnected ? 'ACTIVE' : 'COMPLETED';

  await attendanceRepository.updateTotals(
    attendanceId,
    { firstJoinedAt, lastLeftAt, totalConnectedSeconds, status },
    db,
  );

  return { totalConnectedSeconds, status };
}

/** Who is in the room, as everyone in the room may see it. */
export interface CallParticipantDto {
  id: string;
  name: string;
  isOrganizer: boolean;
  joinedAt: string;
  /** Concurrent devices, so two tiles for one person are explicable. */
  connections: number;
}

export const attendanceService = {
  /**
   * The live roster.
   *
   * Readable by anyone the realtime policy would admit to this call's room —
   * the organizer, or a participant whose invitation is still live. It carries
   * display names and arrival times only: no email, no device identifier, no
   * session internals. Seeing who is in a meeting with you is ordinary;
   * seeing what they are connected from is not.
   */
  async liveRoster(viewerUserId: string, callId: string): Promise<CallParticipantDto[]> {
    const decision = await authorizeRealtimeCallRoom({
      userId: viewerUserId,
      callId,
      now: systemClock.now(),
    });
    if (!decision.allowed) throw new AppError(decision.code as ErrorCode);

    const call = await prisma.call.findUnique({
      where: { id: callId },
      select: { organizerId: true },
    });

    const rows = await attendanceRepository.listConnected(callId);

    return rows.map((row) => ({
      id: row.participantId,
      name: row.participant?.name ?? 'Participant',
      isOrganizer: row.participantId === call?.organizerId,
      joinedAt: (row.sessions[0]?.joinedAt ?? row.firstJoinedAt ?? new Date()).toISOString(),
      connections: row.sessions.length,
    }));
  },

  /** Organizer-only roster. A participant never sees other participants' attendance. */
  async listForCall(
    actorUserId: string,
    callId: string,
    query: { limit: number; cursor?: string },
  ): Promise<{ items: AttendanceDto[]; nextCursor: string | null }> {
    unwrap(await authorizeAttendanceRead({ userId: actorUserId, callId }));

    const rows = await attendanceRepository.listForCall({
      callId,
      limit: query.limit,
      cursor: query.cursor,
    });

    const page = buildPage(rows, query.limit, (row) => row.createdAt);
    return { items: page.items.map(toAttendanceDto), nextCursor: page.nextCursor };
  },

  /**
   * Reaps sessions whose heartbeats stopped, so a participant who closed a
   * laptop lid does not appear connected forever.
   */
  async reapStaleSessions(now: Date, timeoutSeconds: number, batchSize = 200): Promise<number> {
    const threshold = new Date(now.getTime() - timeoutSeconds * 1000);
    const stale = await attendanceRepository.findStaleSessions(threshold, batchSize);

    for (const session of stale) {
      const closed = await attendanceRepository.closeSessionIfConnected(session.id, {
        leftAt: threshold,
        leftReason: 'HEARTBEAT_TIMEOUT',
        status: 'DISCONNECTED',
      });
      if (closed > 0) await recomputeAttendanceTotals(session.attendanceId, now);
    }

    return stale.length;
  },
};
