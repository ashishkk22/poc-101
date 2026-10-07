import { env } from '../../config/env.js';
import { logger } from '../../infrastructure/logger/logger.js';
import { MockMeetingProvider } from './mock-meeting.provider.js';
import { CaptionTranscriptionProvider } from './caption-transcription.provider.js';
import { MockTranscriptionProvider } from './mock-transcription.provider.js';
import { type MeetingProvider, type TranscriptionProvider } from './provider.types.js';

/**
 * Provider container.
 *
 * `live` adapters are intentionally unimplemented: the specification treats the
 * real video vendor as an external dependency that is initially mocked. Adding
 * one means implementing the interfaces here and nothing else in the app.
 */
function createMeetingProvider(): MeetingProvider {
  if (env.PROVIDER_MODE === 'live') {
    throw new Error('PROVIDER_MODE=live requires a concrete MeetingProvider implementation');
  }
  logger.info({ provider: 'mock-meeting' }, 'meeting provider initialised');
  return new MockMeetingProvider();
}

/**
 * Transcripts come from the participants themselves.
 *
 * `captions` assembles what was actually said from the lines their browsers
 * transcribed. `mock` returns fixed sample dialogue and exists only so tests
 * can assert the pipeline without anyone speaking.
 */
function createTranscriptionProvider(): TranscriptionProvider {
  if (env.TRANSCRIPTION_MODE === 'live') {
    throw new Error(
      'TRANSCRIPTION_MODE=live requires a concrete TranscriptionProvider implementation',
    );
  }

  if (env.TRANSCRIPTION_MODE === 'mock') {
    logger.info({ provider: 'mock-transcription' }, 'transcription provider initialised');
    return new MockTranscriptionProvider();
  }

  logger.info({ provider: 'caption-transcription' }, 'transcription provider initialised');
  return new CaptionTranscriptionProvider();
}

export const meetingProvider: MeetingProvider = createMeetingProvider();
export const transcriptionProvider: TranscriptionProvider = createTranscriptionProvider();

export * from './provider.types.js';
export * from './failure-mode.js';
export { MockMeetingProvider } from './mock-meeting.provider.js';
export { MockTranscriptionProvider } from './mock-transcription.provider.js';
export { CaptionTranscriptionProvider } from './caption-transcription.provider.js';
