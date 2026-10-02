import type { Lang } from './i18n';

// All times are shown in the driver's timezone so customers and driver see the same clock.
export const BUSINESS_TZ = 'Europe/Paris';

const locale = (lang: Lang) => (lang === 'en' ? 'en-GB' : 'fr-FR');

export function formatDateTime(iso: string, lang: Lang) {
  return new Intl.DateTimeFormat(locale(lang), {
    timeZone: BUSINESS_TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

export function formatTime(iso: string, lang: Lang) {
  return new Intl.DateTimeFormat(locale(lang), { timeZone: BUSINESS_TZ, hour: '2-digit', minute: '2-digit' }).format(
    new Date(iso),
  );
}

export function formatDay(iso: string, lang: Lang) {
  return new Intl.DateTimeFormat(locale(lang), {
    timeZone: BUSINESS_TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date(iso));
}

export function formatPrice(amount: number | null | undefined, currency = 'EUR', lang: Lang = 'fr') {
  if (amount === null || amount === undefined) return '—';
  return new Intl.NumberFormat(locale(lang), { style: 'currency', currency }).format(Number(amount));
}

export const formatKm = (m: number, lang: Lang = 'fr') =>
  `${new Intl.NumberFormat(locale(lang), { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(m / 1000)} km`;
export const formatMinutes = (s: number) => `${Math.round(s / 60)} min`;

/** YYYY-MM-DD of an instant in the business timezone, used to group rides by day. */
export function dayKey(iso: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
  return parts;
}

/** Parse a user-typed price like "45", "45,50" or "45.5". Returns null when not a valid amount. */
export function parsePrice(text: string): number | null {
  const cleaned = text.replace(/\s|€/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Number(cleaned);
}

// ---------------------------------------------------------------------------
// Paris wall-clock <-> instant. Pickers show Paris time whatever the phone's timezone.
// ---------------------------------------------------------------------------
export type WallClock = { year: number; month: number; day: number; hour: number; minute: number };

export function toWallClock(iso: string | Date, tz = BUSINESS_TZ): WallClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(iso));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute') };
}

/** The instant (ISO, UTC) at which the given wall-clock time happens in the business timezone. */
export function fromWallClock(w: WallClock, tz = BUSINESS_TZ): string {
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute);
  // Offset of tz at a given instant, in ms. Two passes handle days when the clocks change.
  const offsetAt = (ms: number) => {
    const s = toWallClock(new Date(ms), tz);
    return Date.UTC(s.year, s.month - 1, s.day, s.hour, s.minute) - ms;
  };
  let guess = asUtc - offsetAt(asUtc);
  guess = asUtc - offsetAt(guess);
  return new Date(guess).toISOString();
}

/** Evening from 19:00 to 07:00, Paris time: the client pages switch to the evening palette. */
export function isEveningInParis(at: Date | number) {
  const { hour } = toWallClock(new Date(at));
  return hour >= 19 || hour < 7;
}

const TITLES = new Set(['mr', 'mrs', 'ms', 'miss', 'mme', 'm', 'mlle', 'dr', 'sir', 'madame', 'monsieur']);

/** How a client appears publicly: "James Smith" → "J. Smith". Same rule as the server. */
export function displayName(fullName: string | null | undefined): string {
  const words = (fullName ?? '').trim().split(/\s+/).filter(Boolean);
  while (words.length > 1 && TITLES.has(words[0].toLowerCase().replace(/\.$/, ''))) words.shift();
  if (words.length === 0) return '';
  if (words.length === 1) return words[0];
  return `${words[0][0].toUpperCase()}. ${words[words.length - 1]}`;
}

/** "2026-09" → "septembre 2026" / "September 2026". */
export function monthLabel(month: string, lang: Lang): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, 15)),
  );
}
