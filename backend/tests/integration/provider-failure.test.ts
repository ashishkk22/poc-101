/**
 * Provider isolation.
 *
 * The rule under test: application authorization never depends on external
 * provider health. A provider outage degrades media, never permissions.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma, resetDatabase } from '../fixtures/db.js';
import { asUser } from '../fixtures/test-app.js';
import { createJoinableScenario } from '../fixtures/factories.js';
import {
  type MockMeetingProvider,
  type MockTranscriptionProvider,
  ProviderFailureMode,
  meetingProvider,
  resetFailureMode,
  setFailureMode,
  transcriptionProvider,
} from '../../src/modules/provider/index.js';

const mockMeeting = meetingProvider as MockMeetingProvider;
const mockTranscription = transcriptionProvider as MockTranscriptionProvider;

beforeEach(async () => {
  await resetDatabase();
  mockMeeting.reset();
  mockTranscription.reset();
});

afterEach(() => {
  resetFailureMode();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('provider join failure', () => {
  it('returns PROVIDER_UNAVAILABLE without falsely marking the participant connected', async () => {
    const { participant, call, rawToken } = await createJoinableScenario();
    setFailureMode(ProviderFailureMode.JOIN_FAILURE);

    const response = await asUser(participant.cookie)
      .post(`/api/v1/join/${rawToken}/authorize`)
      .send({});

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('PROVIDER_UNAVAILABLE');

    // No attendance session was opened.
    expect(await prisma.attendanceSession.count()).toBe(0);

    const failure = await prisma.auditEvent.findFirst({
      where: { callId: call.id, action: 'PROVIDER_FAILURE' },
    });
    expect(failure?.outcome).toBe('FAILURE');
  });

  it('leaves the invitation fully intact so a later join succeeds', async () => {
    const { participant, invitation, rawToken } = await createJoinableScenario();

    setFailureMode(ProviderFailureMode.JOIN_FAILURE);
    await asUser(participant.cookie).post(`/api/v1/join/${rawToken}/authorize`).send({});

    const stored = await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } });
    expect(stored.status).toBe('ACTIVE');
    expect(stored.revokedAt).toBeNull();

    // Provider recovers; authorization state was never touched.
    resetFailureMode();
    const retry = await asUser(participant.cookie)
      .post(`/api/v1/join/${rawToken}/authorize`)
      .send({});
    expect(retry.status).toBe(200);
  });
});

describe('provider revoke failure', () => {
  it('does not reactivate the invitation when provider cleanup fails', async () => {
    const { organizer, participant, invitation, rawToken } = await createJoinableScenario();

    await asUser(participant.cookie).post(`/api/v1/join/${rawToken}/authorize`).send({});

    setFailureMode(ProviderFailureMode.REVOKE_FAILURE);

    const revoked = await asUser(organizer.cookie)
      .post(`/api/v1/invitations/${invitation.id}/revoke`)
      .send({});

    // The application-side revoke succeeds regardless of the provider.
    expect(revoked.status).toBe(200);

    const stored = await prisma.invitation.findUniqueOrThrow({ where: { id: invitation.id } });
    expect(stored.status).toBe('REVOKED');

    // And the credential is still dead.
    const replay = await asUser(participant.cookie)
      .post(`/api/v1/join/${rawToken}/authorize`)
      .send({});
    expect(replay.status).toBe(403);
    expect(replay.body.error.code).toBe('INVITE_REVOKED');
  });
});

describe('caption failure', () => {
  it('does not end the call or affect authorization', async () => {
    const { participant, call, rawToken } = await createJoinableScenario();

    const joined = await asUser(participant.cookie)
      .post(`/api/v1/join/${rawToken}/authorize`)
      .send({});
    expect(joined.status).toBe(200);

    setFailureMode(ProviderFailureMode.CAPTION_FAILURE);

    await expect(
      transcriptionProvider.getLiveCaptions({ providerCallId: call.providerCallId! }),
    ).rejects.toThrow();

    // The call is untouched and the participant stays authorized.
    const stored = await prisma.call.findUniqueOrThrow({ where: { id: call.id } });
    expect(stored.status).not.toBe('ENDED');

    const heartbeat = await asUser(participant.cookie)
      .post(`/api/v1/join/${rawToken}/heartbeat`)
      .send({});
    expect(heartbeat.status).toBe(200);
  });
});

describe('provider slowness', () => {
  it('still admits the participant when the provider is merely slow', async () => {
    const { participant, rawToken } = await createJoinableScenario();
    setFailureMode(ProviderFailureMode.SLOW);

    const response = await asUser(participant.cookie)
      .post(`/api/v1/join/${rawToken}/authorize`)
      .send({});

    expect(response.status).toBe(200);
  });
});
