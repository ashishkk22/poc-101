/**
 * Stable, client-facing error codes.
 *
 * These are part of the API contract — never rename one without versioning.
 */
export const ErrorCode = {
  AUTHENTICATION_REQUIRED: 'AUTHENTICATION_REQUIRED',
  FORBIDDEN: 'FORBIDDEN',
  VALIDATION_ERROR: 'VALIDATION_ERROR',

  CALL_NOT_FOUND: 'CALL_NOT_FOUND',
  CALL_NOT_JOINABLE: 'CALL_NOT_JOINABLE',
  CALL_CANCELLED: 'CALL_CANCELLED',

  INVITE_NOT_FOUND: 'INVITE_NOT_FOUND',
  INVITE_REVOKED: 'INVITE_REVOKED',
  INVITE_EXPIRED: 'INVITE_EXPIRED',
  PARTICIPANT_MISMATCH: 'PARTICIPANT_MISMATCH',

  JOIN_WINDOW_NOT_OPEN: 'JOIN_WINDOW_NOT_OPEN',
  JOIN_WINDOW_CLOSED: 'JOIN_WINDOW_CLOSED',

  TRANSCRIPT_NOT_READY: 'TRANSCRIPT_NOT_READY',
  TRANSCRIPT_ACCESS_DENIED: 'TRANSCRIPT_ACCESS_DENIED',

  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  RATE_LIMITED: 'RATE_LIMITED',
  CONFLICT: 'CONFLICT',
  BUSINESS_RULE_FAILURE: 'BUSINESS_RULE_FAILURE',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Error code → HTTP status. Kept in one place so mapping cannot drift. */
export const ERROR_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  AUTHENTICATION_REQUIRED: 401,
  FORBIDDEN: 403,
  INVITE_REVOKED: 403,
  INVITE_EXPIRED: 403,
  PARTICIPANT_MISMATCH: 403,
  JOIN_WINDOW_NOT_OPEN: 403,
  JOIN_WINDOW_CLOSED: 403,
  CALL_CANCELLED: 403,
  CALL_NOT_JOINABLE: 403,
  TRANSCRIPT_ACCESS_DENIED: 403,
  CALL_NOT_FOUND: 404,
  INVITE_NOT_FOUND: 404,
  RESOURCE_NOT_FOUND: 404,
  CONFLICT: 409,
  TRANSCRIPT_NOT_READY: 409,
  BUSINESS_RULE_FAILURE: 422,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  PROVIDER_UNAVAILABLE: 503,
};

/** Safe, non-revealing default messages. */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  AUTHENTICATION_REQUIRED: 'Authentication is required.',
  FORBIDDEN: 'You are not allowed to perform this action.',
  VALIDATION_ERROR: 'The request payload is invalid.',
  CALL_NOT_FOUND: 'Call not found.',
  CALL_NOT_JOINABLE: 'This call cannot be joined right now.',
  CALL_CANCELLED: 'This call has been cancelled.',
  INVITE_NOT_FOUND: 'This invitation is not valid.',
  INVITE_REVOKED: 'This invitation is no longer valid.',
  INVITE_EXPIRED: 'This invitation has expired.',
  PARTICIPANT_MISMATCH: 'This invitation was not issued to you.',
  JOIN_WINDOW_NOT_OPEN: 'This call has not started yet.',
  JOIN_WINDOW_CLOSED: 'This call has already ended.',
  TRANSCRIPT_NOT_READY: 'The transcript is not ready yet.',
  TRANSCRIPT_ACCESS_DENIED: 'You are not allowed to read this transcript.',
  PROVIDER_UNAVAILABLE: 'The meeting provider is currently unavailable.',
  RATE_LIMITED: 'Too many requests. Please slow down.',
  CONFLICT: 'The request conflicts with the current state of the resource.',
  BUSINESS_RULE_FAILURE: 'The request violates a business rule.',
  RESOURCE_NOT_FOUND: 'Resource not found.',
  INTERNAL_ERROR: 'An unexpected error occurred.',
};
