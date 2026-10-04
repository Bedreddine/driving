import { describe, expect, it } from 'vitest';
import { latestMoment, momentAt, momentTitleKey, sortMoments } from '../moments';

describe('driver moments', () => {
  it('keeps one moment per kind, in the order they happen', () => {
    const sorted = sortMoments([
      { kind: 'arrived', at: '2026-10-04T21:10:00Z' },
      { kind: 'on_the_way', at: '2026-10-04T20:40:00Z' },
      { kind: 'arriving', at: '2026-10-04T21:00:00Z' },
      { kind: 'on_the_way', at: '2026-10-04T20:45:00Z' },
    ]);
    expect(sorted.map((m) => m.kind)).toEqual(['on_the_way', 'arriving', 'arrived']);
    expect(sorted[0].at).toBe('2026-10-04T20:40:00Z');
  });

  it('ignores unknown kinds and bad dates', () => {
    expect(sortMoments([{ kind: 'teleported', at: '2026-10-04T20:40:00Z' }, { kind: 'arrived', at: 'soon' }, null])).toEqual([]);
    expect(sortMoments(undefined)).toEqual([]);
  });

  it('shows the furthest stage first, even if the clocks disagree', () => {
    expect(latestMoment([])).toBeNull();
    expect(
      latestMoment([
        { kind: 'arrived', at: '2026-10-04T21:00:00Z' },
        { kind: 'arriving', at: '2026-10-04T21:01:00Z' },
      ])?.kind,
    ).toBe('arrived');
  });

  it('finds when a moment was recorded', () => {
    const ms = [{ kind: 'on_the_way', at: '2026-10-04T20:40:00Z' }];
    expect(momentAt(ms, 'on_the_way')).toBe('2026-10-04T20:40:00Z');
    expect(momentAt(ms, 'arrived')).toBeNull();
    expect(momentTitleKey('arriving')).toBe('moment_arriving');
  });
});
