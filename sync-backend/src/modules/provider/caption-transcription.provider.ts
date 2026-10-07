import { callRepository } from '../calls/call.repository.js';
import { captionLineRepository } from '../transcripts/caption-line.repository.js';
import {
  type CaptionEvent,
  type CaptionInput,
  type TranscriptInput,
  type TranscriptResult,
  type TranscriptionProvider,
} from './provider.types.js';

/**
 * Builds the transcript from what participants actually said.
 *
 * There is no media server to transcribe centrally, so each browser
 * transcribes its own microphone and the server keeps the settled lines. This
 * provider simply assembles them. It invents nothing: a call where nobody
 * turned captions on produces a transcript that says exactly that, rather
 * than plausible-looking dialogue that never happened.
 */
export class CaptionTranscriptionProvider implements TranscriptionProvider {
  readonly name = 'caption-transcription';

  /**
   * Live captions are delivered to clients over the realtime channel as they
   * are spoken, so there is nothing to poll for here.
   */
  async getLiveCaptions(_input: CaptionInput): Promise<CaptionEvent[]> {
    return [];
  }

  async getTranscript(input: TranscriptInput): Promise<TranscriptResult> {
    const [call, lines] = await Promise.all([
      callRepository.findById(input.callId),
      captionLineRepository.listForCall(input.callId),
    ]);

    const generatedAt = new Date();
    const title = call?.title ?? 'Meeting';

    if (lines.length === 0) {
      return {
        content: [
          title,
          '',
          'No transcript was captured for this meeting.',
          '',
          'Captions are turned on per person, so a meeting is only written up',
          'when at least one participant switches them on during the call.',
        ].join('\n'),
        generatedAt,
      };
    }

    // Offsets run from the first thing said, not the scheduled start: a
    // meeting that begins late should not open with ten minutes of silence.
    const origin = lines[0]!.spokenAt.getTime();

    const body = lines.map((line) => {
      const offset = Math.max(0, Math.round((line.spokenAt.getTime() - origin) / 1000));
      return `[${formatOffset(offset)}] ${line.speakerName}: ${line.text}`;
    });

    const speakers = [...new Set(lines.map((line) => line.speakerName))];

    return {
      content: [
        title,
        `${speakers.length} ${speakers.length === 1 ? 'speaker' : 'speakers'}: ${speakers.join(', ')}`,
        '',
        ...body,
      ].join('\n'),
      generatedAt,
    };
  }
}

function formatOffset(totalSeconds: number): string {
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);

  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}
