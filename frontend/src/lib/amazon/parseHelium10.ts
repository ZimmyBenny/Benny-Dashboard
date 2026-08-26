import * as XLSX from 'xlsx';
import type { Helium10ImportRow } from '../../api/amazon.keywords.api';

// Ergebnis des Parsens einer Helium-10-Datei (Cerebro oder Magnet).
export interface ParsedHelium10 {
  type: 'cerebro' | 'magnet';
  rows: Helium10ImportRow[];      // dedupliziert (max. Volumen, ASINs vereinigt)
  detectedAsins: string[];        // alle ASINs aus Rang-Spalten
  matchedAsins: string[];         // davon: in deinen Quellen vorhanden
  keywordHeader: string | null;   // erkannte Keyword-Spalte
  volumeHeader: string | null;    // erkannte Suchvolumen-Spalte
  error?: string;                 // gesetzt, wenn nicht verwertbar
}

const ASIN_RE = /B0[A-Z0-9]{8}/i;

function toNumber(v: unknown): number | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === '' || s === '-') return null;
  const digits = s.replace(/[^\d]/g, ''); // "1,500" / "1.500" -> "1500"
  if (digits === '') return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

// Rang-Zelle „rankt"? nicht leer, nicht „-", nicht „0".
function isRanked(v: unknown): boolean {
  if (v == null) return false;
  const s = String(v).trim();
  return s !== '' && s !== '-' && s !== '0';
}

/**
 * Parst eine Helium-10-Datei (xlsx oder csv, als ArrayBuffer) in Import-Zeilen.
 * @param data       Dateiinhalt
 * @param knownAsins ASINs aus den Quellen des Produkts (für Abgleich der Rang-Spalten)
 */
export function parseHelium10(data: ArrayBuffer, knownAsins: string[]): ParsedHelium10 {
  const empty: ParsedHelium10 = { type: 'magnet', rows: [], detectedAsins: [], matchedAsins: [], keywordHeader: null, volumeHeader: null };
  const knownSet = new Set(knownAsins.map(a => a.trim().toLowerCase()).filter(Boolean));

  let matrix: unknown[][];
  try {
    const wb = XLSX.read(data, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) return { ...empty, error: 'Keine Tabelle in der Datei gefunden.' };
    matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false, defval: '' });
  } catch {
    return { ...empty, error: 'Datei konnte nicht gelesen werden (xlsx/csv erwartet).' };
  }
  if (matrix.length < 2) return { ...empty, error: 'Datei enthält keine Datenzeilen.' };

  const headers = (matrix[0] as unknown[]).map(h => String(h ?? '').trim());
  const findCol = (test: RegExp): number => headers.findIndex(h => test.test(h));

  let keywordCol = findCol(/keyword\s*phrase/i);
  if (keywordCol < 0) keywordCol = findCol(/^keyword/i);
  let volumeCol = findCol(/search\s*volume/i);
  if (volumeCol < 0) volumeCol = findCol(/suchvolumen/i);
  if (keywordCol < 0) return { ...empty, error: 'Keine „Keyword"-Spalte gefunden.' };

  // ASIN-Rang-Spalten erkennen: Header enthält eine ASIN (B0…) ODER ist exakt eine bekannte ASIN.
  const asinCols: { idx: number; asin: string }[] = [];
  headers.forEach((h, idx) => {
    if (idx === keywordCol || idx === volumeCol) return;
    const m = h.match(ASIN_RE);
    let asin: string | null = m ? m[0] : null;
    if (!asin && knownSet.has(h.toLowerCase())) asin = h;
    if (asin) asinCols.push({ idx, asin });
  });

  const detectedAsins = Array.from(new Set(asinCols.map(c => c.asin)));
  const matchedAsins = detectedAsins.filter(a => knownSet.has(a.toLowerCase()));
  const type: 'cerebro' | 'magnet' = asinCols.length > 0 ? 'cerebro' : 'magnet';

  // Zeilen einlesen + Duplikate zusammenführen.
  const byPhrase = new Map<string, Helium10ImportRow>();
  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r] as unknown[];
    const phrase = String(row[keywordCol] ?? '').trim();
    if (!phrase) continue;
    const vol = volumeCol >= 0 ? toNumber(row[volumeCol]) : null;
    const asins: string[] = [];
    for (const c of asinCols) if (isRanked(row[c.idx])) asins.push(c.asin);

    const key = phrase.toLowerCase();
    const prev = byPhrase.get(key);
    if (prev) {
      const a = prev.search_volume, b = vol;
      prev.search_volume = a == null ? b : b == null ? a : Math.max(a, b); // max. bekanntes Volumen
      prev.asins = Array.from(new Set([...prev.asins, ...asins]));
    } else {
      byPhrase.set(key, { phrase, search_volume: vol, asins: Array.from(new Set(asins)) });
    }
  }

  return {
    type,
    rows: Array.from(byPhrase.values()),
    detectedAsins,
    matchedAsins,
    keywordHeader: headers[keywordCol] ?? null,
    volumeHeader: volumeCol >= 0 ? (headers[volumeCol] ?? null) : null,
  };
}
