import { randomUUID } from 'node:crypto';
import { logger } from '../../infrastructure/logger/logger.js';
import { applySlowness, getFailureMode } from './failure-mode.js';
import {
  ProviderError,
  ProviderFailureMode,
  type CreateMeetingInput,
  type CreateMeetingResult,
  type EndMeetingInput,
  type IssueParticipantSessionInput,
  type IssueParticipantSessionResult,
  type MeetingProvider,
  type RevokeParticipantSessionInput,
} from './provider.types.js';

interface MockSession {
  providerSessionId: string;
  providerCallId: string;
  participantId: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

/**
 * In-memory meeting provider.
 *
 * Its internal state exists so tests can assert that provider sessions were
 * actually revoked. It is never consulted for authorization.
 */
export class MockMeetingProvider implements MeetingProvider {
  readonly name = 'mock-meeting';

  private readonly meetings = new Map<string, { callId: string; endedAt: Date | null }>();
  private readonly sessions = new Map<string, MockSession>();

  async createMeeting(input: CreateMeetingInput): Promise<CreateMeetingResult> {
    await applySlowness();
    const providerCallId = `pcall_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
    this.meetings.set(providerCallId, { callId: input.callId, endedAt: null });
    return { providerCallId };
  }

  async issueParticipantSession(
    input: IssueParticipantSessionInput,
  ): Promise<IssueParticipantSessionResult> {
    await applySlowness();

    if (getFailureMode() === ProviderFailureMode.JOIN_FAILURE) {
      throw new ProviderError('mock provider refused to issue a participant session', {
        retryable: true,
        category: 'JOIN_FAILURE',
      });
    }

    const providerSessionId = `psess_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
    this.sessions.set(providerSessionId, {
      providerSessionId,
      providerCallId: input.providerCallId,
      participantId: input.participantId,
      expiresAt: input.expiresAt,
      revokedAt: null,
    });

    return { providerSessionId, expiresAt: input.expiresAt };
  }

  async revokeParticipantSession(input: RevokeParticipantSessionInput): Promise<void> {
    await applySlowness();

    if (getFailureMode() === ProviderFailureMode.REVOKE_FAILURE) {
      throw new ProviderError('mock provider failed to revoke the participant session', {
        retryable: true,
        category: 'REVOKE_FAILURE',
      });
    }

    const session = this.sessions.get(input.providerSessionId);
    if (!session) {
      // Idempotent: revoking an unknown/already-cleaned session is a no-op.
      logger.debug({ providerSessionId: input.providerSessionId }, 'mock revoke: unknown session');
      return;
    }
    session.revokedAt = new Date();
  }

  async endMeeting(input: EndMeetingInput): Promise<void> {
    await applySlowness();
    const meeting = this.meetings.get(input.providerCallId);
    if (meeting) meeting.endedAt = new Date();
    for (const session of this.sessions.values()) {
      if (session.providerCallId === input.providerCallId && !session.revokedAt) {
        session.revokedAt = new Date();
      }
    }
  }

  // --- test affordances -----------------------------------------------------

  isSessionRevoked(providerSessionId: string): boolean {
    return this.sessions.get(providerSessionId)?.revokedAt !== null;
  }

  hasSession(providerSessionId: string): boolean {
    return this.sessions.has(providerSessionId);
  }

  reset(): void {
    this.meetings.clear();
    this.sessions.clear();
  }
}
