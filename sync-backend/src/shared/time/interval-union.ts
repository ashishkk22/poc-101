export interface Interval {
  start: Date;
  end: Date;
}

/**
 * Attendance policy: total connected time is the UNION of a participant's
 * device session intervals, not the arithmetic sum.
 *
 *   Laptop 10:00-10:40 + Phone 10:20-10:50  ->  50 minutes, not 70.
 *
 * Using two devices must not inflate attendance.
 */
export function unionIntervals(intervals: Interval[]): Interval[] {
  const valid = intervals
    .filter((interval) => interval.end.getTime() > interval.start.getTime())
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const merged: Interval[] = [];

  for (const interval of valid) {
    const last = merged[merged.length - 1];
    if (last && interval.start.getTime() <= last.end.getTime()) {
      if (interval.end.getTime() > last.end.getTime()) {
        last.end = new Date(interval.end);
      }
      continue;
    }
    merged.push({ start: new Date(interval.start), end: new Date(interval.end) });
  }

  return merged;
}

/** Total seconds covered by the union of the supplied intervals. */
export function totalUnionSeconds(intervals: Interval[]): number {
  return unionIntervals(intervals).reduce(
    (total, interval) =>
      total + Math.floor((interval.end.getTime() - interval.start.getTime()) / 1000),
    0,
  );
}
