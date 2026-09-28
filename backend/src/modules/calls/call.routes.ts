import { Router } from 'express';
import { requireAuthenticatedUser } from '../../app/middleware/require-auth.js';
import { rateLimit } from '../../app/middleware/rate-limit.js';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { sendData, sendPage } from '../../shared/http/api-response.js';
import { currentUser, requestContext } from '../../shared/http/request-context.js';
import { paginationQuerySchema } from '../../shared/http/pagination.js';
import { validate, validatedQuery } from '../../shared/validation/validate.js';
import { callIdParamsSchema } from '../../shared/validation/common.schemas.js';
import { attendanceService } from '../attendance/attendance.service.js';
import { callEntryService } from '../attendance/call-entry.service.js';
import {
  callHeartbeatBodySchema,
  callJoinBodySchema,
  callLeaveBodySchema,
} from '../attendance/join.schemas.js';
import { auditRoutesForCall } from '../audit/audit.routes.js';
import { invitationRoutesForCall } from '../invitations/invitation.routes.js';
import { transcriptRoutesForCall } from '../transcripts/transcript.routes.js';
import { callService } from './call.service.js';
import { createCallSchema, listCallsQuerySchema, type ListCallsQuery } from './call.schemas.js';
import { type PaginationQuery } from '../../shared/http/pagination.js';

export const callRouter: Router = Router();

// Every route below is authenticated. There is no optional-auth path here.
callRouter.use(requireAuthenticatedUser);

callRouter.post(
  '/',
  validate({ body: createCallSchema }),
  asyncHandler(async (req, res) => {
    const call = await callService.create(currentUser(req).id, req.body, requestContext(req));
    sendData(res, call, 201);
  }),
);

callRouter.get(
  '/',
  validate({ query: listCallsQuerySchema }),
  asyncHandler(async (req, res) => {
    const page = await callService.list(currentUser(req).id, validatedQuery<ListCallsQuery>(req));
    sendPage(res, page);
  }),
);

callRouter.get(
  '/:callId',
  validate({ params: callIdParamsSchema }),
  asyncHandler(async (req, res) => {
    const call = await callService.getById(currentUser(req).id, req.params.callId as string);
    sendData(res, call);
  }),
);

callRouter.post(
  '/:callId/cancel',
  validate({ params: callIdParamsSchema }),
  asyncHandler(async (req, res) => {
    const call = await callService.cancel(
      currentUser(req).id,
      req.params.callId as string,
      requestContext(req),
    );
    sendData(res, call);
  }),
);

callRouter.post(
  '/:callId/end',
  validate({ params: callIdParamsSchema }),
  asyncHandler(async (req, res) => {
    const call = await callService.end(
      currentUser(req).id,
      req.params.callId as string,
      requestContext(req),
    );
    sendData(res, call);
  }),
);

/**
 * Entry without a join link.
 *
 * The organizer reaches their own call this way — they are never issued an
 * invitation — and so does an invitee who is already signed in. The decision
 * is identical to the link path; only the door differs.
 */
callRouter.post(
  '/:callId/join',
  rateLimit('join'),
  validate({ params: callIdParamsSchema, body: callJoinBodySchema }),
  asyncHandler(async (req, res) => {
    const result = await callEntryService.join(
      currentUser(req).id,
      req.params.callId as string,
      req.body,
      requestContext(req),
    );
    sendData(res, result);
  }),
);

callRouter.post(
  '/:callId/heartbeat',
  rateLimit('heartbeat'),
  validate({ params: callIdParamsSchema, body: callHeartbeatBodySchema }),
  asyncHandler(async (req, res) => {
    const result = await callEntryService.heartbeat(
      currentUser(req).id,
      req.params.callId as string,
      req.body,
      requestContext(req),
    );
    sendData(res, result);
  }),
);

callRouter.post(
  '/:callId/leave',
  rateLimit('heartbeat'),
  validate({ params: callIdParamsSchema, body: callLeaveBodySchema }),
  asyncHandler(async (req, res) => {
    const result = await callEntryService.leave(
      currentUser(req).id,
      req.params.callId as string,
      req.body,
      requestContext(req),
    );
    sendData(res, result);
  }),
);

/** Live roster — readable by anyone entitled to be in the room. */
callRouter.get(
  '/:callId/participants',
  validate({ params: callIdParamsSchema }),
  asyncHandler(async (req, res) => {
    const roster = await attendanceService.liveRoster(
      currentUser(req).id,
      req.params.callId as string,
    );
    sendData(res, roster);
  }),
);

// Organizer-only roster.
callRouter.get(
  '/:callId/attendance',
  validate({ params: callIdParamsSchema, query: paginationQuerySchema }),
  asyncHandler(async (req, res) => {
    const query = validatedQuery<PaginationQuery>(req);
    const page = await attendanceService.listForCall(
      currentUser(req).id,
      req.params.callId as string,
      query,
    );
    sendPage(res, page);
  }),
);

callRouter.use('/:callId/invitations', invitationRoutesForCall);
callRouter.use('/:callId/transcript', rateLimit('transcript'), transcriptRoutesForCall);
callRouter.use('/:callId/audit', auditRoutesForCall);
