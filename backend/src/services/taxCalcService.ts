import db from '../db/connection';

/**
 * UStVA-Aggregations-Service.
 *
 * Liefert UStVA-konforme Buckets (Jahr / Quartal / Monat) für ein Steuerjahr.
 * Default ist Ist-Versteuerung über `payment_date` (kleinunternehmer-typisch:
 * Steuer wird erst fällig wenn die Zahlung eingegangen ist).
 *
 * Aggregations-Regeln:
 *  - Nur Belege mit `steuerrelevant = 1` werden gezählt.
 *  - Nur Belege mit `status = 'bezahlt'` und gesetztem `payment_date`.
 *  - `private_share_percent` reduziert die abzugsfähige Vorsteuer entsprechend.
 *  - Reverse-Charge §13b ist eine Nullsumme bei input_tax_deductible=1
 *    (Schuld in KZ85 + Vorsteuer in KZ67 heben sich auf).
 *
 * UStVA-Kennzahlen (Auszug):
 *   KZ 81 = Umsätze 19% (Netto)         — Ausgangsrechnungen
 *   KZ 86 = Umsätze 7%  (Netto)
 *   KZ 84 = §13b-Empfänger Bemessungsgrundlage
 *   KZ 85 = §13b-Empfänger USt-Schuld
 *   KZ 67 = Vorsteuer aus §13b
 *   KZ 66 = Vorsteuer inländische Eingangsrechnungen
 *   KZ 62 = Einfuhrumsatzsteuer (Vorsteuer)
 *   Zahllast = (KZ81-VAT + KZ86-VAT + KZ85) - (KZ66 + KZ67 + KZ62)
 */

export type UstvaPeriod = 'jahr' | 'quartal' | 'monat';

export interface UstvaBucket {
  /** Anzeige-Label, z.B. "2026", "2026 Q2", "Mai 2026" */
  label: string;
  year: number;
  /** 0 für Jahr, 1-4 für Quartal, 1-12 für Monat */
  period_index: number;
  /** KZ 81 — Netto-Summe Umsätze 19% */
  kz81_umsatz_19_net_cents: number;
  /** KZ 86 — Netto-Summe Umsätze 7% */
  kz86_umsatz_7_net_cents: number;
  /** Berechnet: Netto * 19% */
  kz81_vat_cents: number;
  /** Berechnet: Netto * 7% */
  kz86_vat_cents: number;
  /** KZ 66 — Vorsteuer inländisch (private_share_percent-bereinigt) */
  kz66_vorsteuer_cents: number;
  /** KZ 84 — §13b RC Bemessungsgrundlage */
  kz84_rc_net_cents: number;
  /** KZ 85 — §13b RC USt-Schuld */
  kz85_rc_vat_cents: number;
  /** KZ 67 — Vorsteuer aus §13b (private_share_percent-bereinigt) */
  kz67_rc_vorsteuer_cents: number;
  /** KZ 62 — Einfuhrumsatzsteuer */
  kz62_eust_cents: number;
  /** Zahllast (positiv = an Finanzamt zu zahlen, negativ = Erstattung) */
  zahllast_cents: number;
}

interface SumRow {
  cents: number;
}
interface RcSumRow {
  net_cents: number;
  vat_cents: number;
  vat_deductible_cents: number;
}

const MONAT_LABELS = [
  'Jan',
  'Feb',
  'Mär',
  'Apr',
  'Mai',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Okt',
  'Nov',
  'Dez',
] as const;

/**
 * Liefert die Liste der Monatsnummern (z.B. ['01','02','03']) für einen Bucket.
 * Bei Jahr → alle 12 Monate.
 */
function monthsForBucket(period: UstvaPeriod, idx: number): string[] {
  if (period === 'jahr') {
    return Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
  }
  if (period === 'quartal') {
    const start = (idx - 1) * 3 + 1;
    return [start, start + 1, start + 2].map((m) => String(m).padStart(2, '0'));
  }
  // Monat
  return [String(idx).padStart(2, '0')];
}

function bucketLabel(year: number, period: UstvaPeriod, idx: number): string {
  if (period === 'jahr') return String(year);
  if (period === 'quartal') return `${year} Q${idx}`;
  return `${MONAT_LABELS[idx - 1]} ${year}`;
}

/**
 * Aggregiert receipts zu UStVA-Buckets.
 *
 * @param year   Steuerjahr (z.B. 2026)
 * @param period 'jahr' (1 Bucket), 'quartal' (4), 'monat' (12)
 */
export function aggregateForUstva(year: number, period: UstvaPeriod): UstvaBucket[] {
  const indices: number[] =
    period === 'jahr'
      ? [0]
      : period === 'quartal'
        ? [1, 2, 3, 4]
        : [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

  return indices.map((idx) => {
    const months = monthsForBucket(period, idx === 0 ? 0 : idx);
    const placeholders = months.map(() => '?').join(',');

    // KZ 81 — vereinnahmte Umsätze 19% (Netto), Ist-Versteuerung über payment_date
    const kz81 = db
      .prepare(
        `
        SELECT COALESCE(SUM(amount_net_cents), 0) AS cents
        FROM receipts
        WHERE type = 'ausgangsrechnung'
          AND status = 'bezahlt'
          AND vat_rate = 19
          AND steuerrelevant = 1
          AND payment_date IS NOT NULL
          AND strftime('%Y', payment_date) = ?
          AND strftime('%m', payment_date) IN (${placeholders})
      `,
      )
      .get(String(year), ...months) as SumRow;

    // KZ 86 — Umsätze 7%
    const kz86 = db
      .prepare(
        `
        SELECT COALESCE(SUM(amount_net_cents), 0) AS cents
        FROM receipts
        WHERE type = 'ausgangsrechnung'
          AND status = 'bezahlt'
          AND vat_rate = 7
          AND steuerrelevant = 1
          AND payment_date IS NOT NULL
          AND strftime('%Y', payment_date) = ?
          AND strftime('%m', payment_date) IN (${placeholders})
      `,
      )
      .get(String(year), ...months) as SumRow;

    // KZ 66 — Vorsteuer aus inländischen Eingangsrechnungen, private_share-bereinigt
    const kz66 = db
      .prepare(
        `
        SELECT COALESCE(SUM(vat_amount_cents * (100 - private_share_percent) / 100), 0) AS cents
        FROM receipts
        WHERE type IN ('eingangsrechnung','beleg')
          AND status = 'bezahlt'
          AND vat_rate IN (7, 19)
          AND input_tax_deductible = 1
          AND reverse_charge = 0
          AND import_eust = 0
          AND steuerrelevant = 1
          AND payment_date IS NOT NULL
          AND strftime('%Y', payment_date) = ?
          AND strftime('%m', payment_date) IN (${placeholders})
      `,
      )
      .get(String(year), ...months) as SumRow;

    // KZ 84/85/67 — Reverse-Charge Empfänger (§13b)
    const rc = db
      .prepare(
        `
        SELECT
          COALESCE(SUM(amount_net_cents), 0) AS net_cents,
          COALESCE(SUM(vat_amount_cents), 0) AS vat_cents,
          COALESCE(SUM(CASE WHEN input_tax_deductible = 1
                            THEN vat_amount_cents * (100 - private_share_percent) / 100
                            ELSE 0 END), 0) AS vat_deductible_cents
        FROM receipts
        WHERE reverse_charge = 1
          AND status = 'bezahlt'
          AND steuerrelevant = 1
          AND payment_date IS NOT NULL
          AND strftime('%Y', payment_date) = ?
          AND strftime('%m', payment_date) IN (${placeholders})
      `,
      )
      .get(String(year), ...months) as RcSumRow;

    // KZ 62 — Einfuhrumsatzsteuer (gross_cents = bereits gezahlte EUSt)
    const eust = db
      .prepare(
        `
        SELECT COALESCE(SUM(amount_gross_cents), 0) AS cents
        FROM receipts
        WHERE import_eust = 1
          AND status = 'bezahlt'
          AND input_tax_deductible = 1
          AND steuerrelevant = 1
          AND payment_date IS NOT NULL
          AND strftime('%Y', payment_date) = ?
          AND strftime('%m', payment_date) IN (${placeholders})
      `,
      )
      .get(String(year), ...months) as SumRow;

    const kz81_vat = Math.round((kz81.cents * 19) / 100);
    const kz86_vat = Math.round((kz86.cents * 7) / 100);

    const zahllast =
      kz81_vat +
      kz86_vat +
      rc.vat_cents -
      (kz66.cents + rc.vat_deductible_cents + eust.cents);

    return {
      label: bucketLabel(year, period, idx === 0 ? 0 : idx),
      year,
      period_index: idx,
      kz81_umsatz_19_net_cents: kz81.cents,
      kz86_umsatz_7_net_cents: kz86.cents,
      kz81_vat_cents: kz81_vat,
      kz86_vat_cents: kz86_vat,
      kz66_vorsteuer_cents: kz66.cents,
      kz84_rc_net_cents: rc.net_cents,
      kz85_rc_vat_cents: rc.vat_cents,
      kz67_rc_vorsteuer_cents: rc.vat_deductible_cents,
      kz62_eust_cents: eust.cents,
      zahllast_cents: zahllast,
    } satisfies UstvaBucket;
  });
}

export const taxCalcService = { aggregateForUstva };
