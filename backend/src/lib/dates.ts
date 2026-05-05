/**
 * Datums-Helper fuer lokale Tag-Logik im Backend.
 *
 * Hintergrund: `new Date().toISOString().slice(0, 10)` liefert das Datum in UTC.
 * Auf einem Server in CEST (UTC+2) ist UTC-Mitternacht bereits der Vortag in
 * lokaler Zeit. Cronjobs die nachts laufen wuerden so den falschen Tag fuer
 * Faelligkeits-/Erinnerungs-Berechnungen verwenden.
 *
 * Diese Helper arbeiten konsequent in lokaler Server-Zeitzone (Europe/Berlin).
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
