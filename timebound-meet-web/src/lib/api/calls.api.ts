import { apiClient } from "./client";
import type { Call, CallParticipant, HeartbeatResult, JoinResult, LeaveResult, ListCallsQuery, PaginatedResponse } from "./types";
import { LeaveReason } from "./types";

export interface CreateCallInput {
  title: string;
  scheduledStart: string;
  scheduledEnd: string;
  timezone: string;
}

export const callsApi = {
  create: (input: CreateCallInput) => apiClient.post<Call>("/calls", input),

  list: (query: ListCallsQuery = {}, signal?: AbortSignal) =>
    apiClient.getPage<PaginatedResponse<Call>>("/calls", {
      query: { ...query },
      ...(signal ? { signal } : {}),
    }),

  getById: (callId: string, signal?: AbortSignal) =>
    apiClient.get<Call>(`/calls/${callId}`, signal ? { signal } : {}),

  cancel: (callId: string) => apiClient.post<Call>(`/calls/${callId}/cancel`),

  /** Ends the call for everyone. Organizer only; the backend enforces that. */
  end: (callId: string) => apiClient.post<Call>(`/calls/${callId}/end`),

  /**
   * Entry without a join link — the organizer's own call, or an invitee who
   * is already signed in. The backend runs the same decision either way.
   */
  join: (callId: string, input: { deviceId?: string } = {}) =>
    apiClient.post<JoinResult>(`/calls/${callId}/join`, input),

  heartbeat: (
    callId: string,
    input: { sessionId?: string; deviceId?: string } = {},
  ) => apiClient.post<HeartbeatResult>(`/calls/${callId}/heartbeat`, input),

  leave: (
    callId: string,
    input: { sessionId?: string; deviceId?: string; reason?: LeaveReason } = {},
    options: { keepalive?: boolean } = {},
  ) =>
    apiClient.post<LeaveResult>(
      `/calls/${callId}/leave`,
      { reason: LeaveReason.USER_LEFT, ...input },
      options.keepalive ? { keepalive: true } : {},
    ),

  /** Live roster: who is connected right now. */
  participants: (callId: string, signal?: AbortSignal) =>
    apiClient.get<CallParticipant[]>(
      `/calls/${callId}/participants`,
      signal ? { signal } : {},
    ),
};
