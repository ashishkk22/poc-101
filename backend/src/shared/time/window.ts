/**
 * Call window semantics.
 *
 *   start is INCLUSIVE, end is EXCLUSIVE.
 *
 *   09:00:00.000 -> open
 *   09:59:59.999 -> open
 *   10:00:00.000 -> closed
 *
 * These helpers are the single definition of that rule. Nothing else in the
 * codebase is allowed to compare window boundaries by hand.
 */

export interface CallWindow {
  scheduledStart: Date;
  scheduledEnd: Date;
}

export function isBeforeCallWindow(window: CallWindow, now: Date): boolean {
  return now.getTime() < window.scheduledStart.getTime();
}

export function isAfterCallWindow(window: CallWindow, now: Date): boolean {
  return now.getTime() >= window.scheduledEnd.getTime();
}

export function isCallWindowOpen(window: CallWindow, now: Date): boolean {
  return !isBeforeCallWindow(window, now) && !isAfterCallWindow(window, now);
}

/** Seconds until the window opens; 0 once it is open or already closed. */
export function secondsUntilWindowOpens(window: CallWindow, now: Date): number {
  const delta = window.scheduledStart.getTime() - now.getTime();
  return delta > 0 ? Math.ceil(delta / 1000) : 0;
}

export function isValidWindow(window: CallWindow): boolean {
  return window.scheduledStart.getTime() < window.scheduledEnd.getTime();
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

export function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

/** True when the IANA zone is resolvable by the host ICU data. */
export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}
