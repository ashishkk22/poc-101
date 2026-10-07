import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma, resetDatabase } from '../fixtures/db.js';
import { asUser } from '../fixtures/test-app.js';
import { auditActionsFor, createCall, createUser } from '../fixtures/factories.js';
import { hashToken } from '../../src/shared/security/tokens.js';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('create invitation', () => {
  it('issues an opaque token, stores only its hash, and returns the join URL once', async () => {
    const organizer = await createUser('organizer');
    const alice = await createUser('alice');
    const call = await createCall({ organizerId: organizer.id });

    const response = await asUser(organizer.cookie)
      .post(`/api/v1/calls/${call.id}/invitations`)
      .send({ participantId: alice.id });

    expect(response.status).toBe(201);
    expect(response.body.data.status).toBe('ACTIVE');
    expect(response.body.data.joinUrl).toContain('/join/');

    const rawToken = String(response.body.data.joinUrl).split('/join/')[1]!;
    const stored = await prisma.invitation.findUniqueOrThrow({
      where: { id: response.body.data.id },
    });

    // The database holds the hash and nothing else.
    expect(stored.tokenHash).toBe(hashToken(rawToken));
    expect(stored.tokenHash).not.toBe(rawToken);

    // A fresh read of the invitation never surfaces the credential again.
    const reread = await asUser(organizer.cookie).get(
      `/api/v1/invitations/${response.body.data.id}`,
    );
    expect(reread.body.data.joinUrl).toBeUndefined();

    expect(await auditActionsFor(call.id)).toContain('INVITATION_CREATED');
  });

  it('clamps the credential lifetime to the call window plus the grace period', async () => {
    const organizer = await createUser('organizer');
    const alice = await createUser('alice');
    const call = await createCall({ organizerId: organizer.id });

    const response = await asUser(organizer.cookie)
      .post(`/api/v1/calls/${call.id}/invitations`)
      .send({
        participantId: alice.id,
        expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString(),
      });

    const expiresAt = new Date(response.body.data.expiresAt);
    // Never a year out; capped at scheduledEnd + INVITATION_TTL_MINUTES_AFTER_END.
    expect(expiresAt.getTime()).toBeLessThanOrEqual(call.scheduledEnd.getTime() + 61 * 60_000);
  });

  it('rejects a duplicate invitation for the same participant', async () => {
    const organizer = await createUser('organizer');
    const alice = await createUser('alice');
    const call = await createCall({ organizerId: organizer.id });

    const first = await asUser(organizer.cookie)
      .post(`/api/v1/calls/${call.id}/invitations`)
      .send({ participantId: alice.id });
    expect(first.status).toBe(201);

    const second = await asUser(organizer.cookie)
      .post(`/api/v1/calls/${call.id}/invitations`)
      .send({ participantId: alice.id });
    expect(second.status).toBe(409);

    expect(await prisma.invitation.count({ where: { callId: call.id } })).toBe(1);
  });

  it('rejects a non-existent participant and the organizer themselves', async () => {
    const organizer = await createUser('organizer');
    const call = await createCall({ organizerId: organizer.id });

    const missing = await asUser(organizer.cookie)
      .post(`/api/v1/calls/${call.id}/invitations`)
      .send({ participantId: 'user_does_not_exist' });
    expect(missing.status).toBe(400);

    const self = await asUser(organizer.cookie)
      .post(`/api/v1/calls/${call.id}/invitations`)
      .send({ participantId: organizer.id });
    expect(self.status).toBe(422);
  });

  it('cannot be created by a non-organizer', async () => {
    const organizer = await createUser('organizer');
    const stranger = await createUser('stranger');
    const alice = await createUser('alice');
    const call = await createCall({ organizerId: organizer.id });

    const response = await asUser(stranger.cookie)
      .post(`/api/v1/calls/${call.id}/invitations`)
      .send({ participantId: alice.id });

    expect(response.status).toBe(404);
    expect(await prisma.invitation.count()).toBe(0);
  });

  it('cannot be created for a cancelled call', async () => {
    const organizer = await createUser('organizer');
    const alice = await createUser('alice');
    const call = await createCall({ organizerId: organizer.id, status: 'CANCELLED' });

    const response = await asUser(organizer.cookie)
      .post(`/api/v1/calls/${call.id}/invitations`)
      .send({ participantId: alice.id });

    expect(response.status).toBe(422);
  });
});

describe('list invitations', () => {
  it('pages the roster for the organizer only', async () => {
    const organizer = await createUser('organizer');
    const call = await createCall({ organizerId: organizer.id });

    for (let index = 0; index < 7; index += 1) {
      const participant = await createUser(`p${index}`);
      await asUser(organizer.cookie)
        .post(`/api/v1/calls/${call.id}/invitations`)
        .send({ participantId: participant.id });
    }

    const seen: string[] = [];
    let cursor: string | null = null;

    do {
      const url: string = cursor
        ? `/api/v1/calls/${call.id}/invitations?limit=3&cursor=${encodeURIComponent(cursor)}`
        : `/api/v1/calls/${call.id}/invitations?limit=3`;
      const response = await asUser(organizer.cookie).get(url);

      expect(response.status).toBe(200);
      seen.push(...response.body.items.map((item: { id: string }) => item.id));
      cursor = response.body.nextCursor;
    } while (cursor);

    expect(seen).toHaveLength(7);
    expect(new Set(seen).size).toBe(7);
  });
});

describe('revoke invitation', () => {
  it('is idempotent and writes exactly one audit event', async () => {
    const organizer = await createUser('organizer');
    const alice = await createUser('alice');
    const call = await createCall({ organizerId: organizer.id });

    const created = await asUser(organizer.cookie)
      .post(`/api/v1/calls/${call.id}/invitations`)
      .send({ participantId: alice.id });
    const invitationId = created.body.data.id;

    const first = await asUser(organizer.cookie)
      .post(`/api/v1/invitations/${invitationId}/revoke`)
      .send({});
    expect(first.status).toBe(200);
    expect(first.body.data.status).toBe('REVOKED');

    const second = await asUser(organizer.cookie)
      .post(`/api/v1/invitations/${invitationId}/revoke`)
      .send({});
    expect(second.status).toBe(200);
    expect(second.body.data.status).toBe('REVOKED');
    // The revocation instant does not drift on replay.
    expect(second.body.data.revokedAt).toBe(first.body.data.revokedAt);

    const revokeEvents = await prisma.auditEvent.count({
      where: { callId: call.id, action: 'INVITATION_REVOKED' },
    });
    expect(revokeEvents).toBe(1);

    const stored = await prisma.invitation.findUniqueOrThrow({ where: { id: invitationId } });
    expect(stored.status).toBe('REVOKED');
  });
});

describe('read invitation', () => {
  it('is visible to the organizer and to its own participant, and nobody else', async () => {
    const organizer = await createUser('organizer');
    const alice = await createUser('alice');
    const stranger = await createUser('stranger');
    const call = await createCall({ organizerId: organizer.id });

    const created = await asUser(organizer.cookie)
      .post(`/api/v1/calls/${call.id}/invitations`)
      .send({ participantId: alice.id });
    const invitationId = created.body.data.id;

    expect((await asUser(organizer.cookie).get(`/api/v1/invitations/${invitationId}`)).status).toBe(
      200,
    );
    expect((await asUser(alice.cookie).get(`/api/v1/invitations/${invitationId}`)).status).toBe(
      200,
    );
    expect((await asUser(stranger.cookie).get(`/api/v1/invitations/${invitationId}`)).status).toBe(
      404,
    );
  });
});
