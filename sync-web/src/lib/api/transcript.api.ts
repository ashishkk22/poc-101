import { apiClient } from "./client";
import type { Transcript } from "./types";

export const transcriptApi = {
  /**
   * Organizer or invited participant. A 409 TRANSCRIPT_NOT_READY is an
   * expected state, not a failure — the caller renders it as "processing".
   */
  getForCall: (callId: string, signal?: AbortSignal) =>
    apiClient.get<Transcript>(
      `/calls/${callId}/transcript`,
      signal ? { signal } : {},
    ),
};
