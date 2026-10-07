import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { AUTH_BASE_PATH } from '../../config/constants.js';
import { allowedOrigins, env, isProduction } from '../../config/env.js';
import { prisma } from '../../infrastructure/database/prisma.js';

/**
 * Better Auth owns credential handling and session issuance.
 *
 * Sessions are carried in HttpOnly cookies: Secure in production, SameSite=Lax,
 * and never readable by client JavaScript. The application resolves the user
 * from the session server-side on every protected request.
 */
export const auth = betterAuth({
  appName: 'Sync',
  basePath: AUTH_BASE_PATH,
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  trustedOrigins: allowedOrigins,
  emailAndPassword: {
    enabled: true,
    // No mail transport is wired in this backend as of now
    requireEmailVerification: false,
    minPasswordLength: 12,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: false },
  },
  advanced: {
    useSecureCookies: isProduction,
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
      path: '/',
    },
  },
});

export type Auth = typeof auth;
