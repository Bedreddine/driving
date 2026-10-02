// All calls to the Spring Boot API in one place.

import { api, ApiError } from './http';

export type RideStatus =
  | 'requested'
  | 'price_proposed'
  | 'accepted'
  | 'declined'
  | 'declined_by_customer'
  | 'expired'
  | 'cancelled'
  | 'completed'
  | 'no_show';

export type Ride = {
  id: string;
  contact_id: string;
  driver_id: string;
  source: 'app' | 'phone' | 'whatsapp' | 'in_person' | 'other';
  status: RideStatus;
  pickup_at: string;
  pickup_address: string;
  pickup_lat: number;
  pickup_lng: number;
  dropoff_address: string;
  dropoff_lat: number;
  dropoff_lng: number;
  distance_m: number;
  duration_s: number;
  pickup_allowance_min: number;
  passengers: number;
  luggage: number;
  vehicle: 'sedan' | 'van';
  meet_greet: boolean;
  travel_ref: string | null;
  customer_notes: string | null;
  currency: string;
  is_fixed_price: boolean;
  estimated_price: number | null;
  proposed_price: number | null;
  agreed_price: number | null;
  final_price: number | null;
  answer_deadline: string | null;
  cancel_reason: string | null;
  created_at: string;
  access_token: string;
  contact?: { id: string; full_name: string; phone: string | null; email: string | null; language: 'fr' | 'en' } | null;
};

export type Place = { lat: number; lng: number; address: string };

export type BookingInput = {
  mode?: 'request' | 'quick_add';
  contact_id?: string;
  source?: 'phone' | 'whatsapp' | 'in_person' | 'other';
  pickup_at: string;
  pickup: Place;
  dropoff: Place;
  passengers?: number;
  luggage?: number;
  vehicle?: 'sedan' | 'van';
  meet_greet?: boolean;
  travel_ref?: string;
  customer_notes?: string;
  agreed_price?: number;
};

export type BookingResult = {
  ok: boolean;
  ride_id?: string;
  estimate?: number;
  currency?: string;
  is_fixed?: boolean;
  licence?: 'vtc' | 'taxi';
  errors?: string[];
  warnings?: string[];
  needs_override?: boolean;
  distance_m?: number;
  duration_s?: number;
  route_estimated?: boolean;
  error?: string;
};

export { ApiError };

export const quote = (ride: BookingInput) => api.post<BookingResult>('/api/rides', { ride, dry_run: true });
export const book = (ride: BookingInput, override = false) => api.post<BookingResult>('/api/rides', { ride, override });

const act = (id: string, action: string, body?: unknown) => api.post<void>(`/api/rides/${id}/${action}`, body);

export const acceptRide = (id: string) => act(id, 'accept');
export const proposePrice = (id: string, price: number) => act(id, 'propose-price', { price });
export const declineRide = (id: string, reason?: string) => act(id, 'decline', { reason: reason ?? null });
export const respondToPrice = (id: string, accept: boolean) => act(id, 'respond', { accept });
export const cancelRide = (id: string, reason?: string) => act(id, 'cancel', { reason: reason ?? null });
export const completeRide = (id: string, finalPrice?: number, reason?: string) =>
  act(id, 'complete', { final_price: finalPrice ?? null, reason: reason ?? null });
export const markNoShow = (id: string) => act(id, 'no-show');
export const linkContacts = (accountContact: string, existing: string) =>
  api.post<void>('/api/admin/contact-links', { account_contact_id: accountContact, existing_contact_id: existing });

export async function listRides(opts: { from?: string; to?: string; statuses?: RideStatus[]; limit?: number } = {}) {
  const q = new URLSearchParams();
  if (opts.from) q.set('from', opts.from);
  if (opts.to) q.set('to', opts.to);
  opts.statuses?.forEach((s) => q.append('status', s));
  if (opts.limit) q.set('limit', String(opts.limit));
  return api.get<Ride[]>(`/api/rides?${q}`);
}

export async function getRide(id: string): Promise<Ride | null> {
  try {
    return await api.get<Ride>(`/api/rides/${id}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

/** Pending request id -> id of the confirmed ride it overlaps. */
export const requestConflicts = () => api.get<Record<string, string>>('/api/rides/conflicts');

export const deleteMyAccount = () => api.del<void>('/api/me');

/** Re-render when any visible ride changes (WebSocket live updates, see liveUpdates.ts). */
export { subscribeRides } from './liveUpdates';

export type DriverInfo = {
  id: string;
  display_name: string;
  phone: string | null;
  seats: number;
  luggage: number;
  vehicle: 'sedan' | 'van';
  timezone: string;
  licence: 'vtc' | 'taxi';
  currency: string;
};

export const getDriver = () => api.get<DriverInfo>('/api/drivers/current').catch(() => null);
