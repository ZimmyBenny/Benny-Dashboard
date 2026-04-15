import { Router } from 'express';
import customersRouter from './dj.customers.routes';
import eventsRouter from './dj.events.routes';
import quotesRouter from './dj.quotes.routes';
import invoicesRouter from './dj.invoices.routes';
import servicesRouter from './dj.services.routes';
import expensesRouter from './dj.expenses.routes';
import accountingRouter from './dj.accounting.routes';
import settingsRouter from './dj.settings.routes';
import db from '../db/connection';

const router = Router();

// GET /api/dj/overview?year=2026 — Dashboard-Daten
router.get('/overview', (req, res) => {
  const year = String(req.query.year ?? new Date().getFullYear());

  const totalEvents = db.prepare(
    "SELECT COUNT(*) AS count FROM dj_events WHERE strftime('%Y', event_date) = ? AND deleted_at IS NULL"
  ).get(year) as { count: number };

  const openRequests = db.prepare(
    "SELECT COUNT(*) AS count FROM dj_events WHERE status IN ('neu','vorgespraech_vereinbart') AND deleted_at IS NULL"
  ).get() as { count: number };

  const pendingQuotes = db.prepare(
    "SELECT COUNT(*) AS count FROM dj_quotes WHERE status IN ('gesendet') AND deleted_at IS NULL"
  ).get() as { count: number };

  const confirmedEvents = db.prepare(
    "SELECT COUNT(*) AS count FROM dj_events WHERE status = 'bestaetigt' AND deleted_at IS NULL"
  ).get() as { count: number };

  const completedEvents = db.prepare(
    "SELECT COUNT(*) AS count FROM dj_events WHERE status = 'abgeschlossen' AND strftime('%Y', event_date) = ? AND deleted_at IS NULL"
  ).get(year) as { count: number };

  const revenueYear = db.prepare(`
    SELECT
      COALESCE(SUM(p.amount), 0) AS total,
      COALESCE(SUM(i.subtotal_net), 0) AS net,
      COALESCE(SUM(i.tax_total), 0) AS tax
    FROM dj_payments p
    JOIN dj_invoices i ON i.id = p.invoice_id
    WHERE strftime('%Y', p.payment_date) = ? AND i.is_cancellation = 0
  `).get(year) as { total: number; net: number; tax: number };

  const unpaidInvoices = db.prepare(`
    SELECT COALESCE(SUM(total_gross - paid_amount), 0) AS total, COUNT(*) AS count
    FROM dj_invoices
    WHERE finalized_at IS NOT NULL AND status IN ('offen','teilbezahlt','ueberfaellig') AND is_cancellation = 0
  `).get() as { total: number; count: number };

  const confirmedRevenue = db.prepare(`
    SELECT COALESCE(SUM(i.total_gross), 0) AS total
    FROM dj_invoices i
    JOIN dj_events e ON e.id = i.event_id
    WHERE e.status = 'bestaetigt' AND i.status IN ('offen','teilbezahlt') AND i.finalized_at IS NOT NULL
  `).get() as { total: number };

  const recentCompleted = db.prepare(`
    SELECT e.id, e.title, e.event_type, e.event_date,
           c.first_name || ' ' || c.last_name AS customer_name, c.organization_name
    FROM dj_events e
    LEFT JOIN contacts c ON c.id = e.customer_id
    WHERE e.status = 'abgeschlossen' AND e.deleted_at IS NULL
    ORDER BY e.event_date DESC
    LIMIT 3
  `).all();

  res.json({
    year,
    total_events: totalEvents.count,
    open_requests: openRequests.count,
    pending_quotes: pendingQuotes.count,
    confirmed_events: confirmedEvents.count,
    completed_events: completedEvents.count,
    revenue_year: revenueYear.total,
    revenue_year_net: revenueYear.net,
    revenue_year_tax: revenueYear.tax,
    unpaid_total: unpaidInvoices.total,
    unpaid_count: unpaidInvoices.count,
    confirmed_revenue: confirmedRevenue.total,
    recent_completed: recentCompleted,
  });
});

router.use('/customers', customersRouter);
router.use('/events', eventsRouter);
router.use('/quotes', quotesRouter);
router.use('/invoices', invoicesRouter);
router.use('/services', servicesRouter);
router.use('/expenses', expensesRouter);
router.use('/accounting', accountingRouter);
router.use('/settings', settingsRouter);

export default router;
