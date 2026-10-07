import { fromNodeHeaders } from 'better-auth/node';
import { logger } from '../../infrastructure/logger/logger.js';
import { auth } from './auth.js';
import { type ResolvedSession } from './auth.types.js';

/**
 * Resolves the caller from the session cookie, server-side.
 *
 * Takes raw headers so HTTP requests and the Socket.IO handshake share one
 * path. The presence of a cookie proves nothing; only a session that Better
 * Auth validates against the database yields an identity.
 */
export async function resolveSession(
  headers: Record<string, string | string[] | undefined>,
  requestId?: string,
): Promise<ResolvedSession | null> {
  try {
    const result = await auth.api.getSession({ headers: fromNodeHeaders(headers) });
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
    logger.warn({ err: error, requestId }, 'session resolution failed');
    return null;
  }
}
