import { describe, expect, it } from 'vitest';
import { totalUnionSeconds, unionIntervals } from '../../src/shared/time/interval-union.js';

const at = (iso: string) => new Date(`2026-09-22T${iso}.000Z`);

describe('attendance interval union', () => {
  it('merges overlapping device sessions instead of summing them', () => {
    // Laptop 10:00-10:40 + phone 10:20-10:50 is 50 minutes, not 70.
    const total = totalUnionSeconds([
      { start: at('10:00:00'), end: at('10:40:00') },
      { start: at('10:20:00'), end: at('10:50:00') },
    ]);
    expect(total).toBe(50 * 60);
  });

  it('sums disjoint sessions', () => {
    const total = totalUnionSeconds([
      { start: at('10:00:00'), end: at('10:10:00') },
      { start: at('10:30:00'), end: at('10:45:00') },
    ]);
    expect(total).toBe(25 * 60);
  });

  it('treats touching intervals as continuous', () => {
    const merged = unionIntervals([
      { start: at('10:00:00'), end: at('10:30:00') },
      { start: at('10:30:00'), end: at('11:00:00') },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.end.toISOString()).toBe(at('11:00:00').toISOString());
  });

  it('absorbs a session fully contained in another', () => {
    const total = totalUnionSeconds([
      { start: at('10:00:00'), end: at('11:00:00') },
      { start: at('10:15:00'), end: at('10:30:00') },
    ]);
    expect(total).toBe(60 * 60);
  });

  it('ignores zero-length and inverted intervals', () => {
    expect(totalUnionSeconds([{ start: at('10:00:00'), end: at('10:00:00') }])).toBe(0);
    expect(totalUnionSeconds([{ start: at('10:30:00'), end: at('10:00:00') }])).toBe(0);
    expect(totalUnionSeconds([])).toBe(0);
  });

  it('handles unordered input', () => {
    const total = totalUnionSeconds([
      { start: at('10:20:00'), end: at('10:50:00') },
      { start: at('10:00:00'), end: at('10:40:00') },
    ]);
    expect(total).toBe(50 * 60);
  });
});
