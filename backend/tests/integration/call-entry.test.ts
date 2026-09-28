import { describe, expect, it } from 'vitest';
import { asUser } from '../fixtures/test-app.js';
import { createCall, createJoinableScenario, createUser } from '../fixtures/factories.js';

/**
 * Entry without a join link.
 *
 * The organizer is never issued an invitation to their own call, so ownership
 * has to be a door of its own — and an invitee must be able to walk in while
 * signed in, without hunting for the email.
 */
describe('entry by identity', () => {
  it('admits the organizer to their own call', async () => {
    const organizer = await createUser('organizer');
    const call = await createCall({ organizerId: organizer.id, status: 'LIVE' });

    const response = await asUser(organizer.cookie)
      .post(`/api/v1/calls/${call.id}/join`)
      .send({ deviceId: 'host-laptop' });

    expect(response.status).toBe(200);
    expect(response.body.data.role).toBe('ORGANIZER');
    expect(response.body.data.attendanceSession.status).toBe('CONNECTED');
  });

  it('refuses to issue the organizer an invitation, which is why the door exists', async () => {
    const organizer = await createUser('organizer');
    const call = await createCall({ organizerId: organizer.id, status: 'LIVE' });

    const response = await asUser(organizer.cookie)
      .post(`/api/v1/calls/${call.id}/invitations`)
      .send({ participantId: organizer.id });

    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe('BUSINESS_RULE_FAILURE');
  });

  it('admits an invited participant with no link in hand', async () => {
    const { participant, call } = await createJoinableScenario();

    const response = await asUser(participant.cookie)
      .post(`/api/v1/calls/${call.id}/join`)
      .send({ deviceId: 'phone' });

    expect(response.status).toBe(200);
    expect(response.body.data.role).toBe('PARTICIPANT');
  });

  it('refuses a stranger, revealing only that there is nothing for them', async () => {
    const organizer = await createUser('organizer');
    const stranger = await createUser('stranger');
    const call = await createCall({ organizerId: organizer.id, status: 'LIVE' });

    const response = await asUser(stranger.cookie).post(`/api/v1/calls/${call.id}/join`).send({});

    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe('CALL_NOT_FOUND');
  });

  it('refuses a participant whose invitation was revoked', async () => {
    const { organizer, participant, call, invitation } = await createJoinableScenario();

    await asUser(organizer.cookie).post(`/api/v1/invitations/${invitation.id}/revoke`).send({});

    const response = await asUser(participant.cookie)
      .post(`/api/v1/calls/${call.id}/join`)
      .send({});

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('INVITE_REVOKED');
  });

  it('lets both doors reach the same room', async () => {
    const { organizer, participant, call, rawToken } = await createJoinableScenario();

    await asUser(organizer.cookie).post(`/api/v1/calls/${call.id}/join`).send({});
    await asUser(participant.cookie).post(`/api/v1/join/${rawToken}/authorize`).send({});

    const roster = await asUser(participant.cookie).get(`/api/v1/calls/${call.id}/participants`);

    expect(roster.status).toBe(200);
    expect(roster.body.data).toHaveLength(2);
    expect(roster.body.data.filter((person: { isOrganizer: boolean }) => person.isOrganizer)).toHaveLength(1);
  });

  it('binds the organizer to the end of the window like everyone else', async () => {
    const organizer = await createUser('organizer');
    const call = await createCall({
      organizerId: organizer.id,
      startsInMinutes: -70,
      durationMinutes: 60,
      status: 'SCHEDULED',
    });

    const response = await asUser(organizer.cookie).post(`/api/v1/calls/${call.id}/join`).send({});

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('JOIN_WINDOW_CLOSED');
  });

  it('lets the organizer open the room before the scheduled start', async () => {
    const organizer = await createUser('organizer');
    const call = await createCall({
      organizerId: organizer.id,
      startsInMinutes: 45,
      status: 'SCHEDULED',
    });

    const response = await asUser(organizer.cookie).post(`/api/v1/calls/${call.id}/join`).send({});

    expect(response.status).toBe(200);
  });

  it('closes the room for everyone once the organizer ends the call', async () => {
    const { organizer, participant, call } = await createJoinableScenario();

    await asUser(participant.cookie).post(`/api/v1/calls/${call.id}/join`).send({});
    await asUser(organizer.cookie).post(`/api/v1/calls/${call.id}/end`).send({});

    const rejoin = await asUser(participant.cookie).post(`/api/v1/calls/${call.id}/join`).send({});
    const hostRejoin = await asUser(organizer.cookie).post(`/api/v1/calls/${call.id}/join`).send({});

    expect(rejoin.status).toBe(403);
    expect(hostRejoin.status).toBe(403);
  });
});

describe('the live roster', () => {
  it('is hidden from someone unrelated to the call', async () => {
    const { call } = await createJoinableScenario();
    const stranger = await createUser('stranger');

    const response = await asUser(stranger.cookie).get(`/api/v1/calls/${call.id}/participants`);

    expect(response.status).toBe(404);
  });

  it('carries display names only — never contact or device detail', async () => {
    const { organizer, participant, call } = await createJoinableScenario();
    await asUser(participant.cookie).post(`/api/v1/calls/${call.id}/join`).send({ deviceId: 'a' });

    const response = await asUser(organizer.cookie).get(`/api/v1/calls/${call.id}/participants`);
    const person = response.body.data[0];

    expect(Object.keys(person).sort()).toEqual([
      'connections',
      'id',
      'isOrganizer',
      'joinedAt',
      'name',
    ]);
    expect(JSON.stringify(response.body)).not.toContain('@');
  });

  it('counts one person once, however many devices they use', async () => {
    const { participant, call } = await createJoinableScenario();

    await asUser(participant.cookie).post(`/api/v1/calls/${call.id}/join`).send({ deviceId: 'a' });
    await asUser(participant.cookie).post(`/api/v1/calls/${call.id}/join`).send({ deviceId: 'b' });

    const response = await asUser(participant.cookie).get(`/api/v1/calls/${call.id}/participants`);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].connections).toBe(2);
  });
});

describe('a participant listing their own invitations', () => {
  it('returns the invitations issued to them, with the call attached', async () => {
    const { participant, call, organizer } = await createJoinableScenario();

    const response = await asUser(participant.cookie).get('/api/v1/invitations/mine');

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0].call.id).toBe(call.id);
    expect(response.body.items[0].call.organizerName).toBeTruthy();
    expect(organizer.id).toBeTruthy();
  });

  it('never returns an invitation issued to somebody else', async () => {
    await createJoinableScenario();
    const outsider = await createUser('outsider');

    const response = await asUser(outsider.cookie).get('/api/v1/invitations/mine');

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(0);
  });

  it('leaks no credential material', async () => {
    const { participant, rawToken } = await createJoinableScenario();

    const response = await asUser(participant.cookie).get('/api/v1/invitations/mine');
    const body = JSON.stringify(response.body);

    expect(body).not.toContain(rawToken);
    expect(body).not.toContain('tokenHash');
    expect(body).not.toContain('joinUrl');
  });
});

describe('resolving a link without using it', () => {
  it('reports the call and records no attendance', async () => {
    const { participant, call, rawToken, organizer } = await createJoinableScenario();

    const resolved = await asUser(participant.cookie)
      .post(`/api/v1/join/${rawToken}/resolve`)
      .send({});

    expect(resolved.status).toBe(200);
    expect(resolved.body.data.call.id).toBe(call.id);

    const roster = await asUser(organizer.cookie).get(`/api/v1/calls/${call.id}/participants`);
    expect(roster.body.data).toHaveLength(0);
  });

  it('refuses exactly as entry would', async () => {
    const { organizer, participant, rawToken, invitation } = await createJoinableScenario();
    await asUser(organizer.cookie).post(`/api/v1/invitations/${invitation.id}/revoke`).send({});

    const response = await asUser(participant.cookie)
      .post(`/api/v1/join/${rawToken}/resolve`)
      .send({});

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('INVITE_REVOKED');
  });
});
