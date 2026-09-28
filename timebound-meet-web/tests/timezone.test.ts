import { describe, expect, it } from 'vitest';
import {
  formatTimeInZone,
  isValidTimeZone,
  isoToZonedInput,
  supportedTimeZones,
  zoneCity,
  zoneOffsetLabel,
  zonedInputToIso,
  zonesDiffer,
} from '@/lib/date/timezone';

/**
 * A meeting is scheduled at a wall-clock time in a place. Getting this wrong
 * is not a formatting nit: the previous implementation read every entered time
 * in the BROWSER's zone, so a host in Mumbai booking "14:00 New York" actually
 * booked 04:30 New York — nine and a half hours early.
 */
describe('reading a wall-clock time in a chosen zone', () => {
  it('interprets the time in the chosen zone, not the browser one', () => {
    // Runs under TZ=Asia/Kolkata (see the suite config), so a naive
    // `new Date(...)` would answer 08:30Z here.
    expect(zonedInputToIso('2026-10-03T14:00', 'America/New_York')).toBe(
      '2026-10-03T18:00:00.000Z',
    );
  });

  it.each([
    ['Asia/Kolkata', '2026-10-03T08:30:00.000Z'],
    ['UTC', '2026-10-03T14:00:00.000Z'],
    ['Europe/London', '2026-10-03T13:00:00.000Z'],
    // Sydney is still on standard time here: DST begins 4 October 2026.
    ['Australia/Sydney', '2026-10-03T04:00:00.000Z'],
  ])('resolves 14:00 in %s correctly', (zone, expected) => {
    expect(zonedInputToIso('2026-10-03T14:00', zone)).toBe(expected);
  });

  it('turns over on the exact day a zone changes its clocks', () => {
    // Sydney springs forward on 4 October 2026, so consecutive days at the
    // same wall clock are an hour apart in real time.
    expect(zonedInputToIso('2026-10-03T14:00', 'Australia/Sydney')).toBe(
      '2026-10-03T04:00:00.000Z',
    );
    expect(zonedInputToIso('2026-10-04T14:00', 'Australia/Sydney')).toBe(
      '2026-10-04T03:00:00.000Z',
    );
  });

  it('follows daylight saving rather than a fixed offset', () => {
    // London is UTC+0 in January and UTC+1 in July. Same wall clock, different
    // instants — which a hardcoded offset would get wrong half the year.
    expect(zonedInputToIso('2026-01-15T12:00', 'Europe/London')).toBe('2026-01-15T12:00:00.000Z');
    expect(zonedInputToIso('2026-07-15T12:00', 'Europe/London')).toBe('2026-07-15T11:00:00.000Z');
  });

  it('round-trips a time back to the same wall clock', () => {
    const iso = zonedInputToIso('2026-10-03T14:00', 'America/New_York');
    expect(isoToZonedInput(iso, 'America/New_York')).toBe('2026-10-03T14:00');
  });

  it('shows one instant as different clocks in different places', () => {
    const iso = zonedInputToIso('2026-10-03T14:00', 'America/New_York');

    expect(formatTimeInZone(iso, 'America/New_York')).toBe('14:00');
    expect(formatTimeInZone(iso, 'Asia/Kolkata')).toBe('23:30');
    expect(formatTimeInZone(iso, 'UTC')).toBe('18:00');
  });

  it('refuses a value it cannot read rather than guessing', () => {
    expect(zonedInputToIso('', 'UTC')).toBe('');
    expect(zonedInputToIso('not-a-date', 'UTC')).toBe('');
    expect(zonedInputToIso('2026-10-03T14:00', 'Not/AZone')).toBe('');
  });

  it('handles midnight, which some locales render as hour 24', () => {
    const iso = zonedInputToIso('2026-10-03T00:00', 'Asia/Kolkata');
    expect(isoToZonedInput(iso, 'Asia/Kolkata')).toBe('2026-10-03T00:00');
  });
});

describe('describing a zone', () => {
  it('reports the current offset, daylight saving included', () => {
    expect(zoneOffsetLabel('Asia/Kolkata', new Date('2026-06-01'))).toBe('UTC+05:30');
    expect(zoneOffsetLabel('Europe/London', new Date('2026-01-15'))).toBe('UTC+00:00');
    expect(zoneOffsetLabel('Europe/London', new Date('2026-07-15'))).toBe('UTC+01:00');
    expect(zoneOffsetLabel('UTC')).toBe('UTC+00:00');
  });

  it('reads a zone id as a place', () => {
    expect(zoneCity('Asia/Kolkata')).toBe('Kolkata');
    expect(zoneCity('America/Argentina/Buenos_Aires')).toBe('Buenos Aires');
    expect(zoneCity('UTC')).toBe('UTC');
  });

  it('compares zones by clock, not by name', () => {
    // Same instant, same clock — so the interface should not tell someone in
    // London what time it is in London.
    expect(zonesDiffer('Europe/London', 'UTC', new Date('2026-01-15'))).toBe(false);
    expect(zonesDiffer('Europe/London', 'UTC', new Date('2026-07-15'))).toBe(true);
    expect(zonesDiffer('Asia/Kolkata', 'Asia/Kolkata')).toBe(false);
  });

  it('offers zones the browser actually knows', () => {
    const zones = supportedTimeZones();

    expect(zones.length).toBeGreaterThan(50);
    expect(zones).toContain('Europe/London');
    expect(zones.every(isValidTimeZone)).toBe(true);
  });

  it("always includes the viewer's own zone, alias or not", () => {
    // Node reports Asia/Calcutta while listing Asia/Kolkata in the catalogue.
    // Without this, someone's own zone would be absent from their own picker.
    const own = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(supportedTimeZones()).toContain(own);
  });
});
