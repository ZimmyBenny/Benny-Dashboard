/**
 * Receipt-Parser fuer deutsche Belege.
 *
 * Extrahiert strukturierte Felder aus dem OCR-Volltext:
 *  - Lieferant (Heuristik: kuerzere Zeile in den ersten 10 Zeilen ohne Schluesselwoerter)
 *  - Datum (DE/ISO/internationale Formate, mit "Rechnungsdatum:"-Praefix → hoehere Konfidenz)
 *  - Brutto-Betrag (DE-Format mit Tausender-Punkt + Komma-Dezimal)
 *  - Netto + USt-Betrag (auto-berechnet aus Brutto + Rate)
 *  - USt-Satz (0/7/19)
 *  - Belegnummer
 *  - IBAN (DE-Format)
 *  - Reverse-Charge (§ 13b UStG)
 *
 * Jedes Feld kommt als ParsedField<T> mit confidence 0..1.
 * Konsumenten (receiptService.applyOcrResult) entscheiden anhand Konfidenz, ob
 * sie das Feld uebernehmen.
 */
import type { ParsedReceipt, ParsedField } from '../types/receipt';

function makeField<T>(value: T | null = null, confidence = 0): ParsedField<T> {
  return { value, confidence };
}

// ----------------------------------------------------------------------------
// DATE
// ----------------------------------------------------------------------------

interface DatePattern {
  re: RegExp;
  conf: number;
  format: 'dmy' | 'ymd';
}

const DATE_PATTERNS: DatePattern[] = [
  // "Rechnungsdatum: 05.05.2026" — explizites Schluesselwort → hohe Konfidenz
  {
    re: /(?:Rechnungsdatum|Datum|Belegdatum|Date|Invoice Date)[:\s]*(\d{1,2})[.\/\-](\d{1,2})[.\/\-](\d{2,4})/i,
    conf: 0.9,
    format: 'dmy',
  },
  // ISO-Format ohne Praefix: "2026-05-05"
  { re: /\b(\d{4})-(\d{2})-(\d{2})\b/, conf: 0.7, format: 'ymd' },
  // DE-Format ohne Praefix: "05.05.2026"
  { re: /\b(\d{1,2})\.(\d{1,2})\.(\d{4})\b/, conf: 0.5, format: 'dmy' },
];

function normalizeDmy(d: string, m: string, y: string): string {
  const yyyy = y.length === 2 ? `20${y}` : y;
  return `${yyyy}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

// ----------------------------------------------------------------------------
// AMOUNT
// ----------------------------------------------------------------------------

const AMOUNT_PATTERNS: Array<{ re: RegExp; conf: number }> = [
  // Mit Schluesselwort: "Gesamtbetrag: 1.234,56 €" → hohe Konfidenz
  {
    re: /(?:Gesamt(?:betrag|summe)?|Brutto|Total|Summe|Rechnungsbetrag|Endbetrag|Endsumme|zu zahlen)[:\s]*(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2}|\d+\.\d{2})\s*(?:€|EUR)?/i,
    conf: 0.85,
  },
  // Generisches Geld am Zeilenende: "999,99 €"
  {
    re: /(\d{1,3}(?:\.\d{3})*,\d{2}|\d+\.\d{2})\s*(?:€|EUR)\s*$/m,
    conf: 0.5,
  },
];

function parseAmountToCents(s: string): number {
  // Erkennt sowohl "1.234,56" (DE) als auch "1234.56" (EN)
  let normalized: string;
  if (s.includes(',')) {
    normalized = s.replace(/\./g, '').replace(',', '.');
  } else {
    normalized = s;
  }
  return Math.round(parseFloat(normalized) * 100);
}

// ----------------------------------------------------------------------------
// VAT-RATE
// ----------------------------------------------------------------------------

const VAT_RATE_PATTERNS: Array<{ re: RegExp; conf: number }> = [
  // "USt 19%" / "MwSt: 7 %" / "Umsatzsteuer 0%"
  { re: /(?:USt|MwSt|Umsatzsteuer|VAT)[:\s.\-]*\s*(19|7|0)\s*%/i, conf: 0.9 },
  { re: /\b(19|7)\s*%\s*(?:USt|MwSt|VAT|Steuer)/i, conf: 0.85 },
];

// ----------------------------------------------------------------------------
// REVERSE-CHARGE
// ----------------------------------------------------------------------------

const RC_PATTERNS = [
  /Reverse[\s-]Charge/i,
  /§\s*13b\s*UStG/i,
  /Steuerschuldnerschaft\s*des\s*Leistungsempf/i,
];

// ----------------------------------------------------------------------------
// INVOICE-NR
// ----------------------------------------------------------------------------

const INVOICE_NR_PATTERNS: Array<{ re: RegExp; conf: number }> = [
  {
    re: /(?:Rechnungs[\s-]?(?:Nr|Nummer)|Beleg[\s-]?(?:Nr|Nummer)|Invoice (?:No|Number))[.:\s]*([A-Z0-9\-/]{3,30})/i,
    conf: 0.9,
  },
];

// ----------------------------------------------------------------------------
// IBAN
// ----------------------------------------------------------------------------

const IBAN_PATTERN = /\b(DE\d{2}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{4}\s?\d{2})\b/;

// ----------------------------------------------------------------------------
// SUPPLIER
// ----------------------------------------------------------------------------

function extractSupplier(text: string): ParsedField<string> {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  for (const line of lines.slice(0, 10)) {
    if (line.length < 3 || line.length > 60) continue;
    if (/^\d/.test(line)) continue;
    if (/(rechnung|invoice|datum|date|beleg|kunde|empf)/i.test(line)) continue;
    return makeField(line, 0.5);
  }
  return makeField<string>(null, 0);
}

// ----------------------------------------------------------------------------
// MAIN
// ----------------------------------------------------------------------------

export function parse(text: string): ParsedReceipt {
  const result: ParsedReceipt = {
    supplier_name: extractSupplier(text),
    supplier_invoice_number: makeField<string>(null, 0),
    receipt_date: makeField<string>(null, 0),
    amount_gross_cents: makeField<number>(null, 0),
    amount_net_cents: makeField<number>(null, 0),
    vat_amount_cents: makeField<number>(null, 0),
    vat_rate: makeField<number>(null, 0),
    iban: makeField<string>(null, 0),
    reverse_charge: makeField<boolean>(false, 1.0),
  };

  // Datum: Pattern mit groesster Konfidenz gewinnt
  for (const p of DATE_PATTERNS) {
    const m = text.match(p.re);
    if (!m) continue;
    if (result.receipt_date.value && p.conf <= result.receipt_date.confidence) continue;
    if (p.format === 'ymd') {
      // m[1]=YYYY, m[2]=MM, m[3]=DD
      result.receipt_date = makeField(`${m[1]}-${m[2]}-${m[3]}`, p.conf);
    } else {
      // dmy: m[1]=D, m[2]=M, m[3]=Y
      result.receipt_date = makeField(normalizeDmy(m[1], m[2], m[3]), p.conf);
    }
  }

  // Brutto
  for (const p of AMOUNT_PATTERNS) {
    const m = text.match(p.re);
    if (m) {
      result.amount_gross_cents = makeField(parseAmountToCents(m[1]), p.conf);
      break;
    }
  }

  // USt-Satz
  for (const p of VAT_RATE_PATTERNS) {
    const m = text.match(p.re);
    if (m) {
      result.vat_rate = makeField(parseInt(m[1], 10), p.conf);
      break;
    }
  }

  // Belegnummer
  for (const p of INVOICE_NR_PATTERNS) {
    const m = text.match(p.re);
    if (m) {
      result.supplier_invoice_number = makeField(m[1], p.conf);
      break;
    }
  }

  // IBAN
  const ibanMatch = text.match(IBAN_PATTERN);
  if (ibanMatch) {
    result.iban = makeField(ibanMatch[1].replace(/\s/g, ''), 0.95);
  }

  // Reverse-Charge
  if (RC_PATTERNS.some((re) => re.test(text))) {
    result.reverse_charge = makeField(true, 0.95);
  }

  // Net + Vat aus Brutto + Rate auto-berechnen, falls nicht direkt extrahiert
  if (
    result.amount_gross_cents.value !== null &&
    result.vat_rate.value !== null &&
    result.vat_rate.value > 0
  ) {
    const gross = result.amount_gross_cents.value;
    const rate = result.vat_rate.value;
    const netCents = Math.round((gross * 100) / (100 + rate));
    const vatCents = gross - netCents;
    result.amount_net_cents = makeField(netCents, result.amount_gross_cents.confidence * 0.9);
    result.vat_amount_cents = makeField(vatCents, result.amount_gross_cents.confidence * 0.9);
  }

  return result;
}

export const receiptParserService = { parse };
