import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import { prisma, resetDatabase } from '../fixtures/db.js';
import { asUser } from '../fixtures/test-app.js';
import { createJoinableScenario } from '../fixtures/factories.js';
import { transcriptService } from '../../src/modules/transcripts/transcript.service.js';
import { retentionService } from '../../src/modules/retention/retention.service.js';
import {
  type MockTranscriptionProvider,
  ProviderFailureMode,
  resetFailureMode,
  setFailureMode,
  transcriptionProvider,
} from '../../src/modules/provider/index.js';
import { addDays } from '../../src/shared/time/window.js';

const mockTranscription = transcriptionProvider as MockTranscriptionProvider;

beforeEach(async () => {
  await resetDatabase();
  mockTranscription.reset();
});

afterEach(() => {
  resetFailureMode();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('transcript generation', () => {
  it('produces a READY transcript and audits it', async () => {
    const { call } = await createJoinableScenario();

    const outcome = await transcriptService.generate(call.id, { requestId: 'test' }, 1);
    expect(outcome).toBe('READY');

    const transcript = await prisma.transcript.findUniqueOrThrow({ where: { callId: call.id } });
    expect(transcript.status).toBe('READY');
    expect(transcript.content).toContain('Transcript for call');
    expect(transcript.expiresAt).not.toBeNull();

    const audit = await prisma.auditEvent.findFirst({
      where: { callId: call.id, action: 'TRANSCRIPT_READY' },
    });
    expect(audit?.outcome).toBe('SUCCESS');
    // Content length is recorded; content itself is not.
    expect(JSON.stringify(audit?.metadata)).not.toContain('Speaker 1');
  });

  it('skips regeneration once a transcript is READY', async () => {
    const { call } = await createJoinableScenario();

    await transcriptService.generate(call.id, { requestId: 'test' }, 1);
    const first = await prisma.transcript.findUniqueOrThrow({ where: { callId: call.id } });

    const second = await transcriptService.generate(call.id, { requestId: 'test' }, 2);
    expect(second).toBe('SKIPPED');

    const after = await prisma.transcript.findUniqueOrThrow({ where: { callId: call.id } });
    expect(after.generatedAt?.toISOString()).toBe(first.generatedAt?.toISOString());
  });

  it('marks FAILED and rethrows so the queue can retry, then succeeds on a later attempt', async () => {
    const { call } = await createJoinableScenario();

    // Two transient provider failures, then success — the shape of a real retry.
    mockTranscription.failNextTranscriptAttempts(2);

    await expect(transcriptService.generate(call.id, { requestId: 'test' }, 1)).rejects.toThrow();
    let transcript = await prisma.transcript.findUniqueOrThrow({ where: { callId: call.id } });
    expect(transcript.status).toBe('FAILED');

    await expect(transcriptService.generate(call.id, { requestId: 'test' }, 2)).rejects.toThrow();

    const outcome = await transcriptService.generate(call.id, { requestId: 'test' }, 3);
    expect(outcome).toBe('READY');

    transcript = await prisma.transcript.findUniqueOrThrow({ where: { callId: call.id } });
    expect(transcript.status).toBe('READY');
    expect(transcript.attempts).toBe(3);
    expect(transcript.failureCode).toBeNull();
  });

  it('does not corrupt attendance when transcription fails', async () => {
    const { participant, call, rawToken } = await createJoinableScenario();

    await asUser(participant.cookie).post(`/api/v1/join/${rawToken}/authorize`).send({});
    const before = await prisma.attendance.findFirstOrThrow({ where: { callId: call.id } });

    setFailureMode(ProviderFailureMode.TRANSCRIPT_FAILURE);
    await expect(transcriptService.generate(call.id, { requestId: 'test' }, 1)).rejects.toThrow();

    const after = await prisma.attendance.findFirstOrThrow({ where: { callId: call.id } });
    expect(after.status).toBe(before.status);
    expect(after.totalConnectedSeconds).toBe(before.totalConnectedSeconds);
    expect(await prisma.attendanceSession.count({ where: { status: 'CONNECTED' } })).toBe(1);
  });
});

describe('transcript access', () => {
  it('returns 409 while the transcript is still pending', async () => {
    const { organizer, call } = await createJoinableScenario();
    await transcriptService.ensureForCall(call.id);

    const response = await asUser(organizer.cookie).get(`/api/v1/calls/${call.id}/transcript`);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('TRANSCRIPT_NOT_READY');
  });

  it('returns 404 once the transcript has been deleted by retention', async () => {
    const { organizer, call } = await createJoinableScenario();
    await transcriptService.generate(call.id, { requestId: 'test' }, 1);

    await prisma.transcript.update({
      where: { callId: call.id },
      data: { expiresAt: addDays(new Date(), -1) },
    });
    await retentionService.runSweep();

    const response = await asUser(organizer.cookie).get(`/api/v1/calls/${call.id}/transcript`);
    expect(response.status).toBe(404);
  });
});

describe('retention', () => {
  it('deletes an eligible transcript, preserves a fresh one, and audits the deletion', async () => {
    const eligible = await createJoinableScenario();
    const fresh = await createJoinableScenario();

    await transcriptService.generate(eligible.call.id, { requestId: 'test' }, 1);
    await transcriptService.generate(fresh.call.id, { requestId: 'test' }, 1);

    await prisma.transcript.update({
      where: { callId: eligible.call.id },
      data: { expiresAt: addDays(new Date(), -1) },
    });

    const result = await retentionService.runSweep();
    expect(result.deleted).toBe(1);

    const deleted = await prisma.transcript.findUniqueOrThrow({
      where: { callId: eligible.call.id },
    });
    expect(deleted.status).toBe('DELETED');
    expect(deleted.content).toBeNull();
    expect(deleted.deletedAt).not.toBeNull();

    const preserved = await prisma.transcript.findUniqueOrThrow({
      where: { callId: fresh.call.id },
    });
    expect(preserved.status).toBe('READY');
    expect(preserved.content).not.toBeNull();

    const audit = await prisma.auditEvent.findFirst({
      where: { callId: eligible.call.id, action: 'TRANSCRIPT_DELETED' },
    });
    expect(audit?.outcome).toBe('SUCCESS');
  });

  it('is a no-op on the second run — running the job twice is safe', async () => {
    const { call } = await createJoinableScenario();
    await transcriptService.generate(call.id, { requestId: 'test' }, 1);
    await prisma.transcript.update({
      where: { callId: call.id },
      data: { expiresAt: addDays(new Date(), -1) },
    });

    const first = await retentionService.runSweep();
    expect(first.deleted).toBe(1);

    const second = await retentionService.runSweep();
    expect(second.deleted).toBe(0);
    expect(second.examined).toBe(0);

    // Exactly one deletion audit event, no matter how often the job runs.
    const events = await prisma.auditEvent.count({
      where: { callId: call.id, action: 'TRANSCRIPT_DELETED' },
    });
    expect(events).toBe(1);
  });

  it('treats a targeted delete of an already-deleted transcript as a no-op', async () => {
    const { call } = await createJoinableScenario();
    await transcriptService.generate(call.id, { requestId: 'test' }, 1);
    const transcript = await prisma.transcript.findUniqueOrThrow({ where: { callId: call.id } });

    expect(await retentionService.deleteTranscript(transcript.id)).toBe('DELETED');
    expect(await retentionService.deleteTranscript(transcript.id)).toBe('NOOP');
    expect(await retentionService.deleteTranscript('transcript_missing')).toBe('NOOP');
  });
});
