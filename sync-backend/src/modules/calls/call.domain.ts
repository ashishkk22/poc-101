import { type CallStatus } from '../../generated/prisma/enums.js';
import { AppError, ErrorCode } from '../../shared/errors/index.js';
import { isAfterCallWindow, isBeforeCallWindow } from '../../shared/time/window.js';

/**
 * Call lifecycle.
 *
 *   DRAFT -> SCHEDULED -> LIVE -> ENDED
 *   SCHEDULED | LIVE -> CANCELLED
 *
 * Transitions are enumerated rather than inferred, so no API request can
 * nudge a call into an arbitrary state.
 */
const ALLOWED_TRANSITIONS: Record<CallStatus, readonly CallStatus[]> = {
  DRAFT: ['SCHEDULED', 'CANCELLED'],
  SCHEDULED: ['LIVE', 'ENDED', 'CANCELLED'],
  LIVE: ['ENDED', 'CANCELLED'],
  ENDED: [],
  CANCELLED: [],
};

export function canTransition(from: CallStatus, to: CallStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: CallStatus, to: CallStatus): void {
  if (!canTransition(from, to)) {
    throw new AppError(ErrorCode.BUSINESS_RULE_FAILURE, {
      message: `A call cannot move from ${from} to ${to}.`,
    });
  }
}

export function assertCancellable(status: CallStatus): void {
  if (status === 'CANCELLED') {
    throw new AppError(ErrorCode.CONFLICT, { message: 'This call is already cancelled.' });
  }
  if (status === 'ENDED') {
    throw new AppError(ErrorCode.BUSINESS_RULE_FAILURE, {
      message: 'A call that has ended cannot be cancelled.',
    });
  }
}

/**
 * The status a scheduler would derive purely from the clock.
 * Used to advance calls; never used to grant access on its own.
 */
export function expectedStatusAt(
  window: { scheduledStart: Date; scheduledEnd: Date },
  current: CallStatus,
  now: Date,
): CallStatus {
  if (current === 'CANCELLED' || current === 'ENDED' || current === 'DRAFT') return current;
  if (isBeforeCallWindow(window, now)) return 'SCHEDULED';
  if (isAfterCallWindow(window, now)) return 'ENDED';
  return 'LIVE';
}
