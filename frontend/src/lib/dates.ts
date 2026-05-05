/**
 * Datums-Helper fuer lokale Tag-Logik.
 *
 * Hintergrund: `new Date().toISOString().slice(0, 10)` liefert das Datum in UTC.
 * In CEST (UTC+2) ist UTC-Mitternacht bereits der Vortag in lokaler Zeit, und
 * Apple-All-Day-Events kommen als z.B. `2026-05-09T22:00:00Z` (= 10.05. lokal).
 * Ein UTC-Slice wuerde solche Events am falschen Tag einsortieren bzw. das
 * "heute"-Datum zwischen 00:00 und 02:00 lokaler Zeit auf den Vortag setzen.
 *
 * Diese Helper arbeiten konsequent in lokaler Zeitzone.
 */

/** Liefert YYYY-MM-DD aus einem Date-Objekt — in der lokalen Zeitzone. */
export function isoDateLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Liefert das heutige Datum als YYYY-MM-DD in der lokalen Zeitzone. */
export function todayLocal(): string {
  return isoDateLocal(new Date());
}

/** Addiert eine Anzahl Tage zu einem YYYY-MM-DD-String und liefert das Ergebnis als YYYY-MM-DD. */
export function addDaysLocal(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return isoDateLocal(date);
}

/** Parst einen YYYY-MM-DD-String als lokale Mitternacht (nicht UTC). */
export function parseLocalDate(isoDate: string): Date {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d);
}
