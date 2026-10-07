/**
 * MANDATORY SECURITY SUITE.
 *
 * Each test here corresponds to a guarantee the product makes about who can
 * reach what. They run against a real PostgreSQL instance — Prisma is not
 * mocked — because the guarantees depend on database constraints and
 * transactions, not just on TypeScript.
 */
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma, resetDatabase } from '../fixtures/db.js';
import { api, asUser } from '../fixtures/test-app.js';
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

describe('anonymous access', () => {
  it('cannot create a call', async () => {
    const response = await api()
      .post('/api/v1/calls')
      .send({
        title: 'Intruder call',
        scheduledStart: new Date().toISOString(),
        scheduledEnd: addMinutes(new Date(), 60).toISOString(),
        timezone: 'UTC',
      });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTHENTICATION_REQUIRED');
    expect(await prisma.call.count()).toBe(0);
  });

  it('cannot join even with a perfectly valid token', async () => {
    const { rawToken } = await createJoinableScenario();

    const response = await api().post(`/api/v1/join/${rawToken}/authorize`).send({});

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('AUTHENTICATION_REQUIRED');
    expect(await prisma.attendanceSession.count()).toBe(0);
  });

  it('cannot list calls, read attendance, transcripts or audit', async () => {
    const { call } = await createJoinableScenario();

    for (const path of [
      '/api/v1/calls',
      `/api/v1/calls/${call.id}`,
      `/api/v1/calls/${call.id}/attendance`,
      `/api/v1/calls/${call.id}/transcript`,
      `/api/v1/calls/${call.id}/audit`,
      `/api/v1/calls/${call.id}/invitations`,
    ]) {
      const response = await api().get(path);
      expect(response.status, path).toBe(401);
    }
  });
});

describe('participant binding', () => {
  it("rejects Bob using Alice's invitation token", async () => {
    const { rawToken, call } = await createJoinableScenario();
    const bob = await createUser('bob');

    const response = await asUser(bob.cookie).post(`/api/v1/join/${rawToken}/authorize`).send({});

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('PARTICIPANT_MISMATCH');

    // Bob must leave no trace on the call's attendance.
    expect(await prisma.attendance.count({ where: { callId: call.id } })).toBe(0);

    // The denial is attributed to the call so the organizer can investigate it.
    const denial = await prisma.auditEvent.findFirst({
      where: { callId: call.id, action: 'JOIN_DENIED', actorUserId: bob.id },
    });
    expect(denial?.outcome).toBe('DENIED');
    expect((denial?.metadata as Record<string, unknown>).code).toBe('PARTICIPANT_MISMATCH');
  });

  it('rejects a token that matches nothing', async () => {
    const user = await createUser('nobody');
    const response = await asUser(user.cookie)
      .post(`/api/v1/join/${'z'.repeat(43)}/authorize`)
      .send({});

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('INVITE_NOT_FOUND');
  });
});

describe('time-window enforcement', () => {
  it('admits an invitee who arrives before the window opens', async () => {
    // Arriving early is allowed on purpose: what gates entry is holding a
    // live invitation, not the clock. The end of the window still closes it.
    const organizer = await createUser('organizer');
    const alice = await createUser('alice');
    const call = await createCall({
      organizerId: organizer.id,
      startsInMinutes: 60,
      status: 'SCHEDULED',
    });
    const { rawToken } = await createInvitation({ callId: call.id, participantId: alice.id });

    const response = await asUser(alice.cookie).post(`/api/v1/join/${rawToken}/authorize`).send({});

    expect(response.status).toBe(200);
    expect(response.body.data.attendanceSession.status).toBe('CONNECTED');
  });

  it('still refuses an early arrival whose invitation was revoked', async () => {
    // Early entry relaxes the clock, never the credential.
    const organizer = await createUser('organizer');
    const alice = await createUser('alice');
    const call = await createCall({
      organizerId: organizer.id,
      startsInMinutes: 60,
      status: 'SCHEDULED',
    });
    const { rawToken, invitation } = await createInvitation({
      callId: call.id,
      participantId: alice.id,
    });

    await asUser(organizer.cookie).post(`/api/v1/invitations/${invitation.id}/revoke`).send({});

    const response = await asUser(alice.cookie).post(`/api/v1/join/${rawToken}/authorize`).send({});

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('INVITE_REVOKED');
  });

  it('denies a join after the window closes', async () => {
    const organizer = await createUser('organizer');
    const alice = await createUser('alice');
    const call = await createCall({
      organizerId: organizer.id,
      startsInMinutes: -180,
      durationMinutes: 60,
      status: 'LIVE',
    });
    // The credential is deliberately still valid, so the window is the only
    // thing that can deny.
    const { rawToken } = await createInvitation({
      callId: call.id,
      participantId: alice.id,
      expiresAt: addMinutes(new Date(), 60),
    });

    const response = await asUser(alice.cookie).post(`/api/v1/join/${rawToken}/authorize`).send({});

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('JOIN_WINDOW_CLOSED');
  });

  it('denies a join after the window even when the scheduler left the call LIVE', async () => {
    // The stored status is deliberately stale here: authorization must reject
    // on the clock alone, independently of any scheduler having run.
    const organizer = await createUser('organizer');
    const alice = await createUser('alice');
    const call = await createCall({
      organizerId: organizer.id,
      startsInMinutes: -120,
      durationMinutes: 30,
      status: 'LIVE',
    });
    const { rawToken } = await createInvitation({
      callId: call.id,
      participantId: alice.id,
      expiresAt: addMinutes(new Date(), 60),
    });

    const response = await asUser(alice.cookie).post(`/api/v1/join/${rawToken}/authorize`).send({});

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('JOIN_WINDOW_CLOSED');
  });

  it('reports invitation expiry ahead of the window when both have lapsed', async () => {
    // Check order is part of the contract: a caller holding a dead credential
    // learns that the credential is dead, not the call's schedule.
    const organizer = await createUser('organizer');
    const alice = await createUser('alice');
    const call = await createCall({
      organizerId: organizer.id,
      startsInMinutes: -180,
      durationMinutes: 60,
      status: 'LIVE',
    });
    const { rawToken } = await createInvitation({
      callId: call.id,
      participantId: alice.id,
      expiresAt: addMinutes(new Date(), -30),
    });

    const response = await asUser(alice.cookie).post(`/api/v1/join/${rawToken}/authorize`).send({});

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('INVITE_EXPIRED');
  });

  it('checks participant ownership before revealing anything about the window', async () => {
    // Bob holding Alice's token for a not-yet-open call must learn only that
    // the token is not his — never that the call has not started.
    const organizer = await createUser('organizer');
    const alice = await createUser('alice');
    const bob = await createUser('bob');
    const call = await createCall({
      organizerId: organizer.id,
      startsInMinutes: 120,
      status: 'SCHEDULED',
    });
    const { rawToken } = await createInvitation({ callId: call.id, participantId: alice.id });

    const response = await asUser(bob.cookie).post(`/api/v1/join/${rawToken}/authorize`).send({});

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('PARTICIPANT_MISMATCH');
  });
});

describe('invitation lifecycle enforcement', () => {
  it('denies an expired invitation', async () => {
    const organizer = await createUser('organizer');
    const alice = await createUser('alice');
    const call = await createCall({ organizerId: organizer.id });
    const { rawToken } = await createInvitation({
      callId: call.id,
      participantId: alice.id,
      expiresAt: addMinutes(new Date(), -1),
    });

    const response = await asUser(alice.cookie).post(`/api/v1/join/${rawToken}/authorize`).send({});

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('INVITE_EXPIRED');
  });

  it('denies a join to a cancelled call', async () => {
    const organizer = await createUser('organizer');
    const alice = await createUser('alice');
    const call = await createCall({ organizerId: organizer.id, status: 'CANCELLED' });
    const { rawToken } = await createInvitation({ callId: call.id, participantId: alice.id });

    const response = await asUser(alice.cookie).post(`/api/v1/join/${rawToken}/authorize`).send({});

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CALL_CANCELLED');
  });
});

describe('call-ID guessing', () => {
  it('does not disclose a call, its roster, transcript or audit to an unrelated user', async () => {
    const { call } = await createJoinableScenario();
    const stranger = await createUser('stranger');

    const detail = await asUser(stranger.cookie).get(`/api/v1/calls/${call.id}`);
    expect(detail.status).toBe(404);
    expect(detail.body.error.code).toBe('CALL_NOT_FOUND');
    expect(JSON.stringify(detail.body)).not.toContain('Architecture Review');

    const attendance = await asUser(stranger.cookie).get(`/api/v1/calls/${call.id}/attendance`);
    expect(attendance.status).toBe(404);

    const invitations = await asUser(stranger.cookie).get(`/api/v1/calls/${call.id}/invitations`);
    expect(invitations.status).toBe(404);

    const audit = await asUser(stranger.cookie).get(`/api/v1/calls/${call.id}/audit`);
    expect(audit.status).toBe(404);

    const transcript = await asUser(stranger.cookie).get(`/api/v1/calls/${call.id}/transcript`);
    expect(transcript.status).toBe(404);
  });

  it('returns the same shape for a real call and a fabricated ID', async () => {
    const { call } = await createJoinableScenario();
    const stranger = await createUser('stranger');

    const real = await asUser(stranger.cookie).get(`/api/v1/calls/${call.id}/transcript`);
    const fake = await asUser(stranger.cookie).get('/api/v1/calls/call_does_not_exist/transcript');

    expect(real.status).toBe(fake.status);
    expect(real.body.error.code).toBe(fake.body.error.code);
  });
});

describe('transcript access control', () => {
  it('lets the organizer and the invited participant read it, and nobody else', async () => {
    const { organizer, participant, call } = await createJoinableScenario();
    const stranger = await createUser('stranger');

    await prisma.transcript.create({
      data: {
        callId: call.id,
        status: 'READY',
        content: 'sensitive transcript content',
        generatedAt: new Date(),
        expiresAt: addMinutes(new Date(), 60 * 24 * 30),
      },
    });

    const asOrganizer = await asUser(organizer.cookie).get(`/api/v1/calls/${call.id}/transcript`);
    expect(asOrganizer.status).toBe(200);
    expect(asOrganizer.body.data.content).toContain('sensitive transcript content');

    const asParticipant = await asUser(participant.cookie).get(
      `/api/v1/calls/${call.id}/transcript`,
    );
    expect(asParticipant.status).toBe(200);

    const asStranger = await asUser(stranger.cookie).get(`/api/v1/calls/${call.id}/transcript`);
    expect(asStranger.status).toBe(404);
    expect(JSON.stringify(asStranger.body)).not.toContain('sensitive transcript content');

    const denial = await prisma.auditEvent.findFirst({
      where: { callId: call.id, action: 'TRANSCRIPT_ACCESS_DENIED' },
    });
    expect(denial?.actorUserId).toBe(stranger.id);
  });
});

describe('attendance access control', () => {
  it('is organizer-only; a participant cannot read the roster', async () => {
    const { organizer, participant, call } = await createJoinableScenario();

    const asOrganizer = await asUser(organizer.cookie).get(`/api/v1/calls/${call.id}/attendance`);
    expect(asOrganizer.status).toBe(200);

    const asParticipant = await asUser(participant.cookie).get(
      `/api/v1/calls/${call.id}/attendance`,
    );
    expect(asParticipant.status).toBe(403);
    expect(asParticipant.body.error.code).toBe('FORBIDDEN');
  });
});

describe('revocation authority', () => {
  it('only the organizer may revoke', async () => {
    const { participant, invitation } = await createJoinableScenario();
    const stranger = await createUser('stranger');

    const byParticipant = await asUser(participant.cookie)
      .post(`/api/v1/invitations/${invitation.id}/revoke`)
      .send({});
    expect(byParticipant.status).toBe(404);

    const byStranger = await asUser(stranger.cookie)
      .post(`/api/v1/invitations/${invitation.id}/revoke`)
      .send({});
    expect(byStranger.status).toBe(404);

    const unchanged = await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } });
    expect(unchanged.status).toBe('ACTIVE');
  });
});

describe('secret hygiene', () => {
  it('never returns a token hash or raw token from any invitation endpoint', async () => {
    const { organizer, participant, call } = await createJoinableScenario();

    const created = await asUser(organizer.cookie)
      .post(`/api/v1/calls/${call.id}/invitations`)
      .send({ participantId: (await createUser('dave')).id });
    expect(created.status).toBe(201);

    const rawToken = String(created.body.data.joinUrl).split('/join/')[1];
    const stored = await prisma.invitation.findUniqueOrThrow({
      where: { id: created.body.data.id },
    });

    // Only the hash is persisted.
    expect(stored.tokenHash).not.toBe(rawToken);
    expect(JSON.stringify(created.body)).not.toContain(stored.tokenHash);

    const listed = await asUser(organizer.cookie).get(`/api/v1/calls/${call.id}/invitations`);
    expect(JSON.stringify(listed.body)).not.toContain(stored.tokenHash);
    expect(JSON.stringify(listed.body)).not.toContain(rawToken);

    const detail = await asUser(participant.cookie).get(
      `/api/v1/invitations/${
        (await prisma.invitation.findFirstOrThrow({ where: { participantId: participant.id } })).id
      }`,
    );
    expect(JSON.stringify(detail.body)).not.toContain('tokenHash');
  });

  it('keeps raw tokens out of audit metadata', async () => {
    const { participant, rawToken, call } = await createJoinableScenario();

    await asUser(participant.cookie).post(`/api/v1/join/${rawToken}/authorize`).send({});

    const events = await prisma.auditEvent.findMany({ where: { callId: call.id } });
    expect(events.length).toBeGreaterThan(0);
    for (const event of events) {
      expect(JSON.stringify(event.metadata ?? {})).not.toContain(rawToken);
    }
  });
});
