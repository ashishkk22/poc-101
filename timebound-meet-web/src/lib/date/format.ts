import { format, formatDistanceStrict, isValid, parseISO } from "date-fns";

/**
 * Backend timestamps are always UTC ISO strings. Everything a user reads is
 * rendered in their own local timezone; the call's scheduling timezone is
 * shown separately where it matters.
 */
export function parse(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const parsed = parseISO(iso);
  return isValid(parsed) ? parsed : null;
}

export function formatDateTime(
  iso: string | null | undefined,
  fallback = "—",
): string {
  const date = parse(iso);
  return date ? format(date, "d MMM yyyy, HH:mm") : fallback;
}

export function formatTime(
  iso: string | null | undefined,
  fallback = "—",
): string {
  const date = parse(iso);
  return date ? format(date, "HH:mm") : fallback;
}

export function formatDate(
  iso: string | null | undefined,
  fallback = "—",
): string {
  const date = parse(iso);
  return date ? format(date, "d MMM yyyy") : fallback;
}

export function formatPreciseDateTime(
  iso: string | null | undefined,
  fallback = "—",
): string {
  const date = parse(iso);
  return date ? format(date, "d MMM yyyy, HH:mm:ss") : fallback;
}

/** "14:00 – 15:00 · 3 Oct 2026" for a scheduled window. */
export function formatWindow(startIso: string, endIso: string): string {
  const start = parse(startIso);
  const end = parse(endIso);
  if (!start || !end) return "—";

  const sameDay = format(start, "yyyy-MM-dd") === format(end, "yyyy-MM-dd");
  return sameDay
    ? `${format(start, "HH:mm")} – ${format(end, "HH:mm")} · ${format(start, "d MMM yyyy")}`
    : `${formatDateTime(startIso)} – ${formatDateTime(endIso)}`;
}

export function formatRelative(
  iso: string | null | undefined,
  fallback = "—",
): string {
  const date = parse(iso);
  if (!date) return fallback;
  return formatDistanceStrict(date, new Date(), { addSuffix: true });
}

/** Seconds → "1h 04m 09s", for attendance totals. */
export function formatDuration(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) return "0s";

  const seconds = Math.floor(totalSeconds % 60);
  const minutes = Math.floor((totalSeconds / 60) % 60);
  const hours = Math.floor(totalSeconds / 3600);

  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m ${String(seconds).padStart(2, "0")}s`;
  }
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
  return `${seconds}s`;
}

/** Countdown formatting for the informational call timer. */
export function formatCountdown(milliseconds: number): string {
  const clamped = Math.max(0, Math.floor(milliseconds / 1000));
  const seconds = clamped % 60;
  const minutes = Math.floor(clamped / 60) % 60;
  const hours = Math.floor(clamped / 3600);

  const pad = (value: number) => String(value).padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}
