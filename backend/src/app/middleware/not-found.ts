import { type Request, type Response } from 'express';
import { ErrorCode, ERROR_MESSAGES } from '../../shared/errors/index.js';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: ErrorCode.RESOURCE_NOT_FOUND,
      message: ERROR_MESSAGES[ErrorCode.RESOURCE_NOT_FOUND],
      requestId: req.requestId,
    },
  });
}
