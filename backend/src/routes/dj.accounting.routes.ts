import { Router } from 'express';
import db from '../db/connection';

const router = Router();

// GET /api/dj/accounting/summary?year=2026
router.get('/summary', (req, res) => {
  const year = String(req.query.year ?? new Date().getFullYear());

  const revenue = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM dj_payments p
    JOIN dj_invoices i ON i.id = p.invoice_id
    WHERE strftime('%Y', p.payment_date) = ? AND i.is_cancellation = 0
  `).get(year) as { total: number };

  const expenses = db.prepare(`
    SELECT COALESCE(SUM(amount_gross), 0) AS total
    FROM dj_expenses
    WHERE strftime('%Y', expense_date) = ? AND deleted_at IS NULL
  `).get(year) as { total: number };

  const vatCollected = db.prepare(`
    SELECT COALESCE(SUM(tax_total), 0) AS total
    FROM dj_invoices
    WHERE strftime('%Y', invoice_date) = ? AND finalized_at IS NOT NULL AND is_cancellation = 0 AND status != 'storniert'
  `).get(year) as { total: number };

  const vatInput = db.prepare(`
    SELECT COALESCE(SUM(vat_amount), 0) AS total
    FROM dj_expenses
    WHERE strftime('%Y', expense_date) = ? AND deleted_at IS NULL
  `).get(year) as { total: number };

  const unpaidInvoices = db.prepare(`
    SELECT COALESCE(SUM(total_gross - paid_amount), 0) AS total, COUNT(*) AS count
    FROM dj_invoices
    WHERE finalized_at IS NOT NULL AND status IN ('offen','teilbezahlt','ueberfaellig') AND is_cancellation = 0
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
router.get('/payments', (req, res) => {
  const year = String(req.query.year ?? new Date().getFullYear());
  const rows = db.prepare(`
    SELECT p.*, i.number AS invoice_number, i.total_gross,
           c.first_name || ' ' || c.last_name AS customer_name,
           c.organization_name AS customer_org
    FROM dj_payments p
    JOIN dj_invoices i ON i.id = p.invoice_id
    LEFT JOIN contacts c ON c.id = i.customer_id
    WHERE strftime('%Y', p.payment_date) = ?
    ORDER BY p.payment_date DESC
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
      SELECT COALESCE(SUM(tax_total), 0) AS total FROM dj_invoices
      WHERE strftime('%Y', invoice_date) = ? AND strftime('%m', invoice_date) IN (?,?,?)
        AND finalized_at IS NOT NULL AND is_cancellation = 0 AND status != 'storniert'
    `).get(year, ...months) as { total: number };

    const vatInput = db.prepare(`
      SELECT COALESCE(SUM(vat_amount), 0) AS total FROM dj_expenses
      WHERE strftime('%Y', expense_date) = ? AND strftime('%m', expense_date) IN (?,?,?)
        AND deleted_at IS NULL
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
router.get('/trips', (req, res) => {
  const year = String(req.query.year ?? new Date().getFullYear());
  const rows = db.prepare(`
    SELECT * FROM v_dj_trips WHERE year = ? ORDER BY date
  `).all(Number(year));

  const settings = db.prepare("SELECT value FROM dj_settings WHERE key = 'tax'").get() as { value: string } | undefined;
  const tax = settings ? JSON.parse(settings.value) : {};
  const mileageRate = tax.mileage_rate_per_km ?? 0.30;
  const meal8h = tax.meal_allowance_8h ?? 14;
  const meal24h = tax.meal_allowance_24h ?? 28;

  const withMeal = (rows as Array<Record<string, number>>).map((r) => ({
    ...r,
    meal_allowance:
      r.absence_hours >= 24 ? meal24h :
      r.absence_hours >= 8  ? meal8h  : 0,
    mileage_rate: mileageRate,
  }));

  res.json(withMeal);
});

export default router;
