// All calls to the backend in one place. Screens never write rides directly:
// bookings go through the ride-create function, status changes through database functions.

import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';

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
  contact?: { id: string; full_name: string; phone: string | null; email: string | null } | null;
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

/** Thrown with the server's short code (SLOT_TAKEN, FORBIDDEN, ...) as message. */
export class ApiError extends Error {}

const RIDE_FIELDS = '*, contact:contacts(id, full_name, phone, email)';

async function invokeRideCreate(body: Record<string, unknown>): Promise<BookingResult> {
  const { data, error } = await supabase.functions.invoke<BookingResult>('ride-create', { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = (await error.context.json().catch(() => ({}))) as BookingResult;
      throw new ApiError(payload.error ?? 'generic');
    }
    throw new ApiError('generic');
  }
  return data as BookingResult;
}

export const quote = (ride: BookingInput) => invokeRideCreate({ ride, dry_run: true });
export const book = (ride: BookingInput, override = false) => invokeRideCreate({ ride, override });

// Database functions raise a short code as the error message.
async function rpc(name: string, args: Record<string, unknown>) {
  const { error } = await supabase.rpc(name, args);
  if (error) throw new ApiError(/^[A-Z_]+$/.test(error.message) ? error.message : 'generic');
}

export const acceptRide = (id: string) => rpc('accept_ride', { p_ride: id });
export const proposePrice = (id: string, price: number) => rpc('propose_price', { p_ride: id, p_price: price });
export const declineRide = (id: string, reason?: string) => rpc('decline_ride', { p_ride: id, p_reason: reason ?? null });
export const respondToPrice = (id: string, accept: boolean) => rpc('respond_to_price', { p_ride: id, p_accept: accept });
export const cancelRide = (id: string, reason?: string) => rpc('cancel_ride', { p_ride: id, p_reason: reason ?? null });
export const completeRide = (id: string, finalPrice?: number, reason?: string) =>
  rpc('complete_ride', { p_ride: id, p_final_price: finalPrice ?? null, p_reason: reason ?? null });
export const markNoShow = (id: string) => rpc('mark_no_show', { p_ride: id });
export const linkContacts = (accountContact: string, existing: string) =>
  rpc('link_contacts', { p_account_contact: accountContact, p_existing_contact: existing });

export async function listRides(opts: { from?: string; to?: string; statuses?: RideStatus[]; limit?: number } = {}) {
  let q = supabase.from('rides').select(RIDE_FIELDS).order('pickup_at', { ascending: true });
  if (opts.from) q = q.gte('pickup_at', opts.from);
  if (opts.to) q = q.lt('pickup_at', opts.to);
  if (opts.statuses) q = q.in('status', opts.statuses);
  if (opts.limit) q = q.limit(opts.limit);
  const { data, error } = await q;
  if (error) throw new ApiError('generic');
  return (data ?? []) as Ride[];
}

export async function getRide(id: string) {
  const { data, error } = await supabase.from('rides').select(RIDE_FIELDS).eq('id', id).maybeSingle();
  if (error) throw new ApiError('generic');
  return data as Ride | null;
}

export async function requestConflicts(): Promise<Record<string, string>> {
  const { data } = await supabase.rpc('request_conflicts');
  const map: Record<string, string> = {};
  for (const row of (data ?? []) as { request_id: string; clashing_ride_id: string }[]) {
    map[row.request_id] = row.clashing_ride_id;
  }
  return map;
}

export async function deleteMyAccount() {
  const { error } = await supabase.functions.invoke('delete-account', { body: {} });
  if (error) {
    const payload =
      error instanceof FunctionsHttpError ? ((await error.context.json().catch(() => ({}))) as { error?: string }) : {};
    throw new ApiError(payload.error ?? 'generic');
  }
}

/** Re-render when any visible ride changes (Realtime). */
export function subscribeRides(onChange: () => void) {
  const channel = supabase
    .channel(`rides-${Math.random().toString(36).slice(2)}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'rides' }, onChange)
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}

export type DriverInfo = { id: string; display_name: string; phone: string | null; seats: number; luggage: number; vehicle: 'sedan' | 'van'; timezone: string };

export async function getDriver(): Promise<DriverInfo | null> {
  const { data } = await supabase
    .from('drivers')
    .select('id, display_name, phone, seats, luggage, vehicle, timezone')
    .eq('active', true)
    .order('created_at')
    .limit(1)
    .maybeSingle();
  return (data as DriverInfo | null) ?? null;
}
