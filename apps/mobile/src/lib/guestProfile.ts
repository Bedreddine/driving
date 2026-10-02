// "Remember me on this device": the guest's details and last places, kept on the phone or browser only
// (never sent anywhere else), with their consent, so the next booking is just a confirmation.
import type { Place } from './api';
import { authStorage } from './storage';

export type GuestProfile = { full_name: string; phone: string; email: string; saved_at: string };

const PROFILE = 'taxi.guestProfile';
const RECENT = 'taxi.recentPlaces';
const LAST_TRIP = 'taxi.lastTrip';
const RIDES = 'taxi.guestRides';
const MAX_RECENT = 6;

function read<T>(key: string): T | null {
  try {
    const raw = authStorage?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    authStorage?.setItem(key, JSON.stringify(value));
  } catch {
    // storage unavailable (private browsing): nothing is remembered, booking still works
  }
}

export const loadProfile = () => read<GuestProfile>(PROFILE);
export const recentPlaces = () => read<Place[]>(RECENT) ?? [];
export const lastTrip = () => read<{ from: Place; to: Place }>(LAST_TRIP);

/** Called after a booking when the guest ticked "remember me". */
export function rememberGuest(details: Omit<GuestProfile, 'saved_at'>, from: Place, to: Place, now = new Date()) {
  write(PROFILE, { ...details, saved_at: now.toISOString() });
  write(RECENT, addRecent(recentPlaces(), [to, from]));
  write(LAST_TRIP, { from, to });
}

/** The guest unticked "remember me": their details and places are erased (their ride links stay). */
export const forgetDetails = () => erase([PROFILE, RECENT, LAST_TRIP]);
/** Withdraws consent: everything this app kept about the guest on this device is erased. */
export const forgetGuest = () => erase([PROFILE, RECENT, LAST_TRIP, RIDES]);

function erase(keys: string[]) {
  for (const key of keys) {
    try {
      authStorage?.removeItem(key);
    } catch {
      // nothing to erase
    }
  }
}

/** Newest first, no duplicates (same address), at most six. */
export function addRecent(list: Place[], places: Place[]): Place[] {
  const merged = [...places, ...list];
  return merged.filter((p, i) => merged.findIndex((q) => q.address === p.address) === i).slice(0, MAX_RECENT);
}

/** A place in a link (/book?from=…&to=…): "48.868100,2.329000,Ritz Paris, 15 Place Vendôme". */
export const encodePlace = (p: Place) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)},${p.address}`;
export function decodePlace(s: string | undefined | null): Place | null {
  if (!s) return null;
  const m = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(.+)$/s.exec(s);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng, address: m[3] };
}

/** "Mr James Smith" → "James" (for "Welcome back, James"). */
export function firstName(full: string) {
  const titles = new Set(['mr', 'mrs', 'ms', 'miss', 'mme', 'm', 'mlle', 'dr', 'monsieur', 'madame']);
  const words = full.trim().split(/\s+/).filter(Boolean);
  while (words.length > 1 && titles.has(words[0].toLowerCase().replace(/\.$/, ''))) words.shift();
  return words[0] ?? '';
}
