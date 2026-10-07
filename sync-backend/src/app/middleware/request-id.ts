import { type NextFunction, type Request, type Response } from 'express';
import { resolveRequestId } from '../../shared/security/request-id.js';

/** Assigns a correlation ID and echoes it back for client-side tracing. */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  req.requestId = resolveRequestId(req.headers['x-request-id']);
  res.setHeader('X-Request-Id', req.requestId);
  next();
}
