import { Router } from 'express';
import { z } from 'zod';
import { requireAuthenticatedUser } from '../../app/middleware/require-auth.js';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { sendData } from '../../shared/http/api-response.js';
import { currentUser } from '../../shared/http/request-context.js';
import { validate, validatedQuery } from '../../shared/validation/validate.js';
import { userService } from './user.service.js';

export const userRouter: Router = Router();

userRouter.use(requireAuthenticatedUser);

userRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    sendData(res, await userService.me(currentUser(req).id));
  }),
);

const lookupQuerySchema = z.object({ email: z.email() });

/** Exact-email lookup so an organizer can resolve a participant to invite. */
userRouter.get(
  '/lookup',
  validate({ query: lookupQuerySchema }),
  asyncHandler(async (req, res) => {
    const { email } = validatedQuery<z.infer<typeof lookupQuerySchema>>(req);
    sendData(res, await userService.lookupByEmail(email));
  }),
);
