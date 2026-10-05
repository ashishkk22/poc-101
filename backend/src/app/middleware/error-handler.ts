import { type NextFunction, type Request, type Response } from 'express';
import { ZodError } from 'zod';
import { logger } from '../../infrastructure/logger/logger.js';
import { AppError, ErrorCode, ERROR_MESSAGES, ERROR_STATUS } from '../../shared/errors/index.js';
import { ProviderError } from '../../modules/provider/provider.types.js';

interface ErrorBody {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  };
}

function toAppError(error: unknown): AppError {
  if (AppError.isAppError(error)) return error as AppError;

  if (error instanceof ZodError) {
    return new AppError(ErrorCode.VALIDATION_ERROR, {
      details: error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    });
  }

  if (error instanceof ProviderError) {
    return new AppError(ErrorCode.PROVIDER_UNAVAILABLE, { cause: error });
  }

  if (
    error instanceof SyntaxError &&
    'status' in error &&
    (error as SyntaxError & { status?: number }).status === 400
  ) {
    return new AppError(ErrorCode.VALIDATION_ERROR, { message: 'Malformed JSON body.' });
  }

  return new AppError(ErrorCode.INTERNAL_ERROR, { cause: error });
}

/**
 * Terminal error middleware.
 *
 * Internal error detail never crosses the boundary: clients receive a stable
 * code, a safe message and the request ID to quote in a support request.
 */
export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(error);
    return;
  }

  const appError = toAppError(error);
  const status = appError.status ?? ERROR_STATUS[appError.code] ?? 500;

  const logPayload = {
    requestId: req.requestId,
    userId: req.user?.id,
    code: appError.code,
    status,
    err: appError.cause ?? appError,
  };

  if (status >= 500) {
    logger.error(logPayload, 'request failed');
  } else {
    logger.warn(logPayload, 'request rejected');
  }

  const body: ErrorBody = {
    error: {
      code: appError.code,
      message: status >= 500 ? ERROR_MESSAGES[ErrorCode.INTERNAL_ERROR] : appError.message,
      requestId: req.requestId,
    },
  };

  if (appError.details !== undefined && status < 500) {
    body.error.details = appError.details;
  }

  res.status(status).json(body);
}
