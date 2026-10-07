import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma, resetDatabase } from '../fixtures/db.js';
import { api, asUser } from '../fixtures/test-app.js';
import { auditActionsFor, createCall, createUser } from '../fixtures/factories.js';
import { addMinutes } from '../../src/shared/time/window.js';

beforeEach(async () => {
  await resetDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

function callPayload(overrides: Record<string, unknown> = {}) {
  const start = addMinutes(new Date(), 60);
  return {
    title: 'Security Architecture Review',
    scheduledStart: start.toISOString(),
    scheduledEnd: addMinutes(start, 60).toISOString(),
    timezone: 'Asia/Kolkata',
    ...overrides,
  };
}

describe('health and readiness', () => {
  it('reports liveness without touching dependencies', async () => {
    const response = await api().get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('reports dependency readiness without leaking credentials', async () => {
    const response = await api().get('/ready');
    expect(response.status).toBe(200);
    expect(response.body.dependencies.postgres).toBe('up');
    expect(JSON.stringify(response.body)).not.toContain('postgresql://');
  });
});

describe('create call', () => {
  it('creates a scheduled call owned by the caller and audits it', async () => {
    const organizer = await createUser('organizer');

    const response = await asUser(organizer.cookie).post('/api/v1/calls').send(callPayload());

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      title: 'Security Architecture Review',
      timezone: 'Asia/Kolkata',
      status: 'SCHEDULED',
      organizerId: organizer.id,
    });

    expect(await auditActionsFor(response.body.data.id)).toContain('CALL_CREATED');
  });

  it('ignores any organizer identity supplied by the client', async () => {
    const organizer = await createUser('organizer');
    const other = await createUser('other');

    const response = await asUser(organizer.cookie)
      .post('/api/v1/calls')
      .send({ ...callPayload(), organizerId: other.id });

    expect(response.status).toBe(201);
    expect(response.body.data.organizerId).toBe(organizer.id);
  });

  it('rejects invalid input before any row is written', async () => {
    const organizer = await createUser('organizer');
    const start = addMinutes(new Date(), 60);

    const cases = [
      { payload: callPayload({ title: '' }), label: 'empty title' },
      { payload: callPayload({ timezone: 'Mars/Olympus' }), label: 'unknown timezone' },
      { payload: callPayload({ scheduledStart: 'not-a-date' }), label: 'bad timestamp' },
      {
        payload: callPayload({
          scheduledStart: start.toISOString(),
          scheduledEnd: addMinutes(start, -30).toISOString(),
        }),
        label: 'end before start',
      },
      {
        payload: callPayload({
          scheduledStart: start.toISOString(),
          scheduledEnd: start.toISOString(),
        }),
        label: 'zero-length window',
      },
    ];

    for (const testCase of cases) {
      const response = await asUser(organizer.cookie).post('/api/v1/calls').send(testCase.payload);
      expect(response.status, testCase.label).toBe(400);
      expect(response.body.error.code, testCase.label).toBe('VALIDATION_ERROR');
    }

    expect(await prisma.call.count()).toBe(0);
  });
});

describe('call listing and pagination', () => {
  it('pages through history without duplicates or gaps', async () => {
    const organizer = await createUser('organizer');

    // Distinct scheduledStart values so ordering is unambiguous.
    for (let index = 0; index < 12; index += 1) {
      await createCall({
        organizerId: organizer.id,
        title: `Call ${index}`,
        startsInMinutes: index * 60,
        status: 'SCHEDULED',
      });
    }

    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;

    do {
      const url: string = cursor
        ? `/api/v1/calls?limit=5&cursor=${encodeURIComponent(cursor)}`
        : '/api/v1/calls?limit=5';
      const response = await asUser(organizer.cookie).get(url);

      expect(response.status).toBe(200);
      expect(response.body.items.length).toBeLessThanOrEqual(5);

      seen.push(...response.body.items.map((item: { id: string }) => item.id));
      cursor = response.body.nextCursor;
      pages += 1;
    } while (cursor && pages < 10);

    expect(pages).toBe(3);
    expect(seen).toHaveLength(12);
    expect(new Set(seen).size).toBe(12);
  });

  it('orders by scheduledStart descending', async () => {
    const organizer = await createUser('organizer');
    await createCall({ organizerId: organizer.id, title: 'earlier', startsInMinutes: 60 });
    await createCall({ organizerId: organizer.id, title: 'later', startsInMinutes: 600 });

    const response = await asUser(organizer.cookie).get('/api/v1/calls?limit=10');
    expect(response.body.items[0].title).toBe('later');
    expect(response.body.items[1].title).toBe('earlier');
  });

  it('filters by status and start bounds', async () => {
    const organizer = await createUser('organizer');
    await createCall({ organizerId: organizer.id, title: 'cancelled', status: 'CANCELLED' });
    await createCall({
      organizerId: organizer.id,
      title: 'scheduled',
      status: 'SCHEDULED',
      startsInMinutes: 120,
    });

    const filtered = await asUser(organizer.cookie).get('/api/v1/calls?status=CANCELLED');
    expect(filtered.body.items).toHaveLength(1);
    expect(filtered.body.items[0].title).toBe('cancelled');

    const bounded = await asUser(organizer.cookie).get(
      `/api/v1/calls?startAfter=${encodeURIComponent(addMinutes(new Date(), 60).toISOString())}`,
    );
    expect(bounded.body.items).toHaveLength(1);
    expect(bounded.body.items[0].title).toBe('scheduled');
  });

  it("never returns another organizer's calls", async () => {
    const organizer = await createUser('organizer');
    const other = await createUser('other');
    await createCall({ organizerId: other.id, title: 'not yours' });

    const response = await asUser(organizer.cookie).get('/api/v1/calls');
    expect(response.body.items).toHaveLength(0);
  });

  it('rejects an out-of-range limit and a tampered cursor', async () => {
    const organizer = await createUser('organizer');

    const tooLarge = await asUser(organizer.cookie).get('/api/v1/calls?limit=5000');
    expect(tooLarge.status).toBe(400);

    const tampered = await asUser(organizer.cookie).get('/api/v1/calls?cursor=%7Bnope%7D');
    expect(tampered.status).toBe(400);
  });
});

describe('call cancellation', () => {
  it('cancels, audits, and is not repeatable', async () => {
    const organizer = await createUser('organizer');
    const call = await createCall({ organizerId: organizer.id, status: 'SCHEDULED' });

    const cancelled = await asUser(organizer.cookie)
      .post(`/api/v1/calls/${call.id}/cancel`)
      .send({});

    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe('CANCELLED');
    expect(await auditActionsFor(call.id)).toContain('CALL_CANCELLED');

    const again = await asUser(organizer.cookie).post(`/api/v1/calls/${call.id}/cancel`).send({});
    expect(again.status).toBe(409);
  });

  it('cannot be cancelled by a non-organizer', async () => {
    const organizer = await createUser('organizer');
    const stranger = await createUser('stranger');
    const call = await createCall({ organizerId: organizer.id, status: 'SCHEDULED' });

    const response = await asUser(stranger.cookie).post(`/api/v1/calls/${call.id}/cancel`).send({});

    expect(response.status).toBe(404);
    const unchanged = await prisma.call.findUniqueOrThrow({ where: { id: call.id } });
    expect(unchanged.status).toBe('SCHEDULED');
  });

  it('preserves invitation history rather than deleting it', async () => {
    const organizer = await createUser('organizer');
    const alice = await createUser('alice');
    const call = await createCall({ organizerId: organizer.id, status: 'SCHEDULED' });

    const invitation = await asUser(organizer.cookie)
      .post(`/api/v1/calls/${call.id}/invitations`)
      .send({ participantId: alice.id });
    expect(invitation.status).toBe(201);

    await asUser(organizer.cookie).post(`/api/v1/calls/${call.id}/cancel`).send({});

    const stored = await prisma.invitation.findUniqueOrThrow({
      where: { id: invitation.body.data.id },
    });
    // Still ACTIVE: authorization rejects because the CALL is cancelled.
    expect(stored.status).toBe('ACTIVE');
  });
});
