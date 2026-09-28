/**
 * Server time is the only time the authorization engine trusts.
 *
 * A Clock abstraction exists so tests can move time deterministically without
 * ever tempting production code to accept a client-supplied timestamp.
 */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = {
  now: () => new Date(),
};

/** Test-only clock. Never wired into the production container. */
export class FixedClock implements Clock {
  constructor(private current: Date) {}

  now(): Date {
    return new Date(this.current);
  }

  set(next: Date): void {
    this.current = new Date(next);
  }

  advanceSeconds(seconds: number): void {
    this.current = new Date(this.current.getTime() + seconds * 1000);
  }
}
