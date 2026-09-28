import { Router } from 'express';
import { asyncHandler } from '../../shared/http/async-handler.js';
import { sendPage } from '../../shared/http/api-response.js';
import {
  buildPage,
  paginationQuerySchema,
  type PaginationQuery,
} from '../../shared/http/pagination.js';
import { currentUser, requestContext } from '../../shared/http/request-context.js';
import { validate, validatedQuery } from '../../shared/validation/validate.js';
import { callIdParamsSchema } from '../../shared/validation/common.schemas.js';
import { AppError, type ErrorCode } from '../../shared/errors/index.js';
import { authorizeAuditRead } from '../access/index.js';
import { AuditAction } from './audit.actions.js';
import { toAuditEventDto } from './audit.dto.js';
import { auditRepository } from './audit.repository.js';
import { auditService } from './audit.service.js';

/** Mounted at /api/v1/calls/:callId/audit. Organizer only. */
export const auditRoutesForCall: Router = Router({ mergeParams: true });

auditRoutesForCall.get(
  '/',
  validate({ params: callIdParamsSchema, query: paginationQuerySchema }),
  asyncHandler(async (req, res) => {
    const user = currentUser(req);
    const callId = req.params.callId as string;
    const query = validatedQuery<PaginationQuery>(req);

    const decision = await authorizeAuditRead({ userId: user.id, callId });
    if (!decision.allowed) {
      auditService.recordDetached({
        action: AuditAction.AUDIT_ACCESS_DENIED,
        outcome: 'DENIED',
        actorUserId: user.id,
        callId,
        requestId: requestContext(req).requestId,
        metadata: { code: decision.code },
      });
      throw new AppError(decision.code as ErrorCode);
    }

    const rows = await auditRepository.listForCall({
      callId,
      limit: query.limit,
      cursor: query.cursor,
    });

    const page = buildPage(rows, query.limit, (row) => row.createdAt);
    sendPage(res, { items: page.items.map(toAuditEventDto), nextCursor: page.nextCursor });
  }),
);
