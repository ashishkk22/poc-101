import { describe, expect, it } from 'vitest';
import { prisma } from '../../src/infrastructure/database/prisma.js';
import { CaptionTranscriptionProvider } from '../../src/modules/provider/caption-transcription.provider.js';
import { captionLineRepository } from '../../src/modules/transcripts/caption-line.repository.js';
import { createJoinableScenario } from '../fixtures/factories.js';

/**
 * The transcript is a record of what was said, not a plausible imitation of a
 * meeting. These tests exist because the previous implementation returned
 * convincing sample dialogue for every call, which is worse than returning
 * nothing: it reads exactly like a real record.
 */
const provider = new CaptionTranscriptionProvider();

async function say(
  callId: string,
  speaker: { id: string; name: string },
  text: string,
  secondsIn: number,
) {
  await captionLineRepository.append({
    callId,
    speakerId: speaker.id,
    speakerName: speaker.name,
    text,
    spokenAt: new Date(Date.UTC(2026, 0, 1, 12, 0, secondsIn)),
  });
}

describe('assembling a transcript from what was said', () => {
  it('writes up the real lines, attributed and timed', async () => {
    const { call, organizer, participant } = await createJoinableScenario();

    await say(call.id, organizer, 'Morning — shall we make a start?', 0);
    await say(call.id, participant, 'Yes, ready when you are.', 6);
    await say(call.id, organizer, 'Great, first item then.', 14);

    const result = await provider.getTranscript({
      callId: call.id,
      providerCallId: 'pcall_x',
    });

    expect(result.content).toContain('Morning — shall we make a start?');
    expect(result.content).toContain('Yes, ready when you are.');
    // Offsets run from the first words, not the scheduled start.
    expect(result.content).toContain('[00:00]');
    expect(result.content).toContain('[00:06]');
    expect(result.content).toContain('[00:14]');
  });

  it('names the actual speakers', async () => {
    const { call, organizer, participant } = await createJoinableScenario();

    await say(call.id, organizer, 'One.', 0);
    await say(call.id, participant, 'Two.', 2);

    const result = await provider.getTranscript({ callId: call.id, providerCallId: 'p' });

    expect(result.content).toContain(organizer.name);
    expect(result.content).toContain(participant.name);
    expect(result.content).toContain('2 speakers');
    // The old stub's invented cast must never appear.
    expect(result.content).not.toContain('Speaker 1');
    expect(result.content).not.toContain('Speaker 2');
  });

  it('says nothing was captured rather than inventing a meeting', async () => {
    const { call } = await createJoinableScenario();

    const result = await provider.getTranscript({ callId: call.id, providerCallId: 'p' });

    expect(result.content).toMatch(/no transcript was captured/i);
    expect(result.content).not.toMatch(/thanks everyone for joining/i);
    expect(result.content).not.toContain('[00:00]');
  });

  it('keeps the order people spoke in', async () => {
    const { call, organizer, participant } = await createJoinableScenario();

    // Stored out of order; the transcript must still read chronologically.
    await say(call.id, organizer, 'Third.', 20);
    await say(call.id, participant, 'First.', 0);
    await say(call.id, organizer, 'Second.', 10);

    const result = await provider.getTranscript({ callId: call.id, providerCallId: 'p' });
    const body = result.content;

    expect(body.indexOf('First.')).toBeLessThan(body.indexOf('Second.'));
    expect(body.indexOf('Second.')).toBeLessThan(body.indexOf('Third.'));
  });

  it('keeps one call out of another call transcript', async () => {
    const first = await createJoinableScenario();
    const second = await createJoinableScenario();

    await say(first.call.id, first.organizer, 'Belongs to the first call.', 0);
    await say(second.call.id, second.organizer, 'Belongs to the second call.', 0);

    const result = await provider.getTranscript({ callId: first.call.id, providerCallId: 'p' });

    expect(result.content).toContain('Belongs to the first call.');
    expect(result.content).not.toContain('Belongs to the second call.');
  });

  it('removes the spoken lines when the transcript is deleted', async () => {
    const { call, organizer } = await createJoinableScenario();
    await say(call.id, organizer, 'Something worth forgetting.', 0);

    expect(await captionLineRepository.countForCall(call.id)).toBe(1);

    const removed = await captionLineRepository.deleteForCall(call.id);

    expect(removed).toBe(1);
    expect(await captionLineRepository.countForCall(call.id)).toBe(0);
  });

  it('goes with the call, so nothing outlives what it belonged to', async () => {
    const { call, organizer } = await createJoinableScenario();
    await say(call.id, organizer, 'Gone with the call.', 0);

    await prisma.call.delete({ where: { id: call.id } });

    expect(await captionLineRepository.countForCall(call.id)).toBe(0);
  });
});
