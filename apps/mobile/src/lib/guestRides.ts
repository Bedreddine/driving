// Bookings made as a guest on this phone or browser, so their private links are not lost
// when the app or tab is closed. Kept on the device only.
import { authStorage } from './storage';

const KEY = 'taxi.guestRides';
const MAX = 20;

export type SavedGuestRide = { token: string; pickup_at: string; from: string; to: string };

export function savedGuestRides(): SavedGuestRide[] {
  try {
    const raw = authStorage?.getItem(KEY);
    return raw ? (JSON.parse(raw) as SavedGuestRide[]) : [];
  } catch {
    return [];
  }
}

export function rememberGuestRide(ride: SavedGuestRide) {
  try {
    const others = savedGuestRides().filter((r) => r.token !== ride.token);
    authStorage?.setItem(KEY, JSON.stringify([ride, ...others].slice(0, MAX)));
  } catch {
    // storage unavailable (private browsing): the link was also sent by email
  }
}
