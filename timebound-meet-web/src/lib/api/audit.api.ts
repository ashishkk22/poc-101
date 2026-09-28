import { apiClient } from './client';
import type { AuditEvent, PaginatedResponse, PaginationQuery } from './types';

export const auditApi = {
  /** Organizer-only audit trail for a call. */
  listForCall: (callId: string, query: PaginationQuery = {}, signal?: AbortSignal) =>
    apiClient.getPage<PaginatedResponse<AuditEvent>>(`/calls/${callId}/audit`, {
      query: { ...query },
      ...(signal ? { signal } : {}),
    }),
};
