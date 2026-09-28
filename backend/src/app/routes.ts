import { Router } from 'express';
import { API_PREFIX } from '../config/constants.js';
import { joinRouter } from '../modules/attendance/join.routes.js';
import { callRouter } from '../modules/calls/call.routes.js';
import { invitationRouter } from '../modules/invitations/invitation.routes.js';
import { userRouter } from '../modules/users/user.routes.js';

/**
 * A single versioned surface: /api/v1/*.
 *
 * Better Auth owns /api/auth/* and is mounted separately in app.ts.
 */
export const apiRouter: Router = Router();

apiRouter.use(`${API_PREFIX}/users`, userRouter);
apiRouter.use(`${API_PREFIX}/calls`, callRouter);
apiRouter.use(`${API_PREFIX}/invitations`, invitationRouter);
apiRouter.use(`${API_PREFIX}/join`, joinRouter);
