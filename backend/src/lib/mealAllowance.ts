/**
 * Berechnung der Abwesenheitspauschale (Verpflegungsmehraufwand) je Fahrt.
 *
 * Verbindliche Berechnung findet ausschliesslich serverseitig statt. Aus Abfahrt-
 * und Rueckkehr-Uhrzeit wird die Abwesenheitsdauer ermittelt (Nacht-Gig:
 * Rueckkehr <= Abfahrt -> Folgetag, +24 Std). Die Saetze kommen aus dem
 * dj_settings 'tax'-JSON-Blob (meal_allowance_8h / meal_allowance_24h) — NICHT
 * hardcoden; Fallback 14/28 nur wenn Blob/Feld fehlt.
 */
import db from '../db/connection';

const TIME_RE = /^(\d{1,2}):(\d{2})$/;

/** Parst "HH:MM" zu Minuten seit Mitternacht; null bei ungueltigem Format. */
function toMinutes(value: string): number | null {
  const m = TIME_RE.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Ermittelt die Abwesenheitspauschale in Cents.
 *
 * - departure/return leer/null/undefined oder ungueltig -> 0.
 * - Folgetag-Logik: durationMin <= 0 -> +24 Std (Nacht-Gig).
 * - >=24 Std = 24h-Satz, >=8 Std = 8h-Satz, sonst 0.
 */
export function computeMealAllowanceCents(
  departureTime: string | null | undefined,
  returnTime: string | null | undefined,
): number {
  if (!departureTime || !returnTime) return 0;

  const depMin = toMinutes(departureTime);
  const retMin = toMinutes(returnTime);
  if (depMin === null || retMin === null) return 0;

  let durationMin = retMin - depMin;
  if (durationMin <= 0) durationMin += 24 * 60; // Nacht-Gig: Rueckkehr <= Abfahrt -> Folgetag
  const durationHours = durationMin / 60;

  // Saetze aus dj_settings 'tax'-Blob (EUR, REAL). Fallback 14/28 wenn fehlend.
  const settings = db
    .prepare("SELECT value FROM dj_settings WHERE key = 'tax'")
    .get() as { value: string } | undefined;
  let tax: Record<string, unknown> = {};
  if (settings) {
    try {
      tax = JSON.parse(settings.value) as Record<string, unknown>;
    } catch {
      tax = {};
    }
  }
  const rate8 = Number(tax.meal_allowance_8h) || 14;
  const rate24 = Number(tax.meal_allowance_24h) || 28;

  let rate = 0;
  if (durationHours >= 24) rate = rate24;
  else if (durationHours >= 8) rate = rate8;

  return Math.round(rate * 100); // EUR -> Cents
}
