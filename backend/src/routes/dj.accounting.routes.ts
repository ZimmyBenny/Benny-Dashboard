import { Router } from 'express';
import db from '../db/connection';

/**
 * DJ-Buchhaltung Read-Only-Sicht (Plan 04-11 Refactor).
 *
 * Aggregations-Quelle ist jetzt `receipts` WHERE area=DJ, NICHT mehr dj_invoices+dj_expenses.
 *
 * Strategie:
 * - Einnahmen kommen aus receipts mit type='ausgangsrechnung' (gespiegelt aus dj_invoices via djSyncService).
 * - Ausgaben kommen aus receipts mit type IN ('eingangsrechnung','beleg','fahrt','quittung','spesen')
 *   und area=DJ (manuell erfasst im Belege-Modul oder gespiegelt aus trips via tripSyncService).
 * - Response-Shape (Keys: revenue, expenses, profit, vat_collected, vat_input, vat_liability,
 *   unpaid_total, unpaid_count) bleibt KOMPATIBEL zur bestehenden API. Werte werden in EUR (REAL)
 *   zurueckgegeben — interne SUM ueber cents wird /100.0 gecastet, damit Frontend weiterlaeuft
 *   ohne Cents-Refactor.
 * - Stornierte Belege werden ausgenommen (status != 'storniert'); negative Betraege aus Storno-Mirrors
 *   sind dadurch automatisch eliminiert.
 */
const router = Router();

const DJ_AREA_FILTER = `
  EXISTS (
    SELECT 1 FROM receipt_area_links ral
    INNER JOIN areas a ON a.id = ral.area_id
    WHERE ral.receipt_id = r.id AND a.slug = 'dj'
  )
`;

const REVENUE_TYPE = `r.type = 'ausgangsrechnung'`;
const EXPENSE_TYPES = `r.type IN ('eingangsrechnung','beleg','fahrt','quittung','spesen')`;

// GET /api/dj/accounting/summary?year=2026
router.get('/summary', (req, res) => {
  const year = String(req.query.year ?? new Date().getFullYear());

  // Steuerart aus Settings — Ist-Versteuerung ist Default und entscheidet, welches
  // Datum massgeblich ist (payment_date vs. receipt_date) fuer USt-Aggregation.
  // Quelle: Auftrag Teil 3 — "Ist-Versteuerung (Default): USt einer Ausgangsrechnung
  // zaehlt im Monat des payment_date, nicht des receipt_date".
  const istRow = db
    .prepare(`SELECT value FROM app_settings WHERE key = 'ist_versteuerung'`)
    .get() as { value: string } | undefined;
  const istVersteuerung = (istRow?.value ?? 'true') !== 'false';

  // Einnahmen: nur bezahlte Ausgangsrechnungen (DJ), Stornos exkludiert
  const revenue = db.prepare(`
    SELECT COALESCE(SUM(r.amount_gross_cents), 0) / 100.0 AS total
    FROM receipts r
    WHERE ${REVENUE_TYPE}
      AND r.status = 'bezahlt'
      AND r.payment_date IS NOT NULL
      AND strftime('%Y', r.payment_date) = ?
      AND ${DJ_AREA_FILTER}
  `).get(year) as { total: number };

  // Ausgaben: bezahlte Eingangsrechnungen / Belege / Fahrten / Quittungen / Spesen (DJ)
  const expenses = db.prepare(`
    SELECT COALESCE(SUM(r.amount_gross_cents), 0) / 100.0 AS total
    FROM receipts r
    WHERE ${EXPENSE_TYPES}
      AND r.status = 'bezahlt'
      AND r.payment_date IS NOT NULL
      AND strftime('%Y', r.payment_date) = ?
      AND ${DJ_AREA_FILTER}
  `).get(year) as { total: number };

  // Eingenommene MwSt:
  //  - Ist-Versteuerung (Default): nur bezahlte Rechnungen, payment_date im Jahr
  //  - Soll-Versteuerung: alle freigegebenen Rechnungen, receipt_date im Jahr
  const vatCollected = db.prepare(
    istVersteuerung
      ? `SELECT COALESCE(SUM(r.vat_amount_cents), 0) / 100.0 AS total
         FROM receipts r
         WHERE ${REVENUE_TYPE}
           AND r.status = 'bezahlt'
           AND r.payment_date IS NOT NULL
           AND strftime('%Y', r.payment_date) = ?
           AND ${DJ_AREA_FILTER}`
      : `SELECT COALESCE(SUM(r.vat_amount_cents), 0) / 100.0 AS total
         FROM receipts r
         WHERE ${REVENUE_TYPE}
           AND r.freigegeben_at IS NOT NULL
           AND r.status != 'storniert'
           AND strftime('%Y', r.receipt_date) = ?
           AND ${DJ_AREA_FILTER}`,
  ).get(year) as { total: number };

  // Vorsteuer:
  //  - Ist-Versteuerung: nur bezahlte Eingangsrechnungen mit input_tax_deductible=1, payment_date im Jahr
  //  - Soll-Versteuerung: alle, receipt_date im Jahr
  const vatInput = db.prepare(
    istVersteuerung
      ? `SELECT COALESCE(SUM(r.vat_amount_cents), 0) / 100.0 AS total
         FROM receipts r
         WHERE ${EXPENSE_TYPES}
           AND r.input_tax_deductible = 1
           AND r.status = 'bezahlt'
           AND r.payment_date IS NOT NULL
           AND strftime('%Y', r.payment_date) = ?
           AND ${DJ_AREA_FILTER}`
      : `SELECT COALESCE(SUM(r.vat_amount_cents), 0) / 100.0 AS total
         FROM receipts r
         WHERE ${EXPENSE_TYPES}
           AND r.input_tax_deductible = 1
           AND r.status != 'storniert'
           AND strftime('%Y', r.receipt_date) = ?
           AND ${DJ_AREA_FILTER}`,
  ).get(year) as { total: number };

  // Offene Forderungen: DJ-Ausgangsrechnungen, finalized, status offen/teilbezahlt/ueberfaellig
  const unpaidInvoices = db.prepare(`
    SELECT
      COALESCE(SUM(r.amount_gross_cents - r.paid_amount_cents), 0) / 100.0 AS total,
      COUNT(*) AS count
    FROM receipts r
    WHERE ${REVENUE_TYPE}
      AND r.freigegeben_at IS NOT NULL
      AND r.status IN ('offen','teilbezahlt','ueberfaellig')
      AND ${DJ_AREA_FILTER}
  `).get() as { total: number; count: number };

  res.json({
    year,
    revenue: revenue.total,
    expenses: expenses.total,
    profit: revenue.total - expenses.total,
    vat_collected: vatCollected.total,
    vat_input: vatInput.total,
    vat_liability: vatCollected.total - vatInput.total,
    unpaid_total: unpaidInvoices.total,
    unpaid_count: unpaidInvoices.count,
  });
});

// GET /api/dj/accounting/payments?year=2026
// Read-Only-Sicht: bezahlte DJ-Ausgangsrechnungen aus receipts.
// Mappt receipts-Felder auf das alte DjPayment-Shape, damit Frontend (DjAccountingPage) ohne Aenderung weiterlaeuft.
router.get('/payments', (req, res) => {
  const year = String(req.query.year ?? new Date().getFullYear());
  const rows = db.prepare(`
    SELECT
      r.id                                    AS id,
      r.linked_invoice_id                     AS invoice_id,
      r.payment_date                          AS payment_date,
      (r.paid_amount_cents / 100.0)           AS amount,
      r.payment_method                        AS method,
      NULL                                    AS reference,
      r.receipt_number                        AS invoice_number,
      (r.amount_gross_cents / 100.0)          AS total_gross,
      (c.first_name || ' ' || c.last_name)    AS customer_name,
      c.organization_name                     AS customer_org
    FROM receipts r
    LEFT JOIN contacts c ON c.id = r.supplier_contact_id
    WHERE ${REVENUE_TYPE}
      AND r.status = 'bezahlt'
      AND r.payment_date IS NOT NULL
      AND strftime('%Y', r.payment_date) = ?
      AND ${DJ_AREA_FILTER}
    ORDER BY r.payment_date DESC
  `).all(year);
  res.json(rows);
});

// GET /api/dj/accounting/vat?year=2026&quarter=1
router.get('/vat', (req, res) => {
  const year = String(req.query.year ?? new Date().getFullYear());
  const quarter = req.query.quarter ? Number(req.query.quarter) : null;

  const quarters = quarter ? [quarter] : [1, 2, 3, 4];
  const result = quarters.map((q) => {
    const months = [(q - 1) * 3 + 1, (q - 1) * 3 + 2, (q - 1) * 3 + 3].map(m => String(m).padStart(2, '0'));

    const vatIn = db.prepare(`
      SELECT COALESCE(SUM(r.vat_amount_cents), 0) / 100.0 AS total FROM receipts r
      WHERE ${REVENUE_TYPE}
        AND r.freigegeben_at IS NOT NULL
        AND r.status != 'storniert'
        AND strftime('%Y', r.receipt_date) = ?
        AND strftime('%m', r.receipt_date) IN (?,?,?)
        AND ${DJ_AREA_FILTER}
    `).get(year, ...months) as { total: number };

    const vatInput = db.prepare(`
      SELECT COALESCE(SUM(r.vat_amount_cents), 0) / 100.0 AS total FROM receipts r
      WHERE ${EXPENSE_TYPES}
        AND r.input_tax_deductible = 1
        AND r.status != 'storniert'
        AND strftime('%Y', r.receipt_date) = ?
        AND strftime('%m', r.receipt_date) IN (?,?,?)
        AND ${DJ_AREA_FILTER}
    `).get(year, ...months) as { total: number };

    return {
      quarter: q,
      vat_collected: vatIn.total,
      vat_input: vatInput.total,
      vat_liability: vatIn.total - vatInput.total,
    };
  });

  res.json(result);
});

// GET /api/dj/accounting/trips?year=2026
// Read-Only-Sicht aus trips-Tabelle (Plan 04-06).
// Mappt trips-Felder auf das DjTrip-Shape, damit Frontend (DjTripsPage) ohne Aenderung weiterlaeuft.
router.get('/trips', (req, res) => {
  const year = String(req.query.year ?? new Date().getFullYear());

  const rows = db.prepare(`
    SELECT
      'manual'                          AS source,
      t.id                              AS id,
      t.linked_event_id                 AS event_id,
      t.expense_date                    AS date,
      e.title                           AS event_name,
      t.start_location                  AS start_location,
      t.end_location                    AS end_location,
      t.distance_km                     AS distance_km,
      t.purpose                         AS purpose,
      (t.amount_cents / 100.0)          AS reimbursement_amount,
      (t.rate_per_km_cents / 100.0)     AS mileage_rate,
      0                                 AS meal_allowance
    FROM trips t
    LEFT JOIN dj_events e ON e.id = t.linked_event_id
    WHERE strftime('%Y', t.expense_date) = ?
    ORDER BY t.expense_date DESC, t.id DESC
  `).all(year);

  res.json(rows);
});

export default router;
