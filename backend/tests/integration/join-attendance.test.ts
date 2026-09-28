import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma, resetDatabase } from '../fixtures/db.js';
import { asUser } from '../fixtures/test-app.js';
import { auditActionsFor, createJoinableScenario } from '../fixtures/factories.js';
import { attendanceRepository } from '../../src/modules/attendance/attendance.repository.js';
import { recomputeAttendanceTotals } from '../../src/modules/attendance/attendance.service.js';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('join', () => {
  it('admits the invited participant and records attendance', async () => {
    const { participant, call, rawToken } = await createJoinableScenario();

    const response = await asUser(participant.cookie)
      .post(`/api/v1/join/${rawToken}/authorize`)
      .send({ deviceId: 'laptop' });

    expect(response.status).toBe(200);
    expect(response.body.data.call.id).toBe(call.id);
    expect(response.body.data.providerSession.id).toMatch(/^psess_/);
    expect(response.body.data.attendanceSession.status).toBe('CONNECTED');

    const attendance = await prisma.attendance.findUniqueOrThrow({
      where: { callId_participantId: { callId: call.id, participantId: participant.id } },
    });
    expect(attendance.status).toBe('ACTIVE');
    expect(attendance.firstJoinedAt).not.toBeNull();

    expect(await auditActionsFor(call.id)).toEqual(
      expect.arrayContaining(['JOIN_AUTHORIZED', 'ATTENDANCE_JOINED']),
    );
  });

  it('returns nothing sensitive in the join response', async () => {
    const { participant, rawToken, invitation } = await createJoinableScenario();
    const stored = await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } });

    const response = await asUser(participant.cookie)
      .post(`/api/v1/join/${rawToken}/authorize`)
      .send({});

    const body = JSON.stringify(response.body);
    expect(body).not.toContain(rawToken);
    expect(body).not.toContain(stored.tokenHash);
    expect(body).not.toContain('organizerId');
  });

  it('records lastUsedAt on the invitation', async () => {
    const { participant, rawToken, invitation } = await createJoinableScenario();

    await asUser(participant.cookie).post(`/api/v1/join/${rawToken}/authorize`).send({});

    const stored = await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } });
    expect(stored.lastUsedAt).not.toBeNull();
  });
});

describe('multi-device attendance', () => {
  it('keeps one attendance record with one session per device', async () => {
    const { participant, call, rawToken } = await createJoinableScenario();

    const laptop = await asUser(participant.cookie)
      .post(`/api/v1/join/${rawToken}/authorize`)
      .send({ deviceId: 'laptop' });
    const phone = await asUser(participant.cookie)
      .post(`/api/v1/join/${rawToken}/authorize`)
      .send({ deviceId: 'phone' });

    expect(laptop.status).toBe(200);
    expect(phone.status).toBe(200);
    expect(laptop.body.data.attendanceSession.id).not.toBe(phone.body.data.attendanceSession.id);

    expect(await prisma.attendance.count({ where: { callId: call.id } })).toBe(1);
    expect(await prisma.attendanceSession.count()).toBe(2);
  });

  it('counts overlapping device time once, not twice', async () => {
    const { participant, call, rawToken } = await createJoinableScenario();

    await asUser(participant.cookie)
      .post(`/api/v1/join/${rawToken}/authorize`)
      .send({ deviceId: 'laptop' });

    const attendance = await prisma.attendance.findUniqueOrThrow({
      where: { callId_participantId: { callId: call.id, participantId: participant.id } },
    });

    // Rewrite the session timings to the documented example:
    //   laptop 10:00-10:40, phone 10:20-10:50  ->  50 minutes total.
    const base = new Date('2026-09-22T10:00:00.000Z');
    const sessions = await attendanceRepository.allSessions(attendance.id);

    await prisma.attendanceSession.update({
      where: { id: sessions[0]!.id },
      data: {
        joinedAt: base,
        leftAt: new Date(base.getTime() + 40 * 60_000),
        status: 'LEFT',
      },
    });
    await prisma.attendanceSession.create({
      data: {
        attendanceId: attendance.id,
        deviceId: 'phone',
        joinedAt: new Date(base.getTime() + 20 * 60_000),
        leftAt: new Date(base.getTime() + 50 * 60_000),
        status: 'LEFT',
      },
    });

    const totals = await recomputeAttendanceTotals(
      attendance.id,
      new Date(base.getTime() + 60 * 60_000),
    );

    expect(totals.totalConnectedSeconds).toBe(50 * 60);
    expect(totals.status).toBe('COMPLETED');
  });
});

describe('heartbeat', () => {
  it('keeps the session alive and revalidates authorization', async () => {
    const { participant, rawToken } = await createJoinableScenario();

    const joined = await asUser(participant.cookie)
      .post(`/api/v1/join/${rawToken}/authorize`)
      .send({ deviceId: 'laptop' });
    const sessionId = joined.body.data.attendanceSession.id;

    const before = await prisma.attendanceSession.findUniqueOrThrow({ where: { id: sessionId } });

    const heartbeat = await asUser(participant.cookie)
      .post(`/api/v1/join/${rawToken}/heartbeat`)
      .send({ sessionId });

    expect(heartbeat.status).toBe(200);
    expect(heartbeat.body.data.status).toBe('ACTIVE');
    expect(heartbeat.body.data.serverTime).toBeTruthy();

    const after = await prisma.attendanceSession.findUniqueOrThrow({ where: { id: sessionId } });
    expect(after.lastHeartbeatAt!.getTime()).toBeGreaterThanOrEqual(
      before.lastHeartbeatAt!.getTime(),
    );
  });

  it("refuses to address another participant's session id", async () => {
    const first = await createJoinableScenario();
    const second = await createJoinableScenario();

    const otherJoin = await asUser(second.participant.cookie)
      .post(`/api/v1/join/${second.rawToken}/authorize`)
      .send({});
    const otherSessionId = otherJoin.body.data.attendanceSession.id;

    await asUser(first.participant.cookie)
      .post(`/api/v1/join/${first.rawToken}/authorize`)
      .send({});

    const response = await asUser(first.participant.cookie)
      .post(`/api/v1/join/${first.rawToken}/heartbeat`)
      .send({ sessionId: otherSessionId });

    expect(response.status).toBe(409);
  });
});

describe('leave', () => {
  it('closes the session and records duration', async () => {
    const { participant, call, rawToken } = await createJoinableScenario();

    const joined = await asUser(participant.cookie)
      .post(`/api/v1/join/${rawToken}/authorize`)
      .send({ deviceId: 'laptop' });
    const sessionId = joined.body.data.attendanceSession.id;

    const left = await asUser(participant.cookie)
      .post(`/api/v1/join/${rawToken}/leave`)
      .send({ sessionId, reason: 'USER_LEFT' });

    expect(left.status).toBe(200);
    expect(left.body.data.alreadyLeft).toBe(false);

    const session = await prisma.attendanceSession.findUniqueOrThrow({ where: { id: sessionId } });
    expect(session.status).toBe('LEFT');
    expect(session.leftReason).toBe('USER_LEFT');

    const attendance = await prisma.attendance.findUniqueOrThrow({
      where: { callId_participantId: { callId: call.id, participantId: participant.id } },
    });
    expect(attendance.status).toBe('COMPLETED');
    expect(await auditActionsFor(call.id)).toContain('ATTENDANCE_LEFT');
  });

  it('is idempotent — a repeated leave neither double-counts nor reopens', async () => {
    const { participant, call, rawToken } = await createJoinableScenario();

    const joined = await asUser(participant.cookie)
      .post(`/api/v1/join/${rawToken}/authorize`)
      .send({ deviceId: 'laptop' });
    const sessionId = joined.body.data.attendanceSession.id;

    const first = await asUser(participant.cookie)
      .post(`/api/v1/join/${rawToken}/leave`)
      .send({ sessionId });
    const totalAfterFirst = first.body.data.totalConnectedSeconds;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const repeat = await asUser(participant.cookie)
        .post(`/api/v1/join/${rawToken}/leave`)
        .send({ sessionId });
      expect(repeat.status).toBe(200);
      expect(repeat.body.data.alreadyLeft).toBe(true);
      expect(repeat.body.data.totalConnectedSeconds).toBe(totalAfterFirst);
    }

    expect(
      await prisma.attendanceSession.count({ where: { attendance: { callId: call.id } } }),
    ).toBe(1);

    const leaveEvents = await prisma.auditEvent.count({
      where: { callId: call.id, action: 'ATTENDANCE_LEFT' },
    });
    expect(leaveEvents).toBe(1);
  });

  it('still lets a revoked participant close out their own attendance', async () => {
    const { organizer, participant, invitation, rawToken } = await createJoinableScenario();

    await asUser(participant.cookie).post(`/api/v1/join/${rawToken}/authorize`).send({});
    await asUser(organizer.cookie).post(`/api/v1/invitations/${invitation.id}/revoke`).send({});

    const left = await asUser(participant.cookie).post(`/api/v1/join/${rawToken}/leave`).send({});
    expect(left.status).toBe(200);
  });

  it('refuses a leave from a user who is not the invited participant', async () => {
    const { rawToken } = await createJoinableScenario();
    const other = await createJoinableScenario();

    const response = await asUser(other.participant.cookie)
      .post(`/api/v1/join/${rawToken}/leave`)
      .send({});

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('PARTICIPANT_MISMATCH');
  });
});
