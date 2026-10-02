// The public booking website (business-card QR code): no account needed.
import type { BookingInput, BookingResult, DriverInfo, RideStatus } from './api';
import { api } from './http';

export type BusinessInfo = {
  name: string;
  tagline_fr: string;
  tagline_en: string;
  phone: string | null;
  email: string | null;
  site_url: string | null;
  app_store_url: string | null;
  play_store_url: string | null;
};

export type GuestClient = { full_name: string; phone: string; email: string; language: 'fr' | 'en' };

/** What a guest sees on the private link of their ride. */
export type PublicRide = {
  status: RideStatus;
  pickup_at: string;
  pickup_address: string;
  dropoff_address: string;
  passengers: number;
  luggage: number;
  vehicle: 'sedan' | 'van';
  meet_greet: boolean;
  travel_ref: string | null;
  customer_notes: string | null;
  distance_m: number;
  duration_s: number;
  currency: string;
  is_fixed_price: boolean;
  estimated_price: number | null;
  proposed_price: number | null;
  agreed_price: number | null;
  final_price: number | null;
  answer_deadline: string | null;
  cancel_reason: string | null;
  client_name: string | null;
};

export const getBusiness = () => api.get<BusinessInfo>('/api/public/business');
export const getPublicDriver = () => api.get<DriverInfo>('/api/public/driver');

/** Price check: no client details needed yet. */
export const guestQuote = (ride: BookingInput) =>
  api.post<BookingResult & { access_token?: string }>('/api/public/bookings', { ride, dry_run: true });
export const guestBook = (client: GuestClient, ride: BookingInput) =>
  api.post<BookingResult & { access_token?: string }>('/api/public/bookings', { client, ride });

export const getGuestRide = (token: string) => api.get<PublicRide>(`/api/public/bookings/${encodeURIComponent(token)}`);
export const respondAsGuest = (token: string, accept: boolean) =>
  api.post<void>(`/api/public/bookings/${encodeURIComponent(token)}/respond`, { accept });
export const cancelAsGuest = (token: string) =>
  api.post<void>(`/api/public/bookings/${encodeURIComponent(token)}/cancel`);

/** Public address of the booking website: the configured one, or this site when running in a browser. */
export function siteUrl(business: BusinessInfo | null): string | null {
  const configured = business?.site_url?.replace(/\/+$/, '');
  if (configured) return configured;
  return typeof window !== 'undefined' && window.location ? window.location.origin : null;
}
