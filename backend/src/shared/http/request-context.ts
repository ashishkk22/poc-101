import { type Request } from 'express';
import { AppError, ErrorCode } from '../errors/index.js';
import { type AuthenticatedUser } from '../../modules/auth/auth.types.js';

export interface RequestContext {
  requestId: string;
  ipAddress?: string;
  userAgent?: string;
}

export function requestContext(req: Request): RequestContext {
  return {
    requestId: req.requestId,
    ipAddress: req.ip,
    userAgent:
      typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
  };
}

/**
 * The only sanctioned way to read the current user.
 *
 * Throws rather than returning undefined so a route can never accidentally
 * proceed with an anonymous caller.
 */
export function currentUser(req: Request): AuthenticatedUser {
  if (!req.user) {
    throw new AppError(ErrorCode.AUTHENTICATION_REQUIRED);
  }
  return req.user;
}
