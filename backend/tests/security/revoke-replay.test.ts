/**
 * THE MOST IMPORTANT TEST IN THE BACKEND.
 *
 * A join credential is a revocable authorization, not a bearer pass. Once the
 * organizer revokes it, replaying the exact same raw token must fail — and it
 * must fail because the database says so, not because a realtime message
 * happened to arrive.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma, resetDatabase } from '../fixtures/db.js';
import { asUser } from '../fixtures/test-app.js';
import { auditActionsFor, createJoinableScenario } from '../fixtures/factories.js';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('revoked invitation replay', () => {
  it('denies the exact raw token after revocation', async () => {
    const { organizer, participant, call, invitation, rawToken } = await createJoinableScenario();

    // 1-6. Alice joins successfully inside the window.
    const joined = await asUser(participant.cookie)
      .post(`/api/v1/join/${rawToken}/authorize`)
      .send({ deviceId: 'laptop' });

    expect(joined.status).toBe(200);
    expect(joined.body.data.attendanceSession.status).toBe('CONNECTED');

    // 7. The organizer revokes.
    const revoked = await asUser(organizer.cookie)
      .post(`/api/v1/invitations/${invitation.id}/revoke`)
      .send({});

    expect(revoked.status).toBe(200);
    expect(revoked.body.data.status).toBe('REVOKED');

    // 8-10. The exact same raw token is replayed.
    const replay = await asUser(participant.cookie)
      .post(`/api/v1/join/${rawToken}/authorize`)
      .send({ deviceId: 'laptop' });

    expect(replay.status).toBe(403);
    expect(replay.body.error.code).toBe('INVITE_REVOKED');

    // 11. Database state is authoritative.
    const stored = await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } });
    expect(stored.status).toBe('REVOKED');
    expect(stored.revokedAt).not.toBeNull();
    expect(stored.revokedById).toBe(organizer.id);

    // 12. The decision trail exists.
    const actions = await auditActionsFor(call.id);
    expect(actions).toContain('JOIN_AUTHORIZED');
    expect(actions).toContain('INVITATION_REVOKED');

    const denial = await prisma.auditEvent.findFirst({
      where: { action: 'JOIN_DENIED', actorUserId: participant.id },
    });
    expect(denial?.outcome).toBe('DENIED');

    // No second session was created by the replay.
    expect(await prisma.attendanceSession.count()).toBe(1);
  });

  it('denies the replay even when the participant never joined first', async () => {
    const { organizer, participant, invitation, rawToken } = await createJoinableScenario();

    await asUser(organizer.cookie).post(`/api/v1/invitations/${invitation.id}/revoke`).send({});

    const attempt = await asUser(participant.cookie)
      .post(`/api/v1/join/${rawToken}/authorize`)
      .send({});

    expect(attempt.status).toBe(403);
    expect(attempt.body.error.code).toBe('INVITE_REVOKED');
    expect(await prisma.attendanceSession.count()).toBe(0);
  });

  it('keeps denying on every subsequent replay', async () => {
    const { organizer, participant, invitation, rawToken } = await createJoinableScenario();

    await asUser(organizer.cookie).post(`/api/v1/invitations/${invitation.id}/revoke`).send({});

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await asUser(participant.cookie)
        .post(`/api/v1/join/${rawToken}/authorize`)
        .send({});
      expect(response.status).toBe(403);
      expect(response.body.error.code).toBe('INVITE_REVOKED');
    }

    expect(await prisma.attendanceSession.count()).toBe(0);
  });
});

describe('revocation during an active call', () => {
  it('terminates the live session and denies the next heartbeat', async () => {
    const { organizer, participant, call, invitation, rawToken } = await createJoinableScenario();

    // Alice is connected.
    const joined = await asUser(participant.cookie)
      .post(`/api/v1/join/${rawToken}/authorize`)
      .send({ deviceId: 'laptop' });
    expect(joined.status).toBe(200);

    const sessionId = joined.body.data.attendanceSession.id;

    // A heartbeat succeeds while the invitation is active.
    const beforeRevoke = await asUser(participant.cookie)
      .post(`/api/v1/join/${rawToken}/heartbeat`)
      .send({ sessionId });
    expect(beforeRevoke.status).toBe(200);
    expect(beforeRevoke.body.data.status).toBe('ACTIVE');

    // The organizer revokes mid-call.
    const revoked = await asUser(organizer.cookie)
      .post(`/api/v1/invitations/${invitation.id}/revoke`)
      .send({});
    expect(revoked.status).toBe(200);

    // The attendance session is closed in the same transaction as the revoke.
    const session = await prisma.attendanceSession.findUniqueOrThrow({ where: { id: sessionId } });
    expect(session.status).toBe('REVOKED');
    expect(session.leftReason).toBe('INVITE_REVOKED');
    expect(session.leftAt).not.toBeNull();

    // The heartbeat is denied — this is the check that holds even if the
    // realtime event was never delivered.
    const afterRevoke = await asUser(participant.cookie)
      .post(`/api/v1/join/${rawToken}/heartbeat`)
      .send({ sessionId });
    expect(afterRevoke.status).toBe(403);
    expect(afterRevoke.body.error.code).toBe('INVITE_REVOKED');

    // And the token itself is dead.
    const replay = await asUser(participant.cookie)
      .post(`/api/v1/join/${rawToken}/authorize`)
      .send({});
    expect(replay.status).toBe(403);

    const actions = await auditActionsFor(call.id);
    expect(actions).toContain('INVITATION_REVOKED');
    expect(actions).toContain('FORCED_DISCONNECT');
  });

  it('disconnects every device the participant was using', async () => {
    const { organizer, participant, invitation, rawToken } = await createJoinableScenario();

    await asUser(participant.cookie)
      .post(`/api/v1/join/${rawToken}/authorize`)
      .send({ deviceId: 'laptop' });
    await asUser(participant.cookie)
      .post(`/api/v1/join/${rawToken}/authorize`)
      .send({ deviceId: 'phone' });

    expect(await prisma.attendanceSession.count({ where: { status: 'CONNECTED' } })).toBe(2);

    await asUser(organizer.cookie).post(`/api/v1/invitations/${invitation.id}/revoke`).send({});

    expect(await prisma.attendanceSession.count({ where: { status: 'CONNECTED' } })).toBe(0);
    expect(await prisma.attendanceSession.count({ where: { status: 'REVOKED' } })).toBe(2);
  });
});
