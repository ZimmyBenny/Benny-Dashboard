/**
 * Single source of truth für Cents-Math.
 *
 * Regel: ALLE Geld-Werte sind INTEGER in Cents — Konvertierung von/zu EUR
 * passiert ausschließlich an dieser Stelle. Niemals Float-Math im Service-
 * oder Route-Code (Float-Drift verfälscht UStVA-Aggregation).
 */

/** Konvertiert einen EUR-Wert (number) zu Cents (INTEGER). */
export function toCents(eur: number): number {
  return Math.round(eur * 100);
}

/** Konvertiert Cents (INTEGER) zu EUR (number, 2 Nachkommastellen). */
export function toEur(cents: number): number {
  return cents / 100;
}

/**
 * USt-Betrag in Cents aus Netto + Rate (z.B. 19 für 19%).
 * Rate=0 → 0 (kein USt-Aufschlag, z.B. Versicherung, Bankgebühren).
 */
export function calcVatCents(netCents: number, ratePercent: number): number {
  if (ratePercent === 0) return 0;
  return Math.round((netCents * ratePercent) / 100);
}

/** Brutto = Netto + berechnete USt. */
export function calcGrossCents(netCents: number, ratePercent: number): number {
  return netCents + calcVatCents(netCents, ratePercent);
}

/**
 * Netto aus Brutto + Rate.
 * Formel: Netto = Brutto * 100 / (100 + rate)
 * Rate=0 → Brutto unverändert.
 */
export function calcNetCents(grossCents: number, ratePercent: number): number {
  if (ratePercent === 0) return grossCents;
  return Math.round((grossCents * 100) / (100 + ratePercent));
}

/**
 * Parst einen User-Input-Betragsstring zu Cents.
 *
 * Erkannte Formate:
 *  - DE-Format mit Tausender + Dezimal: "1.234,56" → 123456
 *  - DE-Format ohne Tausender:           "1234,56"  → 123456
 *  - EN-Format:                          "1234.56"  → 123456
 *  - Mit Währungs-Suffix:                "999,99 €" → 99999
 *
 * Verwendet von receiptParserService und Settings-CRUD.
 */
export function parseAmountToCents(s: string): number {
  const cleaned = s.replace(/[^\d.,\-]/g, '');
  let normalized: string;
  if (cleaned.includes('.') && cleaned.includes(',')) {
    // DE-Format: '.' = Tausender, ',' = Dezimal
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (cleaned.includes(',')) {
    // Nur ',' → DE-Dezimal
    normalized = cleaned.replace(',', '.');
  } else {
    // Nur '.' oder nichts → EN-Format / Integer
    normalized = cleaned;
  }
  const f = parseFloat(normalized);
  if (Number.isNaN(f)) return 0;
  return Math.round(f * 100);
}
