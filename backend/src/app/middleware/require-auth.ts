import { type NextFunction, type Request, type Response } from 'express';
import { AppError, ErrorCode } from '../../shared/errors/index.js';
import { resolveSession } from '../../modules/auth/current-user.js';

/**
 * Hard authentication gate.
 *
 * No protected meeting endpoint may use anything weaker than this.
 */
export async function requireAuthenticatedUser(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const session = await resolveSession(req);

  if (!session) {
    next(new AppError(ErrorCode.AUTHENTICATION_REQUIRED));
    return;
  }

  req.user = session.user;
  next();
}

/**
 * Attaches a user when one is present but never rejects.
 *
 * Deliberately NOT used on any call, invitation, join, attendance, transcript
 * or audit route.
 */
export async function optionalAuthenticatedUser(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const session = await resolveSession(req);
  if (session) req.user = session.user;
  next();
}
