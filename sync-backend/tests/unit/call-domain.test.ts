import { describe, expect, it } from 'vitest';
import {
  assertCancellable,
  assertTransition,
  canTransition,
  expectedStatusAt,
} from '../../src/modules/calls/call.domain.js';
import { AppError } from '../../src/shared/errors/index.js';

describe('call state transitions', () => {
  it('permits only the documented transitions', () => {
    expect(canTransition('DRAFT', 'SCHEDULED')).toBe(true);
    expect(canTransition('SCHEDULED', 'LIVE')).toBe(true);
    expect(canTransition('LIVE', 'ENDED')).toBe(true);
    expect(canTransition('SCHEDULED', 'CANCELLED')).toBe(true);
    expect(canTransition('LIVE', 'CANCELLED')).toBe(true);
  });

  it('refuses to resurrect terminal states', () => {
    expect(canTransition('ENDED', 'LIVE')).toBe(false);
    expect(canTransition('ENDED', 'SCHEDULED')).toBe(false);
    expect(canTransition('CANCELLED', 'LIVE')).toBe(false);
    expect(canTransition('CANCELLED', 'SCHEDULED')).toBe(false);
    expect(() => assertTransition('ENDED', 'LIVE')).toThrow(AppError);
  });

  it('refuses to cancel an ended call and treats a double cancel as a conflict', () => {
    expect(() => assertCancellable('SCHEDULED')).not.toThrow();
    expect(() => assertCancellable('LIVE')).not.toThrow();
    expect(() => assertCancellable('ENDED')).toThrow(AppError);
    expect(() => assertCancellable('CANCELLED')).toThrow(AppError);
  });
});

describe('clock-derived expected status', () => {
  const window = {
    scheduledStart: new Date('2026-09-22T09:00:00.000Z'),
    scheduledEnd: new Date('2026-09-22T10:00:00.000Z'),
  };

  it('derives SCHEDULED, LIVE and ENDED from the clock', () => {
    expect(expectedStatusAt(window, 'SCHEDULED', new Date('2026-09-22T08:00:00Z'))).toBe(
      'SCHEDULED',
    );
    expect(expectedStatusAt(window, 'SCHEDULED', new Date('2026-09-22T09:00:00Z'))).toBe('LIVE');
    expect(expectedStatusAt(window, 'LIVE', new Date('2026-09-22T10:00:00Z'))).toBe('ENDED');
  });

  it('never moves a cancelled or ended call', () => {
    expect(expectedStatusAt(window, 'CANCELLED', new Date('2026-09-22T09:30:00Z'))).toBe(
      'CANCELLED',
    );
    expect(expectedStatusAt(window, 'ENDED', new Date('2026-09-22T09:30:00Z'))).toBe('ENDED');
  });
});
