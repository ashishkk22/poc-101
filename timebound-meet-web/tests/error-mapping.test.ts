import { describe, expect, it } from 'vitest';
import { ApiError, toDisplayError, toErrorMessage } from '@/lib/errors';
import { shouldRetry } from '@/app/query-client';

describe('error mapping', () => {
  it('maps backend codes to user-facing copy', () => {
    const display = toDisplayError(
      new ApiError({
        code: 'INVITE_REVOKED',
        message: 'This invitation is no longer valid.',
        status: 403,
        requestId: 'req_123',
      }),
    );

    expect(display.title).toBe('You were removed from this call');
    expect(display.description).toMatch(/took you off the guest list/i);
  });

  it('preserves the request id for support', () => {
    const display = toDisplayError(
      new ApiError({ code: 'INTERNAL_ERROR', message: 'boom', status: 500, requestId: 'req_9' }),
    );

    expect(display.requestId).toBe('req_9');
  });

  it('never leaks an unmapped internal message for an unknown error', () => {
    const display = toDisplayError(new Error('connection string postgres://secret'));

    expect(display.description).not.toMatch(/postgres/);
    expect(display.code).toBe('INTERNAL_ERROR');
  });

  it('surfaces validation detail over the generic message', () => {
    expect(
      toErrorMessage(
        new ApiError({
          code: 'VALIDATION_ERROR',
          message: 'The request payload is invalid.',
          status: 400,
          details: [{ path: 'scheduledEnd', message: 'scheduledEnd must be after scheduledStart' }],
        }),
      ),
    ).toMatch(/must be after/);
  });

  it('maps each join denial code to its own message', () => {
    const codes = [
      'INVITE_REVOKED',
      'INVITE_EXPIRED',
      'JOIN_WINDOW_NOT_OPEN',
      'JOIN_WINDOW_CLOSED',
      'PARTICIPANT_MISMATCH',
      'PROVIDER_UNAVAILABLE',
    ];

    const descriptions = codes.map((code) =>
      toDisplayError(new ApiError({ code, message: 'x', status: 403 })).description,
    );

    expect(new Set(descriptions).size).toBe(codes.length);
  });
});

describe('server message preference', () => {
  it("keeps the backend's specific business-rule copy", () => {
    // The backend knows the organizer already invited this person; no generic
    // "action conflicts" message is as useful as saying so.
    const display = toDisplayError(
      new ApiError({
        code: 'CONFLICT',
        message: 'This participant has already been invited to this call.',
        status: 409,
      }),
    );

    expect(display.description).toMatch(/already been invited/i);
  });

  it('keeps a business-rule explanation verbatim', () => {
    const display = toDisplayError(
      new ApiError({
        code: 'BUSINESS_RULE_FAILURE',
        message: 'The organizer does not need an invitation.',
        status: 422,
      }),
    );

    expect(display.description).toBe('The organizer does not need an invitation.');
  });

  it('does not let a security code be overridden by a server message', () => {
    const display = toDisplayError(
      new ApiError({
        code: 'INVITE_REVOKED',
        message: 'invitation has been revoked',
        status: 403,
      }),
    );

    expect(display.description).toMatch(/took you off the guest list/i);
  });

  it('maps every Better Auth code it receives', () => {
    for (const [code, expected] of [
      ['INVALID_EMAIL_OR_PASSWORD', /doesn't match/i],
      ['PASSWORD_TOO_SHORT', /12 characters/i],
      ['USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL', /that email is taken/i],
      ['INVALID_EMAIL', /double-check it/i],
    ] as const) {
      const display = toDisplayError(
        new ApiError({ code, message: 'server copy', status: 400 }),
      );
      expect(display.description).toMatch(expected);
    }
  });
});

describe('retry policy', () => {
  it('does not retry an authorization decision', () => {
    for (const code of ['INVITE_REVOKED', 'FORBIDDEN', 'AUTHENTICATION_REQUIRED']) {
      expect(shouldRetry(0, new ApiError({ code, message: 'x', status: 403 }))).toBe(false);
    }
  });

  it('retries a transient server failure', () => {
    expect(shouldRetry(0, new ApiError({ code: 'INTERNAL_ERROR', message: 'x', status: 500 }))).toBe(
      true,
    );
  });
});

describe('rate limiting', () => {
  it("quotes the backend's Retry-After rather than guessing", () => {
    const display = toDisplayError(
      new ApiError({
        code: 'RATE_LIMITED',
        message: 'Too many requests. Please slow down.',
        status: 429,
        retryAfterSeconds: 45,
      }),
    );

    expect(display.description).toMatch(/about 45 seconds/i);
  });

  it('rounds a longer wait into minutes', () => {
    const display = toDisplayError(
      new ApiError({ code: 'RATE_LIMITED', message: 'slow down', status: 429, retryAfterSeconds: 90 }),
    );

    expect(display.description).toMatch(/about 2 minutes/i);
  });

  it('falls back to generic copy when the header is absent', () => {
    const display = toDisplayError(
      new ApiError({ code: 'RATE_LIMITED', message: 'slow down', status: 429 }),
    );

    expect(display.description).toMatch(/breather/i);
  });
});
