/**
 * CONCURRENCY INVARIANT.
 *
 *   Once the revoke transaction commits, no subsequent authorization check
 *   can admit that invitation.
 *
 * These tests assert FINAL DATABASE STATE, not just response codes, and they
 * never rely on JavaScript execution order — both operations take a row lock
 * on the invitation, so PostgreSQL decides the winner.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma, resetDatabase } from '../fixtures/db.js';
import { asUser } from '../fixtures/test-app.js';
import { createJoinableScenario } from '../fixtures/factories.js';
import { retentionService } from '../../src/modules/retention/retention.service.js';
import { transcriptService } from '../../src/modules/transcripts/transcript.service.js';
import { addDays } from '../../src/shared/time/window.js';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('join and revoke raced against each other', () => {
  it('never leaves an invitation active after a revoke commits (join first)', async () => {
    const { organizer, participant, invitation, rawToken } = await createJoinableScenario();

    const [join, revoke] = await Promise.all([
      asUser(participant.cookie).post(`/api/v1/join/${rawToken}/authorize`).send({}),
      asUser(organizer.cookie).post(`/api/v1/invitations/${invitation.id}/revoke`).send({}),
    ]);

    expect(revoke.status).toBe(200);
    expect([200, 403]).toContain(join.status);

    const stored = await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } });
    expect(stored.status).toBe('REVOKED');

    // Whatever the interleaving, no session may remain CONNECTED afterwards.
    expect(await prisma.attendanceSession.count({ where: { status: 'CONNECTED' } })).toBe(0);

    // And the credential is unusable from here on.
    const replay = await asUser(participant.cookie)
      .post(`/api/v1/join/${rawToken}/authorize`)
      .send({});
    expect(replay.status).toBe(403);
    expect(replay.body.error.code).toBe('INVITE_REVOKED');
  });

  it('never leaves an invitation active after a revoke commits (revoke first)', async () => {
    const { organizer, participant, invitation, rawToken } = await createJoinableScenario();

    const [revoke, join] = await Promise.all([
      asUser(organizer.cookie).post(`/api/v1/invitations/${invitation.id}/revoke`).send({}),
      asUser(participant.cookie).post(`/api/v1/join/${rawToken}/authorize`).send({}),
    ]);

    expect(revoke.status).toBe(200);

    const stored = await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } });
    expect(stored.status).toBe('REVOKED');
    expect(await prisma.attendanceSession.count({ where: { status: 'CONNECTED' } })).toBe(0);

    if (join.status === 200) {
      // A join that got in first must have been closed by the revoke.
      const session = await prisma.attendanceSession.findUniqueOrThrow({
        where: { id: join.body.data.attendanceSession.id },
      });
      expect(['REVOKED', 'LEFT']).toContain(session.status);
    }
  });

  it('survives many simultaneous joins racing one revoke', async () => {
    const { organizer, participant, invitation, rawToken } = await createJoinableScenario();

    const operations = [
      ...Array.from({ length: 8 }, (_, index) =>
        asUser(participant.cookie)
          .post(`/api/v1/join/${rawToken}/authorize`)
          .send({ deviceId: `device-${index}` }),
      ),
      asUser(organizer.cookie).post(`/api/v1/invitations/${invitation.id}/revoke`).send({}),
    ];

    await Promise.allSettled(operations);

    const stored = await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } });
    expect(stored.status).toBe('REVOKED');
    expect(await prisma.attendanceSession.count({ where: { status: 'CONNECTED' } })).toBe(0);
  });
});

describe('duplicate mutations', () => {
  it('handles concurrent duplicate revokes without corrupting state', async () => {
    const { organizer, invitation, call } = await createJoinableScenario();

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        asUser(organizer.cookie).post(`/api/v1/invitations/${invitation.id}/revoke`).send({}),
      ),
    );

    for (const result of results) expect(result.status).toBe(200);

    const stored = await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } });
    expect(stored.status).toBe('REVOKED');

    // Exactly one state change happened, so exactly one audit row exists.
    const events = await prisma.auditEvent.count({
      where: { callId: call.id, action: 'INVITATION_REVOKED' },
    });
    expect(events).toBe(1);
  });

  it('handles concurrent duplicate leaves without double-counting', async () => {
    const { participant, call, rawToken } = await createJoinableScenario();

    const joined = await asUser(participant.cookie)
      .post(`/api/v1/join/${rawToken}/authorize`)
      .send({ deviceId: 'laptop' });
    const sessionId = joined.body.data.attendanceSession.id;

    await Promise.all(
      Array.from({ length: 5 }, () =>
        asUser(participant.cookie).post(`/api/v1/join/${rawToken}/leave`).send({ sessionId }),
      ),
    );

    const session = await prisma.attendanceSession.findUniqueOrThrow({ where: { id: sessionId } });
    expect(session.status).toBe('LEFT');

    expect(
      await prisma.attendanceSession.count({ where: { attendance: { callId: call.id } } }),
    ).toBe(1);

    const leaveEvents = await prisma.auditEvent.count({
      where: { callId: call.id, action: 'ATTENDANCE_LEFT' },
    });
    expect(leaveEvents).toBe(1);
  });

  it('collapses concurrent transcript finalization to a single result', async () => {
    const { call } = await createJoinableScenario();

    const outcomes = await Promise.allSettled(
      Array.from({ length: 4 }, (_, index) =>
        transcriptService.generate(call.id, { requestId: `race-${index}` }, index + 1),
      ),
    );

    const ready = outcomes.filter(
      (outcome) => outcome.status === 'fulfilled' && outcome.value === 'READY',
    );
    expect(ready.length).toBe(1);

    expect(await prisma.transcript.count({ where: { callId: call.id } })).toBe(1);
    const transcript = await prisma.transcript.findUniqueOrThrow({ where: { callId: call.id } });
    expect(transcript.status).toBe('READY');

    const readyEvents = await prisma.auditEvent.count({
      where: { callId: call.id, action: 'TRANSCRIPT_READY' },
    });
    expect(readyEvents).toBe(1);
  });

  it('runs the retention job twice concurrently without a double deletion', async () => {
    const { call } = await createJoinableScenario();
    await transcriptService.generate(call.id, { requestId: 'test' }, 1);
    await prisma.transcript.update({
      where: { callId: call.id },
      data: { expiresAt: addDays(new Date(), -1) },
    });

    const [first, second] = await Promise.all([
      retentionService.runSweep({ requestId: 'sweep-a' }),
      retentionService.runSweep({ requestId: 'sweep-b' }),
    ]);

    expect(first.deleted + second.deleted).toBe(1);

    const events = await prisma.auditEvent.count({
      where: { callId: call.id, action: 'TRANSCRIPT_DELETED' },
    });
    expect(events).toBe(1);
  });
});
