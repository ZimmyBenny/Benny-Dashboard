import apiClient from './client';

export type ReviewStatus =
  | 'vorgemerkt' | 'bestellt' | 'erhalten' | 'bewertet'
  | 'geld_erhalten' | 'bereit_verkauf'
  | 'behalten' | 'verkauft' | 'verschenkt' | 'entsorgt';

export interface Review {
  id: number;
  product_name: string;
  product_url: string | null;
  purchase_price_cents: number;
  status: ReviewStatus;
  order_date: string | null;
  received_date: string | null;
  review_deadline: string | null;
  refund_code: string | null;
  refund_amount_cents: number | null;
  sale_amount_cents: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReviewStats {
  total: number;
  open_refunds: number;
  spent_cents: number;
  received_cents: number;
  realized_profit_cents: number;
}

export interface CreateReviewInput {
  product_name: string;
  product_url?: string | null;
  purchase_price_cents: number;
  order_date?: string | null;
  received_date?: string | null;
  review_deadline?: string | null;
  refund_code?: string | null;
  refund_amount_cents?: number | null;
  sale_amount_cents?: number | null;
  notes?: string | null;
}

export const fetchReviews = (year?: number | 'all'): Promise<Review[]> =>
  apiClient.get<Review[]>('/finance/reviews', {
    params: year !== undefined ? { year } : undefined,
  }).then(r => r.data);

export const fetchReviewStats = (year?: number | 'all'): Promise<ReviewStats> =>
  apiClient.get<ReviewStats>('/finance/reviews/stats', {
    params: year !== undefined ? { year } : undefined,
  }).then(r => r.data);

export const createReview = (data: CreateReviewInput): Promise<Review> =>
  apiClient.post<Review>('/finance/reviews', data).then(r => r.data);

export const patchReview = (id: number, data: Partial<Review>): Promise<Review> =>
  apiClient.patch<Review>(`/finance/reviews/${id}`, data).then(r => r.data);

export const deleteReview = (id: number): Promise<void> =>
  apiClient.delete(`/finance/reviews/${id}`).then(() => undefined);
