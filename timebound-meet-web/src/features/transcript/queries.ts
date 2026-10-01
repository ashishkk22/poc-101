import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/app/queryClient";
import { transcriptApi } from "@/lib/api";
import type { Transcript } from "@/lib/api/types";
import { ApiError, ErrorCode } from "@/lib/errors";
import { TranscriptStatus } from "@/lib/api/types";

/**
 * A 409 TRANSCRIPT_NOT_READY is a lifecycle state, not a failure, so it is
 * folded into the data as PENDING and the query keeps polling until the
 * backend reports a terminal state.
 */
export function useTranscript(callId: string | undefined) {
  return useQuery<Transcript>({
    queryKey: queryKeys.transcript(callId ?? ""),
    enabled: Boolean(callId),
    queryFn: async ({ signal }) => {
      try {
        return await transcriptApi.getForCall(callId as string, signal);
      } catch (error) {
        if (
          ApiError.isApiError(error) &&
          error.code === ErrorCode.TRANSCRIPT_NOT_READY
        ) {
          return {
            callId: callId as string,
            status: TranscriptStatus.PROCESSING,
            generatedAt: null,
            expiresAt: null,
          } satisfies Transcript;
        }
        throw error;
      }
    },
    refetchInterval: query => {
      const status = query.state.data?.status;
      return status === TranscriptStatus.PENDING || status === TranscriptStatus.PROCESSING ? 10_000 : false;
    },
  });
}
