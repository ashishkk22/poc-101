import path from 'node:path';
import express, { Router } from 'express';

/**
 * Serves the built SPA from the API process, so the frontend and the API share
 * one origin: the SameSite=Lax session cookie then always travels, and the
 * browser never makes a cross-origin call.
 *
 * The API's own headers forbid scripts, camera and microphone. The SPA needs
 * all three, so its responses get a policy of their own. `/api/*` never
 * enters this router and keeps the API's headers untouched.
 */
const SPA_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  // sonner injects its toast styles at runtime.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  // Same-origin fetch and the Socket.IO websocket.
  "connect-src 'self'",
  "media-src 'self' blob:",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join('; ');

const SPA_PERMISSIONS_POLICY = 'camera=(self), microphone=(self), geolocation=()';

function isApiPath(requestPath: string): boolean {
  return requestPath === '/api' || requestPath.startsWith('/api/');
}

export function createWebRouter(distDir: string): Router {
  const root = path.resolve(distDir);
  const indexHtml = path.join(root, 'index.html');
  const assetsDir = path.join(root, 'assets') + path.sep;

  const router = Router();

  router.use((req, res, next) => {
    if (isApiPath(req.path)) {
      next('router');
      return;
    }
    res.setHeader('Content-Security-Policy', SPA_CONTENT_SECURITY_POLICY);
    res.setHeader('Permissions-Policy', SPA_PERMISSIONS_POLICY);
    next();
  });

  router.use(
    express.static(root, {
      index: false,
      setHeaders(res, filePath) {
        // Vite fingerprints everything under assets/, so it can be cached forever;
        // anything else must be revalidated so a deploy is picked up.
        res.setHeader(
          'Cache-Control',
          filePath.startsWith(assetsDir) ? 'public, max-age=31536000, immutable' : 'no-cache',
        );
      },
    }),
  );

  // Client-side routes (/login, /join/:token, …) all boot the same index.html.
  // A missing file (anything with an extension) falls through to the JSON 404
  // rather than being answered with HTML.
  // `{*splat}` (optional) so the bare `/` matches too.
  router.get('/{*splat}', (req, res, next) => {
    if (path.extname(req.path) || !req.accepts('html')) {
      next();
      return;
    }
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexHtml);
  });

  return router;
}
