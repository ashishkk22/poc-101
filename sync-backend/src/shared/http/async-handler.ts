import { type NextFunction, type Request, type RequestHandler, type Response } from 'express';

/**
 * Express 5 forwards rejected promises to the error middleware on its own,
 * but wrapping keeps the behaviour explicit and independent of that detail.
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
