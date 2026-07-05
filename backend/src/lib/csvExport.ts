/**
 * CSV-Helper für Steuerberater-Exporte (reine Funktionen, kein DB-Zugriff).
 *
 * Format-Konvention (deutsche Excel-Kompatibilität):
 *  - Semikolon als Feldtrenner (nicht Komma — Komma ist Dezimaltrenner).
 *  - Komma als Dezimaltrenner (z.B. 0,30 statt 0.30).
 *  - UTF-8 mit BOM, damit Excel Umlaute (Ä/Ö/Ü/ä/ö/ü/ß) korrekt erkennt.
 *  - CRLF-Zeilenumbrüche.
 */

/** BOM-Zeichen U+FEFF — vorangestellt, damit Excel die Datei als UTF-8 liest. */
export const CSV_BOM = '﻿';

/**
 * Serialisiert eine Zelle CSV-sicher: null/undefined → ''; bei ; \n \r " wird
 * der Wert in "..." gewrappt und enthaltene " werden zu "" verdoppelt.
 */
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (/[;\n\r"]/.test(s)) {
    s = `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Cents → Euro-String mit Komma-Dezimal (z.B. 8700 → "87,00"). */
export function eurFromCents(cents: number | null | undefined): string {
  return ((cents ?? 0) / 100).toFixed(2).replace('.', ',');
}

/** Stunden mit einer Nachkommastelle und Komma-Dezimal (z.B. 12 → "12,0"). */
export function hoursDecimal(hours: number): string {
  return hours.toFixed(1).replace('.', ',');
}

/** Beliebige Zahl mit fester Nachkommastellen-Zahl und Komma-Dezimal (z.B. €/km 0,30). */
export function plainDecimal(value: number, digits = 2): string {
  return value.toFixed(digits).replace('.', ',');
}

/**
 * Baut die komplette CSV aus Headern + Zeilen. Jede Zelle wird über csvCell
 * escaped, Felder mit ';' getrennt, Zeilen mit CRLF. Rückgabe MIT vorangestelltem BOM.
 */
export function buildCsv(headers: string[], rows: string[][]): string {
  const body = [headers, ...rows]
    .map((r) => r.map(csvCell).join(';'))
    .join('\r\n');
  return CSV_BOM + body;
}
