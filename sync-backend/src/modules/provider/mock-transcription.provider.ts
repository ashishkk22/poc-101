import { applySlowness, getFailureMode } from './failure-mode.js';
import {
  ProviderError,
  ProviderFailureMode,
  type CaptionEvent,
  type CaptionInput,
  type TranscriptInput,
  type TranscriptResult,
  type TranscriptionProvider,
} from './provider.types.js';

/**
 * Deterministic transcription stub.
 *
 * Caption failures and transcript failures are separate failure modes because
 * they have different blast radii: a caption failure must not end a call, and
 * a transcript failure must not corrupt attendance.
 */
export class MockTranscriptionProvider implements TranscriptionProvider {
  readonly name = 'mock-transcription';

  /** Successive transcript attempts that should fail before succeeding. */
  private transientFailuresRemaining = 0;

  async getLiveCaptions(input: CaptionInput): Promise<CaptionEvent[]> {
    await applySlowness();

    if (getFailureMode() === ProviderFailureMode.CAPTION_FAILURE) {
      throw new ProviderError('mock caption stream unavailable', {
        retryable: true,
        category: 'CAPTION_FAILURE',
      });
    }

    const at = input.since ?? new Date();
    return [
      { at, speakerLabel: 'Speaker 1', text: 'Thanks everyone for joining.' },
      { at: new Date(at.getTime() + 4000), speakerLabel: 'Speaker 2', text: 'Happy to be here.' },
    ];
  }

  async getTranscript(input: TranscriptInput): Promise<TranscriptResult> {
    await applySlowness();

    if (this.transientFailuresRemaining > 0) {
      this.transientFailuresRemaining -= 1;
      throw new ProviderError('mock transcription temporarily unavailable', {
        retryable: true,
        category: 'TRANSCRIPT_TRANSIENT_FAILURE',
      });
    }

    if (getFailureMode() === ProviderFailureMode.TRANSCRIPT_FAILURE) {
      throw new ProviderError('mock transcription failed', {
        retryable: true,
        category: 'TRANSCRIPT_FAILURE',
      });
    }

    const generatedAt = new Date();
    const content = [
      `Transcript for call ${input.callId}`,
      '',
      '[00:00] Speaker 1: Thanks everyone for joining.',
      '[00:04] Speaker 2: Happy to be here.',
      '[00:12] Speaker 1: Lets walk through the agenda.',
    ].join('\n');

    return { content, generatedAt };
  }

  // --- test affordances -----------------------------------------------------

  failNextTranscriptAttempts(count: number): void {
    this.transientFailuresRemaining = count;
  }

  reset(): void {
    this.transientFailuresRemaining = 0;
  }
}
