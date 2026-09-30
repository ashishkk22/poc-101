import { apiClient } from "./client";
import type {
  HeartbeatResult,
  JoinResult,
  LeaveReason,
  LeaveResult,
  ResolvedLink,
} from "./types";

/**
 * Join endpoints.
 *
 * The raw invitation token travels in the path. It is held in memory for the
 * duration of a call and never written to storage, a query string the app
 * builds, or a log line.
 */
export const joinApi = {
  /**
   * Resolves a link to its call without entering it — same authorization, no
   * side effects. The client shows a device check before committing.
   */
  resolve: (token: string) =>
    apiClient.post<ResolvedLink>(`/join/${encodeURIComponent(token)}/resolve`),

  authorize: (token: string, input: { deviceId?: string } = {}) =>
    apiClient.post<JoinResult>(
      `/join/${encodeURIComponent(token)}/authorize`,
      input,
    ),

  /** Revalidates authorization as well as liveness — a revoke is denied here. */
  heartbeat: (
    token: string,
    input: { sessionId?: string; deviceId?: string } = {},
  ) =>
    apiClient.post<HeartbeatResult>(
      `/join/${encodeURIComponent(token)}/heartbeat`,
      input,
    ),

  /**
   * `keepalive` lets the request survive the tab closing, so a participant who
   * shuts the window still has their attendance closed out accurately.
   */
  leave: (
    token: string,
    input: { sessionId?: string; deviceId?: string; reason?: LeaveReason } = {},
    options: { keepalive?: boolean } = {},
  ) =>
    apiClient.post<LeaveResult>(
      `/join/${encodeURIComponent(token)}/leave`,
      { reason: "USER_LEFT", ...input },
      options.keepalive ? { keepalive: true } : {},
    ),
};
