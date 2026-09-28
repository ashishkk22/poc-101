import { apiClient } from './client';
import type {
  MyInvitation,
  CreatedInvitation,
  Invitation,
  ListInvitationsQuery,
  PaginatedResponse,
  RevokedInvitation,
} from './types';

export interface CreateInvitationInput {
  participantId: string;
  /** Optional override; the backend clamps it to the call window plus grace. */
  expiresAt?: string;
}

export const invitationsApi = {
  /** The response carries the raw join URL — it is never retrievable again. */
  create: (callId: string, input: CreateInvitationInput) =>
    apiClient.post<CreatedInvitation>(`/calls/${callId}/invitations`, input),

  listForCall: (callId: string, query: ListInvitationsQuery = {}, signal?: AbortSignal) =>
    apiClient.getPage<PaginatedResponse<Invitation>>(`/calls/${callId}/invitations`, {
      query: { ...query },
      ...(signal ? { signal } : {}),
    }),

  getById: (invitationId: string, signal?: AbortSignal) =>
    apiClient.get<Invitation>(`/invitations/${invitationId}`, signal ? { signal } : {}),

  /** The caller's own invitations — "you have been invited to these". */
  listMine: (query: ListInvitationsQuery = {}, signal?: AbortSignal) =>
    apiClient.getPage<PaginatedResponse<MyInvitation>>('/invitations/mine', {
      query: { ...query },
      ...(signal ? { signal } : {}),
    }),

  revoke: (invitationId: string) =>
    apiClient.post<RevokedInvitation>(`/invitations/${invitationId}/revoke`),
};
