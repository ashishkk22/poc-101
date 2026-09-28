import { TZDate } from '@date-fns/tz';

/**
 * Wall-clock time in a named zone, and back.
 *
 * A meeting is scheduled at a wall-clock time in a particular place: "14:00 in
 * New York". The API stores the instant that refers to, in UTC. Converting
 * between the two is the whole job of this module, and it must not be done by
 * hand: `new Date('2026-10-03T14:00')` silently reads the string in the
 * BROWSER's zone, so a host in Mumbai scheduling a New York meeting would book
 * it nine and a half hours early.
 */

/** The viewer's own zone, which is what times are displayed in by default. */
export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Every zone this browser knows, for the picker. */
export function supportedTimeZones(): string[] {
  try {
    const supported = (
      Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
    ).supportedValuesOf?.('timeZone');

    if (supported?.length) {
      // The catalogue holds canonical ids, but a browser may report its own
      // zone under a legacy alias — Asia/Calcutta for Asia/Kolkata, say. Left
      // out, the viewer's own zone would be missing from their own picker.
      const own = localTimeZone();
      return supported.includes(own) ? supported : [own, ...supported];
    }
  } catch {
    // Fall through to the minimal set below.
  }

  // Older browsers have no catalogue to offer; at least let someone pick
  // their own zone or UTC rather than facing an empty list.
  return [...new Set(['UTC', localTimeZone()])];
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * Current offset from UTC, as a label like `UTC+05:30`.
 *
 * Computed for *now*, so a zone in daylight saving reads as it currently is
 * rather than as its standard offset.
 */
export function zoneOffsetLabel(timeZone: string, at: Date = new Date()): string {
  try {
    const formatted = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'longOffset',
    })
      .formatToParts(at)
      .find((part) => part.type === 'timeZoneName')?.value;

    // Intl renders UTC itself as "GMT" with no offset.
    if (!formatted || formatted === 'GMT') return 'UTC+00:00';
    return formatted.replace('GMT', 'UTC');
  } catch {
    return 'UTC';
  }
}

/** "Asia/Kolkata" → "Kolkata", for a picker that reads like a place list. */
export function zoneCity(timeZone: string): string {
  const [, ...rest] = timeZone.split('/');
  const city = rest.length > 0 ? rest[rest.length - 1] : timeZone;
  return (city ?? timeZone).replace(/_/g, ' ');
}

export function zoneRegion(timeZone: string): string {
  const [region] = timeZone.split('/');
  return region ?? timeZone;
}

const INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

/**
 * `<input type="datetime-local">` value, read in `timeZone`, as a UTC instant.
 *
 * The input carries no zone of its own, so the one the host picked supplies
 * it. `TZDate` handles the awkward cases — the hour that does not exist when
 * clocks spring forward, and the one that happens twice when they fall back.
 */
export function zonedInputToIso(value: string, timeZone: string): string {
  const match = INPUT_PATTERN.exec(value);
  if (!match) return '';

  const [, year, month, day, hour, minute] = match;

  try {
    const zoned = new TZDate(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      0,
      timeZone,
    );

    const instant = zoned.getTime();
    return Number.isFinite(instant) ? new Date(instant).toISOString() : '';
  } catch {
    return '';
  }
}

/** A UTC instant as the wall-clock time an input should show for `timeZone`. */
export function isoToZonedInput(iso: string, timeZone: string): string {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return '';

  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(instant);

    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
    // `en-CA` renders midnight as 24; the input expects 00.
    const hour = get('hour') === '24' ? '00' : get('hour');

    return `${get('year')}-${get('month')}-${get('day')}T${hour}:${get('minute')}`;
  } catch {
    return '';
  }
}

/** A UTC instant rendered as a readable time in a specific zone. */
export function formatInZone(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return '—';
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return '—';

  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone,
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(instant);
  } catch {
    return '—';
  }
}

/** Just the clock face, for showing the same moment in a second zone. */
export function formatTimeInZone(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return '—';
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return '—';

  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(instant);
  } catch {
    return '—';
  }
}

/**
 * Whether two zones currently show the same clock.
 *
 * Compared by offset rather than by name, so Europe/London and UTC in winter
 * are treated as the same thing and the interface does not tell somebody in
 * London what time it is in London.
 */
export function zonesDiffer(a: string, b: string, at: Date = new Date()): boolean {
  if (a === b) return false;
  return zoneOffsetLabel(a, at) !== zoneOffsetLabel(b, at);
}
