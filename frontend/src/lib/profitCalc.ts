// frontend/src/lib/profitCalc.ts
// IDENTISCH MIT backend/src/lib/profitCalc.ts (bewusste Duplizierung — siehe 05-RESEARCH.md Pattern 7)
// Aenderungen muessen beide Dateien synchron halten.

export type ReviewStatus =
  | 'vorgemerkt' | 'bestellt' | 'erhalten' | 'bewertet'
  | 'geld_erhalten' | 'bereit_verkauf'
  | 'behalten' | 'verkauft' | 'verschenkt' | 'entsorgt';

export interface ProfitInput {
  status: ReviewStatus;
  purchase_price_cents: number;
  refund_amount_cents: number | null;
  sale_amount_cents: number | null;
}

/** Status ab denen Profit realisiert wird (D-13). Pending-Stati ergeben Profit=0. */
export const REALIZING_STATUSES: ReviewStatus[] = [
  'geld_erhalten', 'bereit_verkauf', 'behalten', 'verkauft', 'verschenkt', 'entsorgt',
];

/**
 * Berechnet realisierten Profit in Cents (D-10 bis D-13).
 * Vor 'geld_erhalten' = 0. Danach (refund + sale) - purchase.
 * Darf negativ sein (User-Decision 2026-05-25): bei teilweisem Refund < Kaufpreis.
 */
export function calcProfit(r: ProfitInput): number {
  if (!REALIZING_STATUSES.includes(r.status)) return 0;
  const income = (r.refund_amount_cents ?? 0) + (r.sale_amount_cents ?? 0);
  return income - r.purchase_price_cents;
}
