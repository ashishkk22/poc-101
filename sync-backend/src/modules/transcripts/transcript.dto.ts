import { type TranscriptStatus } from '../../generated/prisma/enums.js';

/** Storage internals (attempts, failure codes, raw rows) never cross the API. */
export interface TranscriptDto {
  callId: string;
  status: TranscriptStatus;
  content?: string;
  generatedAt: string | null;
  expiresAt: string | null;
}

export function toTranscriptDto(
  transcript: {
    callId: string;
    status: TranscriptStatus;
    content: string | null;
    generatedAt: Date | null;
    expiresAt: Date | null;
  },
  includeContent: boolean,
): TranscriptDto {
  return {
    callId: transcript.callId,
    status: transcript.status,
    ...(includeContent && transcript.content !== null ? { content: transcript.content } : {}),
    generatedAt: transcript.generatedAt ? transcript.generatedAt.toISOString() : null,
    expiresAt: transcript.expiresAt ? transcript.expiresAt.toISOString() : null,
  };
}
