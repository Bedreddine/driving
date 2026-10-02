// Client reviews ("reference clients"): left from the private ride link after a completed ride,
// shown on the booking page only with the client's consent and after the owner approves them.
import { api } from './http';

export type ReviewStatus = 'pending' | 'approved' | 'hidden';

export type GuestReview = { rating: number; comment: string | null; show_publicly: boolean; city: string | null; status: ReviewStatus };
export type ReviewInput = { rating: number; comment: string; show_publicly: boolean; city: string };

/** An approved review, as shown in the guest book. */
export type PublicReview = { rating: number; comment: string | null; display_name: string; city: string | null; month: string };

export type AdminReview = {
  id: string;
  ride_id: string;
  client_name: string;
  display_name: string;
  rating: number;
  comment: string | null;
  show_publicly: boolean;
  city: string | null;
  status: ReviewStatus;
  pickup_at: string;
  created_at: string;
};

export const sendReview = (token: string, review: ReviewInput) =>
  api.put<void>(`/api/public/bookings/${encodeURIComponent(token)}/review`, review);
export const getPublicReviews = () => api.get<PublicReview[]>('/api/public/reviews');

export const listReviews = (status?: ReviewStatus) =>
  api.get<AdminReview[]>(`/api/admin/reviews${status ? `?status=${status}` : ''}`);
export const approveReview = (id: string) => api.post<void>(`/api/admin/reviews/${id}/approve`);
export const hideReview = (id: string) => api.post<void>(`/api/admin/reviews/${id}/hide`);
