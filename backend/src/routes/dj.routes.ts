import { Router } from 'express';
import customersRouter from './dj.customers.routes';
import eventsRouter from './dj.events.routes';
import quotesRouter from './dj.quotes.routes';
import invoicesRouter from './dj.invoices.routes';
import servicesRouter from './dj.services.routes';
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
    "SELECT COUNT(*) AS count FROM dj_events WHERE status IN ('anfrage','neu','vorgespraech_vereinbart') AND deleted_at IS NULL"
  ).get() as { count: number };

  const pendingQuotes = db.prepare(
    "SELECT COUNT(*) AS count FROM dj_quotes WHERE status IN ('gesendet') AND deleted_at IS NULL"
  ).get() as { count: number };

  const confirmedEvents = db.prepare(
    "SELECT COUNT(*) AS count FROM dj_events WHERE status = 'bestaetigt' AND deleted_at IS NULL"
  ).get() as { count: number };

  const openVorgespraeche = db.prepare(
    "SELECT COUNT(*) AS count FROM dj_events WHERE vorgespraech_status = 'offen' AND deleted_at IS NULL"
  ).get() as { count: number };

  const completedEvents = db.prepare(`
    SELECT COUNT(*) AS count FROM dj_invoices
    WHERE is_cancellation = 0
      AND finalized_at IS NOT NULL
      AND strftime('%Y', invoice_date) = ?
  `).get(year) as { count: number };

  // Umsatz nach Rechnungs-Datum (Soll-Versteuerung). Konsistent zu
  // completed_events oben — beide zaehlen Rechnungen deren invoice_date
  // im ausgewaehlten Jahr liegt. Stornorechnungen ausgenommen.
  // Hinweis: /dj/accounting nutzt eine separate Logik (Ist-Versteuerung
  // ueber payment_date) und folgt damit dem app_settings.ist_versteuerung
  // Setting — fuer Buchhaltungs-/UStVA-Sicht. Hier auf der Dashboard-
  // Uebersicht ist die invoice_date-Sicht intuitiver.
  const revenueYear = db.prepare(`
    SELECT
      COALESCE(SUM(i.total_gross), 0) AS total,
      COALESCE(SUM(i.subtotal_net), 0) AS net,
      COALESCE(SUM(i.tax_total), 0) AS tax
    FROM dj_invoices i
    WHERE strftime('%Y', i.invoice_date) = ?
      AND i.is_cancellation = 0
      AND i.finalized_at IS NOT NULL
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

  // ── Auslastung Wochenenden (Fr/Sa/So) im ausgewaehlten Jahr ──────────────
  // Zwei Quellen werden vereinigt:
  //   - dj_events status='bestaetigt' (Status-Filter ja, Datenquelle nein-eng)
  //   - dj_invoices finalisiert nicht-storniert (= gespielte Veranstaltungen
  //     aus CSV-Bestand, deren invoice_date am Veranstaltungstag liegt)
  // Beide repraesentieren tatsaechlich gespielte/sicher gebuchte Wochenenden.
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  const eventDates = db.prepare(`
    SELECT event_date AS d FROM dj_events
    WHERE status = 'bestaetigt' AND deleted_at IS NULL
      AND event_date >= ? AND event_date <= ?
      AND strftime('%w', event_date) IN ('0','5','6')
  `).all(yearStart, yearEnd) as Array<{ d: string }>;

  // Bestand-Rechnungen: invoice_date am Mo/Di wird ggf. auf das Wochenende
  // davor gemappt (typischer Fall: Rechnung Anfang der Woche fuer
  // Veranstaltung am Wochenende). So zaehlt z.B. RE-1058 (Mo 16.02.2026
  // mit Event 15.02.2026) korrekt in KW 7.
  const invoiceDates = db.prepare(`
    SELECT invoice_date AS d FROM dj_invoices
    WHERE is_cancellation = 0 AND finalized_at IS NOT NULL
      AND invoice_date >= ? AND invoice_date <= ?
      AND strftime('%w', invoice_date) IN ('0','1','2','5','6')
  `).all(yearStart, yearEnd) as Array<{ d: string }>;

  // Detail-Listen fuer den Aufklapp-Bereich:
  const bookedEventDetails = db.prepare(`
    SELECT e.event_date AS date, e.event_type, e.title, e.status, 'event' AS source,
           COALESCE(c.organization_name, NULLIF(TRIM(c.first_name || ' ' || c.last_name), '')) AS customer
    FROM dj_events e
    LEFT JOIN contacts c ON c.id = e.customer_id
    WHERE e.status = 'bestaetigt' AND e.deleted_at IS NULL
      AND e.event_date >= ? AND e.event_date <= ?
      AND strftime('%w', e.event_date) IN ('0','5','6')
    ORDER BY e.event_date
  `).all(yearStart, yearEnd);

  const bookedInvoiceDetails = db.prepare(`
    SELECT i.invoice_date AS date, 'rechnung' AS event_type, i.subject AS title,
           i.status, 'invoice' AS source, i.total_gross,
           COALESCE(c.organization_name, NULLIF(TRIM(c.first_name || ' ' || c.last_name), '')) AS customer
    FROM dj_invoices i
    LEFT JOIN contacts c ON c.id = i.customer_id
    WHERE i.is_cancellation = 0 AND i.finalized_at IS NOT NULL
      AND i.invoice_date >= ? AND i.invoice_date <= ?
      AND strftime('%w', i.invoice_date) IN ('0','1','2','5','6')
    ORDER BY i.invoice_date
  `).all(yearStart, yearEnd);

  const pendingEventDetails = db.prepare(`
    SELECT e.event_date AS date, e.event_type, e.title, e.status, 'event' AS source,
           COALESCE(c.organization_name, NULLIF(TRIM(c.first_name || ' ' || c.last_name), '')) AS customer
    FROM dj_events e
    LEFT JOIN contacts c ON c.id = e.customer_id
    WHERE e.status IN ('anfrage','neu','vorgespraech_vereinbart','angebot_gesendet')
      AND e.deleted_at IS NULL
      AND e.event_date IS NOT NULL
    ORDER BY e.event_date
  `).all();

  // Wochen-Key-Berechnung mit Mo/Di-Heuristik fuer Bestand-Rechnungen:
  // Wenn invoice_date am Mo (dow=1) oder Di (dow=2) → das eigentliche Event
  // war typischerweise am Wochenende davor → Schluessel = Mo der VORIGEN Woche.
  // Fuer dj_events (event_date = exakt) nehmen wir immer Mo der gleichen Woche.
  function weekKey(d: string, isInvoice: boolean): string {
    const date = new Date(`${d}T00:00:00`);
    const dow = date.getDay();
    let daysBack = (dow + 6) % 7;
    if (isInvoice && (dow === 1 || dow === 2)) {
      daysBack += 7;
    }
    const monday = new Date(date);
    monday.setDate(date.getDate() - daysBack);
    return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
  }

  // Map<weekKey, count> — fuer Doppel-Booking-Counter
  const weekKeyCounts = new Map<string, number>();
  for (const { d } of eventDates) {
    const key = weekKey(d, false);
    weekKeyCounts.set(key, (weekKeyCounts.get(key) ?? 0) + 1);
  }
  for (const { d } of invoiceDates) {
    const key = weekKey(d, true);
    weekKeyCounts.set(key, (weekKeyCounts.get(key) ?? 0) + 1);
  }
  const booked = weekKeyCounts.size;
  const doubleBookings = Array.from(weekKeyCounts.values()).filter((c) => c >= 2).length;

  const weekendStats = {
    booked,
    total: 52,
    free: Math.max(0, 52 - booked),
    double_bookings: doubleBookings,
    booked_events: [...bookedEventDetails, ...bookedInvoiceDetails].sort(
      (a, b) => String((a as { date: string }).date).localeCompare(String((b as { date: string }).date)),
    ),
    pending_events: pendingEventDetails,
  };

  res.json({
    year,
    total_events: totalEvents.count,
    open_requests: openRequests.count,
    pending_quotes: pendingQuotes.count,
    confirmed_events: confirmedEvents.count,
    open_vorgespraeche: openVorgespraeche.count,
    completed_events: completedEvents.count,
    revenue_year: revenueYear.total,
    revenue_year_net: revenueYear.net,
    revenue_year_tax: revenueYear.tax,
    unpaid_total: unpaidInvoices.total,
    unpaid_count: unpaidInvoices.count,
    confirmed_revenue: confirmedRevenue.total,
    recent_completed: recentCompleted,
    weekend_stats: weekendStats,
  });
});

router.use('/customers', customersRouter);
router.use('/events', eventsRouter);
router.use('/quotes', quotesRouter);
router.use('/invoices', invoicesRouter);
router.use('/services', servicesRouter);
router.use('/accounting', accountingRouter);
router.use('/settings', settingsRouter);

export default router;
