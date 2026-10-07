import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma, resetDatabase } from '../fixtures/db.js';
import { asUser } from '../fixtures/test-app.js';
import {
  createCall,
  createInvitation,
  createJoinableScenario,
  createUser,
} from '../fixtures/factories.js';
import { addMinutes } from '../../src/shared/time/window.js';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('audit trail completeness', () => {
  it('records the full lifecycle of a call for its organizer', async () => {
    const { organizer, participant, call, invitation, rawToken } = await createJoinableScenario();

    await asUser(participant.cookie).post(`/api/v1/join/${rawToken}/authorize`).send({});
    await asUser(participant.cookie).post(`/api/v1/join/${rawToken}/leave`).send({});
    await asUser(organizer.cookie).post(`/api/v1/invitations/${invitation.id}/revoke`).send({});

    const response = await asUser(organizer.cookie).get(`/api/v1/calls/${call.id}/audit?limit=50`);
    expect(response.status).toBe(200);

    const actions = response.body.items.map((item: { action: string }) => item.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        'JOIN_AUTHORIZED',
        'ATTENDANCE_JOINED',
        'ATTENDANCE_LEFT',
        'INVITATION_REVOKED',
      ]),
    );
  });

  it("surfaces denied join attempts against the organizer's own call", async () => {
    const { organizer, call, rawToken } = await createJoinableScenario();
    const bob = await createUser('bob');

    const denied = await asUser(bob.cookie).post(`/api/v1/join/${rawToken}/authorize`).send({});
    expect(denied.status).toBe(403);

    const response = await asUser(organizer.cookie).get(`/api/v1/calls/${call.id}/audit?limit=50`);
    const joinDenied = response.body.items.find(
      (item: { action: string }) => item.action === 'JOIN_DENIED',
    );

    expect(joinDenied).toBeDefined();
    expect(joinDenied.outcome).toBe('DENIED');
    expect(joinDenied.actorUserId).toBe(bob.id);
    expect(joinDenied.metadata.code).toBe('PARTICIPANT_MISMATCH');
    // The credential is represented only by a non-reversible fingerprint.
    expect(JSON.stringify(joinDenied.metadata)).not.toContain(rawToken);
  });

  it('records a window denial against the call once the window has closed', async () => {
    const organizer = await createUser('organizer');
    const alice = await createUser('alice');
    // The window closed ten minutes ago, so the invitation itself is still
    // inside its grace period — this isolates the window rule from expiry.
    const call = await createCall({
      organizerId: organizer.id,
      startsInMinutes: -70,
      durationMinutes: 60,
      status: 'SCHEDULED',
    });
    const { rawToken } = await createInvitation({ callId: call.id, participantId: alice.id });

    await asUser(alice.cookie).post(`/api/v1/join/${rawToken}/authorize`).send({});

    const response = await asUser(organizer.cookie).get(`/api/v1/calls/${call.id}/audit`);
    const denial = response.body.items.find(
      (item: { action: string }) => item.action === 'JOIN_DENIED',
    );
    expect(denial.metadata.code).toBe('JOIN_WINDOW_CLOSED');
  });

  it('records how each entry was reached', async () => {
    const { organizer, participant, call, rawToken } = await createJoinableScenario();

    await asUser(participant.cookie).post(`/api/v1/join/${rawToken}/authorize`).send({});
    await asUser(organizer.cookie).post(`/api/v1/calls/${call.id}/join`).send({});

    const response = await asUser(organizer.cookie).get(`/api/v1/calls/${call.id}/audit`);
    const authorizations = response.body.items.filter(
      (item: { action: string }) => item.action === 'JOIN_AUTHORIZED',
    );

    const byRole = Object.fromEntries(
      authorizations.map((item: { metadata: { role: string; via: string } }) => [
        item.metadata.role,
        item.metadata.via,
      ]),
    );

    expect(byRole).toEqual({ PARTICIPANT: 'INVITE_LINK', ORGANIZER: 'CALL_ID' });
  });

  it('pages the audit log without duplicates', async () => {
    const { organizer, participant, call, rawToken } = await createJoinableScenario();

    for (let index = 0; index < 6; index += 1) {
      await asUser(participant.cookie)
        .post(`/api/v1/join/${rawToken}/authorize`)
        .send({ deviceId: `device-${index}` });
    }

    const seen: string[] = [];
    let cursor: string | null = null;

    do {
      const url: string = cursor
        ? `/api/v1/calls/${call.id}/audit?limit=4&cursor=${encodeURIComponent(cursor)}`
        : `/api/v1/calls/${call.id}/audit?limit=4`;
      const response = await asUser(organizer.cookie).get(url);

      expect(response.status).toBe(200);
      seen.push(...response.body.items.map((item: { id: string }) => item.id));
      cursor = response.body.nextCursor;
    } while (cursor);

    expect(seen.length).toBeGreaterThanOrEqual(12);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('never leaks IP address or user agent through the audit API', async () => {
    const { organizer, participant, call, rawToken } = await createJoinableScenario();
    await asUser(participant.cookie).post(`/api/v1/join/${rawToken}/authorize`).send({});

    const response = await asUser(organizer.cookie).get(`/api/v1/calls/${call.id}/audit`);
    const body = JSON.stringify(response.body);

    expect(body).not.toContain('ipAddress');
    expect(body).not.toContain('userAgent');

    // The data is recorded for investigation, just not served.
    const stored = await prisma.auditEvent.findFirst({
      where: { callId: call.id, action: 'JOIN_AUTHORIZED' },
    });
    expect(stored?.requestId).toBeTruthy();
  });
});

describe('attendance totals after a forced revoke', () => {
  it('recalculates connected time rather than freezing it at join', async () => {
    const { organizer, participant, call, invitation, rawToken } = await createJoinableScenario();

    const joined = await asUser(participant.cookie)
      .post(`/api/v1/join/${rawToken}/authorize`)
      .send({ deviceId: 'laptop' });
    const sessionId = joined.body.data.attendanceSession.id;

    // Backdate the join so there is measurable connected time to account for.
    await prisma.attendanceSession.update({
      where: { id: sessionId },
      data: { joinedAt: addMinutes(new Date(), -20) },
    });

    await asUser(organizer.cookie).post(`/api/v1/invitations/${invitation.id}/revoke`).send({});

    const attendance = await prisma.attendance.findUniqueOrThrow({
      where: { callId_participantId: { callId: call.id, participantId: participant.id } },
    });

    expect(attendance.status).toBe('COMPLETED');
    expect(attendance.totalConnectedSeconds).toBeGreaterThanOrEqual(19 * 60);
    expect(attendance.lastLeftAt).not.toBeNull();
  });
});
