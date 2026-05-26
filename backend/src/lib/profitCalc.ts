// backend/src/lib/profitCalc.ts
// IDENTISCH MIT frontend/src/lib/profitCalc.ts (bewusste Duplizierung — siehe 05-RESEARCH.md Pattern 7)
// Aenderungen muessen beide Dateien synchron halten.
// Drift-Check siehe Plan 05 Task 1: diff <(grep -v '^//' backend/...) <(grep -v '^//' frontend/...)

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

/**
 * Status ab denen das Item zum Saldo zaehlt (User-Decision 2026-05-26):
 * Sobald bestellt ist, ist das Geld weg. Vorgemerkte Items zaehlen NICHT,
 * weil noch nichts gekauft wurde.
 */
export const COMMITTED_STATUSES: ReviewStatus[] = [
  'bestellt', 'erhalten', 'bewertet',
  'geld_erhalten', 'bereit_verkauf',
  'behalten', 'verkauft', 'verschenkt', 'entsorgt',
];

/** @deprecated 2026-05-26: nutze COMMITTED_STATUSES. Bleibt als Alias fuer ggf. Migrationen. */
export const REALIZING_STATUSES = COMMITTED_STATUSES;

/**
 * Berechnet Saldo in Cents pro Item (User-Decision 2026-05-26).
 * Vorgemerkt = 0 (noch nicht gekauft).
 * Ab Bestellt: (refund + sale) - purchase
 *   - Bestellt ohne Refund -> negativ (-purchase)
 *   - Geld erhalten mit Refund == purchase -> 0
 *   - Verkauft mit Refund + Sale > purchase -> positiv
 * Darf negativ sein (User-Decision 2026-05-25): bei teilweisem Refund < Kaufpreis.
 */
export function calcProfit(r: ProfitInput): number {
  if (!COMMITTED_STATUSES.includes(r.status)) return 0;
  const income = (r.refund_amount_cents ?? 0) + (r.sale_amount_cents ?? 0);
  return income - r.purchase_price_cents;
}
