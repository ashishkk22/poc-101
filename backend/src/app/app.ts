import { toNodeHandler } from 'better-auth/node';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { AUTH_BASE_PATH } from '../config/constants.js';
import { allowedOrigins, isProduction } from '../config/env.js';
import { auth } from '../modules/auth/auth.js';
import { errorHandler } from './middleware/error-handler.js';
import { notFoundHandler } from './middleware/not-found.js';
import { rateLimit } from './middleware/rate-limit.js';
import { requestIdMiddleware } from './middleware/request-id.js';
import { requestLogger } from './middleware/request-logger.js';
import { healthRouter } from './health.routes.js';
import { apiRouter } from './routes.js';

export function createApp(): Express {
  const app = express();

  // Behind a load balancer, req.ip must reflect the real client for rate limiting.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(requestIdMiddleware);

  app.use(
    helmet({
      // This is a JSON API; a restrictive CSP costs nothing here.
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
          baseUri: ["'none'"],
          formAction: ["'none'"],
        },
      },
      hsts: isProduction ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
      referrerPolicy: { policy: 'no-referrer' },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );

  app.use((_req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });

  // Credentialed CORS: an explicit origin allowlist, never a wildcard.
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(null, false);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'X-Request-Id'],
      exposedHeaders: ['X-Request-Id', 'Retry-After', 'X-RateLimit-Remaining'],
      maxAge: 600,
    }),
  );

  app.use(requestLogger);

  app.use(healthRouter);

  // Better Auth mounts before the JSON body parser: it consumes the raw body
  // itself. Express 5 requires the named splat form for a catch-all.
  app.all(`${AUTH_BASE_PATH}/*splat`, rateLimit('auth'), toNodeHandler(auth));

  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));

  app.use(rateLimit('global'));
  app.use(apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
