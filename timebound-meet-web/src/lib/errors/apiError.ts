/**
 * The single error shape the rest of the application handles.
 *
 * The backend answers every failure with
 * `{ error: { code, message, requestId, details? } }`; this class is that
 * envelope, plus the transport failures that never reach the backend at all.
 */
export interface ApiErrorDetail {
  path: string;
  message: string;
}

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly requestId: string | null;
  readonly details: ApiErrorDetail[] | null;
  /** Seconds to wait, from the backend's `Retry-After` on a 429. */
  readonly retryAfterSeconds: number | null;

  constructor(options: {
    code: string;
    message: string;
    status: number;
    requestId?: string | null;
    details?: ApiErrorDetail[] | null;
    retryAfterSeconds?: number | null;
  }) {
    super(options.message);
    this.name = "ApiError";
    this.code = options.code;
    this.status = options.status;
    this.requestId = options.requestId ?? null;
    this.details = options.details ?? null;
    this.retryAfterSeconds = options.retryAfterSeconds ?? null;
  }

  static isApiError(error: unknown): error is ApiError {
    return error instanceof ApiError;
  }

  /** A network failure, an aborted request, or a non-JSON response. */
  static network(message = "Unable to reach the server."): ApiError {
    return new ApiError({ code: "NETWORK_ERROR", message, status: 0 });
  }
}

/** Stable codes the UI branches on. Mirrors the backend contract. */
export const ErrorCode = {
  AUTHENTICATION_REQUIRED: "AUTHENTICATION_REQUIRED",
  FORBIDDEN: "FORBIDDEN",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  CALL_NOT_FOUND: "CALL_NOT_FOUND",
  CALL_NOT_JOINABLE: "CALL_NOT_JOINABLE",
  CALL_CANCELLED: "CALL_CANCELLED",
  INVITE_NOT_FOUND: "INVITE_NOT_FOUND",
  INVITE_REVOKED: "INVITE_REVOKED",
  INVITE_EXPIRED: "INVITE_EXPIRED",
  PARTICIPANT_MISMATCH: "PARTICIPANT_MISMATCH",
  JOIN_WINDOW_NOT_OPEN: "JOIN_WINDOW_NOT_OPEN",
  JOIN_WINDOW_CLOSED: "JOIN_WINDOW_CLOSED",
  TRANSCRIPT_NOT_READY: "TRANSCRIPT_NOT_READY",
  TRANSCRIPT_ACCESS_DENIED: "TRANSCRIPT_ACCESS_DENIED",
  PROVIDER_UNAVAILABLE: "PROVIDER_UNAVAILABLE",
  RATE_LIMITED: "RATE_LIMITED",
  CONFLICT: "CONFLICT",
  BUSINESS_RULE_FAILURE: "BUSINESS_RULE_FAILURE",
  RESOURCE_NOT_FOUND: "RESOURCE_NOT_FOUND",
  INTERNAL_ERROR: "INTERNAL_ERROR",
  NETWORK_ERROR: "NETWORK_ERROR",

  // Better Auth's own codes, which arrive in a flat envelope.
  INVALID_EMAIL_OR_PASSWORD: "INVALID_EMAIL_OR_PASSWORD",
  INVALID_EMAIL: "INVALID_EMAIL",
  PASSWORD_TOO_SHORT: "PASSWORD_TOO_SHORT",
  PASSWORD_TOO_LONG: "PASSWORD_TOO_LONG",
  USER_ALREADY_EXISTS: "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
  FAILED_TO_CREATE_USER: "FAILED_TO_CREATE_USER",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];
