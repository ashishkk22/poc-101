import { ERROR_MESSAGES, ERROR_STATUS, ErrorCode } from './error-codes.js';

export interface AppErrorOptions {
  /** Overrides the default safe message. Must never leak internals. */
  message?: string;
  /** Structured, non-sensitive detail returned to the client. */
  details?: unknown;
  /** Original error, logged but never serialized to the client. */
  cause?: unknown;
  /** Overrides the default status mapping. */
  status?: number;
}

/** Every error crossing the HTTP boundary is (or becomes) an AppError. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;
  readonly isAppError = true as const;

  constructor(code: ErrorCode, options: AppErrorOptions = {}) {
    super(options.message ?? ERROR_MESSAGES[code], { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.status = options.status ?? ERROR_STATUS[code];
    this.details = options.details;
    Error.captureStackTrace?.(this, AppError);
  }

  static isAppError(value: unknown): value is AppError {
    return (
      value instanceof AppError ||
      (typeof value === 'object' && value !== null && 'isAppError' in value)
    );
  }
}

export const authenticationRequired = (message?: string) =>
  new AppError(ErrorCode.AUTHENTICATION_REQUIRED, { message });

export const forbidden = (message?: string) => new AppError(ErrorCode.FORBIDDEN, { message });

export const notFound = (code: ErrorCode = ErrorCode.RESOURCE_NOT_FOUND) => new AppError(code);

export const validationError = (details?: unknown) =>
  new AppError(ErrorCode.VALIDATION_ERROR, { details });

export const conflict = (message?: string) => new AppError(ErrorCode.CONFLICT, { message });

export const businessRuleFailure = (message?: string) =>
  new AppError(ErrorCode.BUSINESS_RULE_FAILURE, { message });

export const providerUnavailable = (cause?: unknown) =>
  new AppError(ErrorCode.PROVIDER_UNAVAILABLE, { cause });

export const internalError = (cause?: unknown) => new AppError(ErrorCode.INTERNAL_ERROR, { cause });
