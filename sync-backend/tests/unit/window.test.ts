import { describe, expect, it } from 'vitest';
import {
  isAfterCallWindow,
  isBeforeCallWindow,
  isCallWindowOpen,
  isValidTimezone,
  isValidWindow,
  secondsUntilWindowOpens,
} from '../../src/shared/time/window.js';

const window = {
  scheduledStart: new Date('2026-09-22T09:00:00.000Z'),
  scheduledEnd: new Date('2026-09-22T10:00:00.000Z'),
};

describe('call window semantics', () => {
  it('denies one millisecond before the start', () => {
    const now = new Date('2026-09-22T08:59:59.999Z');
    expect(isBeforeCallWindow(window, now)).toBe(true);
    expect(isCallWindowOpen(window, now)).toBe(false);
  });

  it('allows the exact start instant (start is inclusive)', () => {
    const now = new Date('2026-09-22T09:00:00.000Z');
    expect(isBeforeCallWindow(window, now)).toBe(false);
    expect(isCallWindowOpen(window, now)).toBe(true);
  });

  it('allows the last millisecond before the end', () => {
    const now = new Date('2026-09-22T09:59:59.999Z');
    expect(isCallWindowOpen(window, now)).toBe(true);
    expect(isAfterCallWindow(window, now)).toBe(false);
  });

  it('denies the exact end instant (end is exclusive)', () => {
    const now = new Date('2026-09-22T10:00:00.000Z');
    expect(isCallWindowOpen(window, now)).toBe(false);
    expect(isAfterCallWindow(window, now)).toBe(true);
  });

  it('denies after the end', () => {
    const now = new Date('2026-09-22T10:00:00.001Z');
    expect(isAfterCallWindow(window, now)).toBe(true);
    expect(isCallWindowOpen(window, now)).toBe(false);
  });

  it('reports seconds until the window opens, and zero once open', () => {
    expect(secondsUntilWindowOpens(window, new Date('2026-09-22T08:59:00.000Z'))).toBe(60);
    expect(secondsUntilWindowOpens(window, new Date('2026-09-22T09:30:00.000Z'))).toBe(0);
    expect(secondsUntilWindowOpens(window, new Date('2026-09-22T11:00:00.000Z'))).toBe(0);
  });

  it('rejects a window whose end is not after its start', () => {
    expect(isValidWindow(window)).toBe(true);
    expect(
      isValidWindow({ scheduledStart: window.scheduledEnd, scheduledEnd: window.scheduledStart }),
    ).toBe(false);
    expect(
      isValidWindow({ scheduledStart: window.scheduledStart, scheduledEnd: window.scheduledStart }),
    ).toBe(false);
  });

  it('validates IANA timezones', () => {
    expect(isValidTimezone('Asia/Kolkata')).toBe(true);
    expect(isValidTimezone('UTC')).toBe(true);
    expect(isValidTimezone('Mars/Olympus_Mons')).toBe(false);
  });
});
