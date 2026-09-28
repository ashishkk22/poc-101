import { fromNodeHeaders } from 'better-auth/node';
import { type Request } from 'express';
import { logger } from '../../infrastructure/logger/logger.js';
import { auth } from './auth.js';
import { type ResolvedSession } from './auth.types.js';

/**
 * Resolves the caller from the session cookie, server-side.
 *
 * The presence of a cookie proves nothing; only a session that Better Auth
 * validates against the database yields an identity.
 */
export async function resolveSession(req: Request): Promise<ResolvedSession | null> {
  try {
    const result = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
    if (!result?.user || !result.session) return null;

    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
      },
      sessionId: result.session.id,
      expiresAt: new Date(result.session.expiresAt),
    };
  } catch (error) {
    logger.warn({ err: error, requestId: req.requestId }, 'session resolution failed');
    return null;
  }
}

/** Resolves a session from raw headers, used by the Socket.IO handshake. */
export async function resolveSessionFromHeaders(
  headers: Record<string, string | string[] | undefined>,
): Promise<ResolvedSession | null> {
  try {
    const result = await auth.api.getSession({ headers: fromNodeHeaders(headers) });
    if (!result?.user || !result.session) return null;

    return {
      user: { id: result.user.id, email: result.user.email, name: result.user.name },
      sessionId: result.session.id,
      expiresAt: new Date(result.session.expiresAt),
    };
  } catch {
    return null;
  }
}
