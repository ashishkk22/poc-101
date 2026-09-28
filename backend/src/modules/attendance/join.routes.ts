import { Router } from 'express';
import { requireAuthenticatedUser } from '../../app/middleware/require-auth.js';
import { rateLimit } from '../../app/middleware/rate-limit.js';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { sendData } from '../../shared/http/api-response.js';
import { currentUser, requestContext } from '../../shared/http/request-context.js';
import { validate } from '../../shared/validation/validate.js';
import { tokenParamsSchema } from '../../shared/validation/common.schemas.js';
import { joinService } from './join.service.js';
import { heartbeatBodySchema, joinBodySchema, leaveBodySchema } from './join.schemas.js';

/**
 * Mounted at /api/v1/join.
 *
 * The raw credential travels in the path, so these routes are excluded from
 * URL logging (see the request-logger serializer) and carry the tightest rate
 * limits in the application.
 */
export const joinRouter: Router = Router();

// Authentication is mandatory: holding the token is never sufficient.
joinRouter.use(requireAuthenticatedUser);

joinRouter.post(
  '/:token/authorize',
  rateLimit('join'),
  validate({ params: tokenParamsSchema, body: joinBodySchema }),
  asyncHandler(async (req, res) => {
    const result = await joinService.authorizeAndJoin(
      currentUser(req).id,
      req.params.token as string,
      req.body,
      requestContext(req),
    );
    sendData(res, result);
  }),
);

/**
 * Read-only: resolves the link to a call without entering it.
 *
 * Same authorization, no side effects — the client uses it to show a device
 * check before the participant commits.
 */
joinRouter.post(
  '/:token/resolve',
  rateLimit('join'),
  validate({ params: tokenParamsSchema }),
  asyncHandler(async (req, res) => {
    const result = await joinService.resolveLink(currentUser(req).id, req.params.token as string);
    sendData(res, result);
  }),
);

joinRouter.post(
  '/:token/heartbeat',
  rateLimit('heartbeat'),
  validate({ params: tokenParamsSchema, body: heartbeatBodySchema }),
  asyncHandler(async (req, res) => {
    const result = await joinService.heartbeat(
      currentUser(req).id,
      req.params.token as string,
      req.body,
      requestContext(req),
    );
    sendData(res, result);
  }),
);

joinRouter.post(
  '/:token/leave',
  rateLimit('heartbeat'),
  validate({ params: tokenParamsSchema, body: leaveBodySchema }),
  asyncHandler(async (req, res) => {
    const result = await joinService.leave(
      currentUser(req).id,
      req.params.token as string,
      req.body,
      requestContext(req),
    );
    sendData(res, result);
  }),
);
