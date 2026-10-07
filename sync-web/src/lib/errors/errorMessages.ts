import { ApiError, ErrorCode } from "./apiError";

/**
 * One mapper, used everywhere.
 *
 * Two rules decide what a user reads:
 *
 *  1. Where the backend writes copy that is both safe and specific — business
 *     rules, conflicts, field validation — that message wins. It knows why the
 *     request failed; this file does not.
 *  2. Everywhere else, a code maps to copy that says what to do next rather
 *     than restating a policy outcome.
 *
 * Unrecognised codes fall back to the server message, never to a stack trace.
 */
interface Copy {
  title: string;
  description: string;
}

const MESSAGES: Record<string, Copy> = {
  [ErrorCode.AUTHENTICATION_REQUIRED]: {
    title: "Please sign in again",
    description:
      "You've been signed out. Pop your details back in and we'll pick up where you left off.",
  },
  [ErrorCode.FORBIDDEN]: {
    title: "You can't do that",
    description:
      "This one isn't available to you. If that seems wrong, check with the host.",
  },
  [ErrorCode.VALIDATION_ERROR]: {
    title: "Something needs a tweak",
    description:
      "A couple of details don't look quite right — have another glance below.",
  },
  [ErrorCode.CALL_NOT_FOUND]: {
    title: "We couldn't find that call",
    description: "It may have been removed, or it's no longer shared with you.",
  },
  [ErrorCode.CALL_NOT_JOINABLE]: {
    title: "This call isn't open",
    description: "You can't join right now. Try again in a little while.",
  },
  [ErrorCode.CALL_CANCELLED]: {
    title: "This call was called off",
    description: "The host cancelled it. They may set up another one.",
  },
  [ErrorCode.INVITE_NOT_FOUND]: {
    title: "That link doesn't work",
    description: "Ask the host to send you a fresh one and you'll be right in.",
  },
  [ErrorCode.INVITE_REVOKED]: {
    title: "You were removed from this call",
    description:
      "The host took you off the guest list. Get in touch with them if that's unexpected.",
  },
  [ErrorCode.INVITE_EXPIRED]: {
    title: "This invite has run out",
    description: "Ask the host for a new one — it only takes them a second.",
  },
  [ErrorCode.PARTICIPANT_MISMATCH]: {
    title: "This invite isn't for this account",
    description:
      "It was sent to someone else. Sign in with that account and try the link again.",
  },
  [ErrorCode.JOIN_WINDOW_NOT_OPEN]: {
    title: "This one hasn't opened yet",
    description: "Give it a moment and try again.",
  },
  [ErrorCode.JOIN_WINDOW_CLOSED]: {
    title: "This call has wrapped up",
    description:
      "It's finished, so there's no way back in. The recap should appear on the call page.",
  },
  [ErrorCode.TRANSCRIPT_NOT_READY]: {
    title: "We're still writing this up",
    description:
      "The transcript takes a minute or two. This page will update on its own — no need to refresh.",
  },
  [ErrorCode.TRANSCRIPT_ACCESS_DENIED]: {
    title: "This transcript isn't yours to read",
    description:
      "Only the host and the people invited to the call can open it.",
  },
  [ErrorCode.PROVIDER_UNAVAILABLE]: {
    title: "We can't connect you just now",
    description:
      "Something on our side is having a moment. Give it a few seconds and try again.",
  },
  [ErrorCode.RATE_LIMITED]: {
    title: "Let's slow down a touch",
    description:
      "That's a few too many tries in a row. Take a short breather and have another go.",
  },
  [ErrorCode.CONFLICT]: {
    title: "Something changed while you were here",
    description: "Refresh the page to catch up, then give it another go.",
  },
  [ErrorCode.BUSINESS_RULE_FAILURE]: {
    title: "That's not possible right now",
    description: "This call isn't in a state where that works.",
  },
  [ErrorCode.RESOURCE_NOT_FOUND]: {
    title: "We couldn't find that",
    description: "It might have moved, or it isn't shared with you.",
  },
  [ErrorCode.INTERNAL_ERROR]: {
    title: "Well, that went sideways",
    description:
      "Something unexpected happened on our end. Another try usually sorts it.",
  },
  [ErrorCode.NETWORK_ERROR]: {
    title: "We can't reach you right now",
    description: "Check your internet connection, then try again.",
  },

  // Better Auth. The backend deliberately gives the same answer whether the
  // account exists or the password was wrong, so this copy must not narrow it.
  [ErrorCode.INVALID_EMAIL_OR_PASSWORD]: {
    title: "That didn't work",
    description: "Your email or password doesn't match. Give it another go.",
  },
  [ErrorCode.INVALID_EMAIL]: {
    title: "That email looks off",
    description: "Double-check it and try again.",
  },
  [ErrorCode.PASSWORD_TOO_SHORT]: {
    title: "A bit longer, please",
    description:
      "Passwords need at least 12 characters to keep your account safe.",
  },
  [ErrorCode.PASSWORD_TOO_LONG]: {
    title: "That's a very long password",
    description: "Try trimming it down a little.",
  },
  [ErrorCode.USER_ALREADY_EXISTS]: {
    title: "You've already got an account",
    description: "That email is taken — sign in instead and you're away.",
  },
  [ErrorCode.FAILED_TO_CREATE_USER]: {
    title: "We couldn't set that up",
    description: "Something got in the way. Have another go in a moment.",
  },
};

/**
 * Codes whose server message is specific, safe and more useful than anything
 * written here — an organizer inviting someone twice should be told exactly
 * that, not "this action conflicts with the current state".
 */
const PREFER_SERVER_MESSAGE = new Set<string>([
  ErrorCode.BUSINESS_RULE_FAILURE,
  ErrorCode.CONFLICT,
  ErrorCode.VALIDATION_ERROR,
]);

export interface DisplayError {
  title: string;
  description: string;
  code: string;
  /** Kept so a user can quote it to support; never a stack trace. */
  requestId: string | null;
}

export function toDisplayError(error: unknown): DisplayError {
  if (ApiError.isApiError(error)) {
    const mapped = MESSAGES[error.code];

    // Field-level detail beats any summary, for a form especially.
    const validationDetail = error.details?.length
      ? error.details.map(detail => detail.message).join(" ")
      : null;

    const serverMessage =
      PREFER_SERVER_MESSAGE.has(error.code) && error.message
        ? error.message
        : null;

    // A rate limit is the one case where the backend can say exactly how long
    // to wait, so the copy says it rather than "try again later".
    if (
      error.code === ErrorCode.RATE_LIMITED &&
      error.retryAfterSeconds !== null
    ) {
      const seconds = error.retryAfterSeconds;
      const wait =
        seconds >= 60
          ? `${Math.ceil(seconds / 60)} minute${Math.ceil(seconds / 60) === 1 ? "" : "s"}`
          : `${seconds} second${seconds === 1 ? "" : "s"}`;

      return {
        title: MESSAGES[ErrorCode.RATE_LIMITED]!.title,
        description: `Too many requests. Try again in about ${wait}.`,
        code: error.code,
        requestId: error.requestId,
      };
    }

    return {
      title: mapped?.title ?? "Something went wrong",
      description:
        validationDetail ??
        serverMessage ??
        mapped?.description ??
        error.message,
      code: error.code,
      requestId: error.requestId,
    };
  }

  return {
    title: MESSAGES[ErrorCode.INTERNAL_ERROR]!.title,
    description: MESSAGES[ErrorCode.INTERNAL_ERROR]!.description,
    code: ErrorCode.INTERNAL_ERROR,
    requestId: null,
  };
}

/** Short, single-line copy for toasts and inline form errors. */
export function toErrorMessage(error: unknown): string {
  return toDisplayError(error).description;
}

/** True when the failure means the session is gone and a re-sign-in is needed. */
export function isAuthExpired(error: unknown): boolean {
  return (
    ApiError.isApiError(error) &&
    error.code === ErrorCode.AUTHENTICATION_REQUIRED
  );
}
