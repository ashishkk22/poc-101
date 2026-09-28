import { apiClient } from './client';
import type { Attendance, PaginatedResponse, PaginationQuery } from './types';

export const attendanceApi = {
  /** Organizer-only roster for a call. */
  listForCall: (callId: string, query: PaginationQuery = {}, signal?: AbortSignal) =>
    apiClient.getPage<PaginatedResponse<Attendance>>(`/calls/${callId}/attendance`, {
      query: { ...query },
      ...(signal ? { signal } : {}),
    }),
};
