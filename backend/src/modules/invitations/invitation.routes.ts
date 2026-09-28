import { Router } from 'express';
import { requireAuthenticatedUser } from '../../app/middleware/require-auth.js';
import { rateLimit } from '../../app/middleware/rate-limit.js';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { sendData, sendPage } from '../../shared/http/api-response.js';
import { currentUser, requestContext } from '../../shared/http/request-context.js';
import { validate, validatedQuery } from '../../shared/validation/validate.js';
import {
  callIdParamsSchema,
  invitationIdParamsSchema,
} from '../../shared/validation/common.schemas.js';
import { invitationService } from './invitation.service.js';
import {
  createInvitationSchema,
  listInvitationsQuerySchema,
  type ListInvitationsQuery,
} from './invitation.schemas.js';

/** Mounted at /api/v1/calls/:callId/invitations — mergeParams exposes callId. */
export const invitationRoutesForCall: Router = Router({ mergeParams: true });

invitationRoutesForCall.post(
  '/',
  validate({ params: callIdParamsSchema, body: createInvitationSchema }),
  asyncHandler(async (req, res) => {
    const invitation = await invitationService.create(
      currentUser(req).id,
      req.params.callId as string,
      req.body,
      requestContext(req),
    );
    // The raw join URL exists in this response and nowhere else.
    sendData(res, invitation, 201);
  }),
);

invitationRoutesForCall.get(
  '/',
  validate({ params: callIdParamsSchema, query: listInvitationsQuerySchema }),
  asyncHandler(async (req, res) => {
    const page = await invitationService.listForCall(
      currentUser(req).id,
      req.params.callId as string,
      validatedQuery<ListInvitationsQuery>(req),
    );
    sendPage(res, page);
  }),
);

/** Mounted at /api/v1/invitations. */
export const invitationRouter: Router = Router();

invitationRouter.use(requireAuthenticatedUser);

/**
 * The caller's own invitations — "you have been invited to these".
 *
 * Declared before `/:invitationId` so the literal path is not swallowed by
 * the parameter route.
 */
invitationRouter.get(
  '/mine',
  validate({ query: listInvitationsQuerySchema }),
  asyncHandler(async (req, res) => {
    const page = await invitationService.listMine(
      currentUser(req).id,
      validatedQuery<ListInvitationsQuery>(req),
    );
    sendPage(res, page);
  }),
);

invitationRouter.get(
  '/:invitationId',
  validate({ params: invitationIdParamsSchema }),
  asyncHandler(async (req, res) => {
    const invitation = await invitationService.getById(
      currentUser(req).id,
      req.params.invitationId as string,
    );
    sendData(res, invitation);
  }),
);

invitationRouter.post(
  '/:invitationId/revoke',
  rateLimit('revoke'),
  validate({ params: invitationIdParamsSchema }),
  asyncHandler(async (req, res) => {
    const result = await invitationService.revoke(
      currentUser(req).id,
      req.params.invitationId as string,
      requestContext(req),
    );
    sendData(res, result);
  }),
);
