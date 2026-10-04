// The driver's live moments of a confirmed ride: on the way, arriving (set by the server from the live
// position, within 2.5 km) and arrived. Pure helpers (no React Native), tested with vitest.

export type MomentKind = 'on_the_way' | 'arriving' | 'arrived';
export type Moment = { kind: MomentKind; at: string };

/** The order they happen in. A later stage wins over an earlier one, whatever the clocks say. */
export const MOMENT_ORDER: readonly MomentKind[] = ['on_the_way', 'arriving', 'arrived'];
const rank = (k: MomentKind) => MOMENT_ORDER.indexOf(k);

const isMoment = (m: unknown): m is Moment =>
  !!m &&
  typeof (m as Moment).at === 'string' &&
  !Number.isNaN(Date.parse((m as Moment).at)) &&
  MOMENT_ORDER.includes((m as Moment).kind);

/** Known moments, one per kind (the first time it was recorded), in the order they happen. */
export function sortMoments(moments: readonly unknown[] | null | undefined): Moment[] {
  const first = new Map<MomentKind, Moment>();
  for (const m of moments ?? []) {
    if (!isMoment(m)) continue;
    const seen = first.get(m.kind);
    if (!seen || Date.parse(m.at) < Date.parse(seen.at)) first.set(m.kind, { kind: m.kind, at: m.at });
  }
  return [...first.values()].sort((a, b) => rank(a.kind) - rank(b.kind));
}

/** The furthest stage reached: what the client should see first. */
export function latestMoment(moments: readonly unknown[] | null | undefined): Moment | null {
  const sorted = sortMoments(moments);
  return sorted.length ? sorted[sorted.length - 1] : null;
}

/** When a moment was recorded, or null. */
export function momentAt(moments: readonly unknown[] | null | undefined, kind: MomentKind): string | null {
  return sortMoments(moments).find((m) => m.kind === kind)?.at ?? null;
}

/** Text keys (i18n) of each moment, as the client reads it and as the driver's button says it. */
export const momentTitleKey = (kind: MomentKind) => `moment_${kind}` as const;
