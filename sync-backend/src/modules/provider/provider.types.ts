/**
 * External meeting/transcription providers are dependencies, never authorities.
 *
 * Nothing behind these interfaces is allowed to influence whether a user is
 * permitted to join a call. Provider outages degrade media, not authorization.
 */

export interface CreateMeetingInput {
  callId: string;
  title: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  requestId?: string;
}

export interface CreateMeetingResult {
  providerCallId: string;
}

export interface IssueParticipantSessionInput {
  providerCallId: string;
  callId: string;
  participantId: string;
  attendanceSessionId: string;
  /** Hard upper bound: never later than the scheduled end of the call. */
  expiresAt: Date;
  requestId?: string;
}

export interface IssueParticipantSessionResult {
  providerSessionId: string;
  expiresAt: Date;
}

export interface RevokeParticipantSessionInput {
  providerCallId: string | null;
  providerSessionId: string;
  reason: string;
  requestId?: string;
}

export interface EndMeetingInput {
  providerCallId: string;
  reason: string;
  requestId?: string;
}

export interface MeetingProvider {
  readonly name: string;
  createMeeting(input: CreateMeetingInput): Promise<CreateMeetingResult>;
  issueParticipantSession(
    input: IssueParticipantSessionInput,
  ): Promise<IssueParticipantSessionResult>;
  revokeParticipantSession(input: RevokeParticipantSessionInput): Promise<void>;
  endMeeting(input: EndMeetingInput): Promise<void>;
}

export interface CaptionInput {
  providerCallId: string;
  since?: Date;
  requestId?: string;
}

export interface CaptionEvent {
  at: Date;
  speakerLabel: string;
  text: string;
}

export interface TranscriptInput {
  providerCallId: string;
  callId: string;
  requestId?: string;
}

export interface TranscriptResult {
  content: string;
  generatedAt: Date;
}

export interface TranscriptionProvider {
  readonly name: string;
  getLiveCaptions(input: CaptionInput): Promise<CaptionEvent[]>;
  getTranscript(input: TranscriptInput): Promise<TranscriptResult>;
}

/** Deterministic failure injection for demos and tests. */
export const ProviderFailureMode = {
  HEALTHY: 'HEALTHY',
  SLOW: 'SLOW',
  JOIN_FAILURE: 'JOIN_FAILURE',
  CAPTION_FAILURE: 'CAPTION_FAILURE',
  TRANSCRIPT_FAILURE: 'TRANSCRIPT_FAILURE',
  REVOKE_FAILURE: 'REVOKE_FAILURE',
} as const;

export type ProviderFailureMode = (typeof ProviderFailureMode)[keyof typeof ProviderFailureMode];

export class ProviderError extends Error {
  readonly retryable: boolean;
  readonly category: string;

  constructor(message: string, options: { retryable?: boolean; category?: string } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.retryable = options.retryable ?? true;
    this.category = options.category ?? 'PROVIDER_ERROR';
  }
}
