// The public booking website (business-card QR code): no account needed.
import type { BookingInput, BookingResult, DriverInfo, RideStatus } from './api';
import type { ChatMessage } from './chat';
import { api } from './http';
import type { Moment } from './moments';
import type { GuestReview } from './reviews';

export type BusinessInfo = {
  name: string;
  tagline_fr: string;
  tagline_en: string;
  phone: string | null;
  email: string | null;
  site_url: string | null;
  app_store_url: string | null;
  play_store_url: string | null;
  driver_name: string | null;
  /** e.g. "Mercedes Classe E, noire". */
  car: string | null;
  /** Relative to the API address, versioned; null without a photo. */
  photo_url: string | null;
  /** « À bord »: what the driver offers in the car, in their order. */
  amenities: Amenity[];
  /** The car, as the driver describes it (photos outside and inside). */
  vehicle?: Vehicle;
  /** Company details for the legal pages (mentions légales, CGV, privacy). */
  legal?: LegalInfo;
};

export type LegalInfo = {
  company_name: string | null;
  legal_form: string | null;
  siret: string | null;
  vat_number: string | null;
  address: string | null;
  evtc_number: string | null;
  publication_director: string | null;
  insurance: string | null;
  payment_methods: string | null;
  mediator_name: string | null;
  mediator_url: string | null;
  host_name: string | null;
  host_address: string | null;
};

export type VehicleCategory = 'sedan' | 'van' | 'suv' | 'electric';
export type VehiclePhoto = { id: string; kind: 'exterior' | 'interior'; caption: string | null; url: string };
export type Vehicle = {
  model: string | null;
  color: string | null;
  category: VehicleCategory | null;
  year: number | null;
  features: string[];
  photos: VehiclePhoto[];
};

export type Amenity = { label_fr: string; label_en: string; detail_fr: string | null; detail_en: string | null };

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
  /** True once the ride is completed and the review is still open to changes. */
  pickup: { lat: number; lng: number } | null;
  dropoff: { lat: number; lng: number } | null;
  route: [number, number][] | null;
  can_review: boolean;
  review: GuestReview | null;
  /** The driver's live moments: on the way, arriving (automatic), arrived. */
  moments?: Moment[];
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

/** Where the driver is, shared only while the ride is near (204 = nothing to show). */
export type DriverPosition = {
  lat: number;
  lng: number;
  heading: number | null;
  updated_at: string;
  eta_to: 'pickup' | 'dropoff';
  eta_s: number | null;
  distance_m: number | null;
};
export const getDriverPosition = (token: string) =>
  api.get<DriverPosition | undefined>(`/api/public/bookings/${encodeURIComponent(token)}/driver`);

const ridePath = (token: string) => `/api/public/bookings/${encodeURIComponent(token)}`;

/** Messages with the driver about this ride, oldest first. */
export const getGuestMessages = (token: string) => api.get<ChatMessage[]>(`${ridePath(token)}/messages`);
export const sendGuestMessage = (token: string, body: string) => api.post<ChatMessage>(`${ridePath(token)}/messages`, { body });

/** Browser notifications: the server's VAPID public key, null when the feature is off. */
export const getWebPushKey = () => api.get<{ public_key: string | null }>('/api/public/web-push/key');
export type WebPushSubscription = { endpoint: string; keys: { p256dh: string; auth: string } };
export const addWebPush = (token: string, sub: WebPushSubscription) => api.post<void>(`${ridePath(token)}/web-push`, sub);
export const removeWebPush = (token: string, endpoint: string) => api.del<void>(`${ridePath(token)}/web-push`, { endpoint });
