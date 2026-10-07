import { Router } from 'express';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { sendData } from '../../shared/http/api-response.js';
import { currentUser, requestContext } from '../../shared/http/request-context.js';
import { validate } from '../../shared/validation/validate.js';
import { callIdParamsSchema } from '../../shared/validation/common.schemas.js';
import { transcriptService } from './transcript.service.js';

/** Mounted at /api/v1/calls/:callId/transcript. */
export const transcriptRoutesForCall: Router = Router({ mergeParams: true });

transcriptRoutesForCall.get(
  '/',
  validate({ params: callIdParamsSchema }),
  asyncHandler(async (req, res) => {
    const transcript = await transcriptService.getForCall(
      currentUser(req).id,
      req.params.callId as string,
      requestContext(req),
    );
    sendData(res, transcript);
  }),
);
