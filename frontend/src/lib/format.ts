export const formatCurrency = (value: number): string =>
  new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(value);

export const formatNumber = (value: number, digits = 0): string =>
  new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);

export const formatDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '–';
  try {
    return new Intl.DateTimeFormat('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
};

export const formatDateTime = (dateStr: string | null | undefined): string => {
  if (!dateStr) return '–';
  try {
    return new Intl.DateTimeFormat('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
};

export const formatKm = (km: number | null | undefined): string =>
  km != null ? `${formatNumber(km, 1)} km` : '–';

/**
 * Formatiert einen Cent-Wert als EUR-String mit DE-Format ("1.234,56 €").
 * Negative Werte (z.B. Stornorechnungen) werden mit Minus angezeigt.
 *
 * Konvention: Geld-Werte werden im Backend als INTEGER (Cents) gespeichert
 * (siehe Phase 04 Plan 02). Dieser Helper ist die UI-Boundary, an der
 * Cents → EUR konvertiert werden.
 *
 * @param cents - Cent-Wert (number | null | undefined)
 * @param currency - ISO-4217 Currency-Code (default 'EUR')
 * @returns formatierter String oder '–' bei null/undefined/NaN
 */
export function formatCurrencyFromCents(
  cents: number | null | undefined,
  currency = 'EUR',
): string {
  if (cents === null || cents === undefined || Number.isNaN(cents)) return '–';
  const eur = cents / 100;
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(eur);
}
