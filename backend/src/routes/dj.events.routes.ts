import { Router } from 'express';
import db from '../db/connection';
import { logAudit } from '../services/dj.audit.service';
import { deleteEvent as deleteCalEvent } from '../services/calendarSwift.service';

const router = Router();

function loadEvent(id: number) {
  const event = db.prepare('SELECT * FROM dj_events WHERE id = ? AND deleted_at IS NULL').get(id);
  if (!event) return null;
  const statusHistory = db.prepare(
    'SELECT * FROM dj_event_status_history WHERE event_id = ? ORDER BY created_at ASC'
  ).all(id);
  const customer = event
    ? db.prepare(`
        SELECT c.id, c.salutation, c.first_name, c.last_name, c.organization_name, c.customer_number
        FROM contacts c WHERE c.id = ?
      `).get((event as { customer_id: number }).customer_id)
    : null;
  const location = event
    ? db.prepare('SELECT * FROM dj_locations WHERE id = ?').get((event as { location_id: number | null }).location_id)
    : null;
  const quotes = db.prepare(
    'SELECT id, number, status, total_gross FROM dj_quotes WHERE event_id = ? AND deleted_at IS NULL'
  ).all(id);
  const invoices = db.prepare(
    'SELECT id, number, status, total_gross FROM dj_invoices WHERE event_id = ?'
  ).all(id);
  return { ...event as object, statusHistory, customer, location, quotes, invoices };
}

// GET /api/dj/events
router.get('/', (req, res) => {
  const { year, status, event_type, q } = req.query as Record<string, string>;

  let sql = `
    SELECT
      e.*,
      c.first_name || ' ' || c.last_name AS customer_name,
      c.organization_name AS customer_org,
      COALESCE(e.venue_name, l.name) AS location_name,
      COALESCE(e.venue_city, l.city) AS location_city
    FROM dj_events e
    LEFT JOIN contacts c ON c.id = e.customer_id
    LEFT JOIN dj_locations l ON l.id = e.location_id
    WHERE e.deleted_at IS NULL
  `;
  const params: unknown[] = [];

  if (year) {
    sql += " AND strftime('%Y', e.event_date) = ?";
    params.push(year);
  } else {
    sql += " AND date(e.event_date) >= date('now')";
  }
  if (status) { sql += ' AND e.status = ?'; params.push(status); }
  if (event_type) { sql += ' AND e.event_type = ?'; params.push(event_type); }
  if (q) {
    sql += ' AND (c.first_name LIKE ? OR c.last_name LIKE ? OR c.organization_name LIKE ? OR l.name LIKE ? OR l.city LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like, like, like);
  }

  sql += year ? ' ORDER BY e.event_date DESC' : ' ORDER BY e.event_date ASC';
  res.json(db.prepare(sql).all(...params));
});

// GET /api/dj/events/:id
router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: 'Ungültige ID' }); return; }
  const event = loadEvent(id);
  if (!event) { res.status(404).json({ error: 'Event nicht gefunden' }); return; }
  res.json(event);
});

// POST /api/dj/events
router.post('/', (req, res) => {
  const {
    customer_id, location_id, title, event_type, event_date,
    time_start, time_end, setup_minutes, teardown_minutes,
    guests, status = 'anfrage', contact_on_site_name, contact_on_site_phone,
    contact_on_site_email, notes, source_channel,
    venue_name, venue_street, venue_zip, venue_city,
  } = req.body as Record<string, unknown>;

  if (!event_type) {
    res.status(400).json({ error: 'event_type ist erforderlich' });
    return;
  }

  const result = db.prepare(`
    INSERT INTO dj_events
      (customer_id, location_id, title, event_type, event_date, time_start, time_end,
       setup_minutes, teardown_minutes, guests, status,
       contact_on_site_name, contact_on_site_phone, contact_on_site_email, notes, source_channel,
       venue_name, venue_street, venue_zip, venue_city)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    customer_id ?? null, location_id ?? null, title ?? null, event_type, event_date,
    time_start ?? null, time_end ?? null, setup_minutes ?? 90, teardown_minutes ?? 90,
    guests ?? null, status, contact_on_site_name ?? null,
    contact_on_site_phone ?? null, contact_on_site_email ?? null, notes ?? null,
    source_channel ?? null,
    venue_name ?? null, venue_street ?? null, venue_zip ?? null, venue_city ?? null,
  );

  const newId = Number(result.lastInsertRowid);
  db.prepare(
    'INSERT INTO dj_event_status_history (event_id, from_status, to_status) VALUES (?, NULL, ?)'
  ).run(newId, status);

  logAudit(req, 'event', newId, 'create', undefined, { event_type, event_date, status });
  res.status(201).json(loadEvent(newId));
});

// PATCH /api/dj/events/:id
router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: 'Ungültige ID' }); return; }

  const existing = db.prepare('SELECT * FROM dj_events WHERE id = ? AND deleted_at IS NULL').get(id) as Record<string, unknown> | undefined;
  if (!existing) { res.status(404).json({ error: 'Event nicht gefunden' }); return; }

  const {
    customer_id, location_id, title, event_type, event_date,
    time_start, time_end, setup_minutes, teardown_minutes,
    guests, status, contact_on_site_name, contact_on_site_phone,
    contact_on_site_email, notes, cancellation_reason, source_channel,
    venue_name, venue_street, venue_zip, venue_city, calendar_uid,
    vorgespraech_datum, vorgespraech_ort, vorgespraech_notizen, vorgespraech_plz,
  } = req.body as Record<string, unknown>;

  const body = req.body as object;

  db.prepare(`
    UPDATE dj_events SET
      customer_id = COALESCE(?, customer_id),
      location_id = COALESCE(?, location_id),
      title = COALESCE(?, title),
      event_type = COALESCE(?, event_type),
      event_date = COALESCE(?, event_date),
      time_start = COALESCE(?, time_start),
      time_end = COALESCE(?, time_end),
      setup_minutes = COALESCE(?, setup_minutes),
      teardown_minutes = COALESCE(?, teardown_minutes),
      guests = COALESCE(?, guests),
      status = COALESCE(?, status),
      contact_on_site_name = COALESCE(?, contact_on_site_name),
      contact_on_site_phone = COALESCE(?, contact_on_site_phone),
      contact_on_site_email = COALESCE(?, contact_on_site_email),
      notes = COALESCE(?, notes),
      cancellation_reason = COALESCE(?, cancellation_reason),
      source_channel = COALESCE(?, source_channel),
      venue_name = COALESCE(?, venue_name),
      venue_street = COALESCE(?, venue_street),
      venue_zip = COALESCE(?, venue_zip),
      venue_city = COALESCE(?, venue_city),
      calendar_uid = ?,
      vorgespraech_datum = ?,
      vorgespraech_ort = ?,
      vorgespraech_notizen = ?,
      vorgespraech_plz = ?
    WHERE id = ?
  `).run(
    customer_id ?? null, location_id ?? null, title ?? null, event_type ?? null,
    event_date ?? null, time_start ?? null, time_end ?? null,
    setup_minutes ?? null, teardown_minutes ?? null, guests ?? null,
    status ?? null, contact_on_site_name ?? null, contact_on_site_phone ?? null,
    contact_on_site_email ?? null, notes ?? null, cancellation_reason ?? null,
    source_channel ?? null,
    venue_name ?? null, venue_street ?? null, venue_zip ?? null, venue_city ?? null,
    'calendar_uid' in body ? (calendar_uid ?? null) : (existing.calendar_uid ?? null),
    'vorgespraech_datum' in body ? (vorgespraech_datum ?? null) : (existing.vorgespraech_datum ?? null),
    'vorgespraech_ort' in body ? (vorgespraech_ort ?? null) : (existing.vorgespraech_ort ?? null),
    'vorgespraech_notizen' in body ? (vorgespraech_notizen ?? null) : (existing.vorgespraech_notizen ?? null),
    'vorgespraech_plz' in body ? (vorgespraech_plz ?? null) : (existing.vorgespraech_plz ?? null),
    id,
  );

  // Status-History Eintrag bei Status-Wechsel
  if (status && status !== existing.status) {
    db.prepare(
      'INSERT INTO dj_event_status_history (event_id, from_status, to_status) VALUES (?, ?, ?)'
    ).run(id, existing.status, status);
  }

  logAudit(req, 'event', id, 'update', existing, req.body);
  res.json(loadEvent(id));
});

// PATCH /api/dj/events/:id/vorgespraech — Vorgespräch-Status setzen
router.patch('/:id/vorgespraech', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: 'Ungültige ID' }); return; }

  const event = db.prepare('SELECT * FROM dj_events WHERE id = ? AND deleted_at IS NULL').get(id) as Record<string, unknown> | undefined;
  if (!event) { res.status(404).json({ error: 'Event nicht gefunden' }); return; }

  const { action, datum, ort, notizen, plz, km, calendar_uid } = req.body as {
    action: 'offen' | 'erledigt';
    datum?: string;
    ort?: string;
    notizen?: string;
    plz?: string;
    km?: number;
    calendar_uid?: string | null;
  };

  if (action === 'offen') {
    db.prepare(`
      UPDATE dj_events SET
        vorgespraech_status = 'offen',
        vorgespraech_datum = ?,
        vorgespraech_ort = ?,
        vorgespraech_notizen = ?,
        vorgespraech_plz = COALESCE(?, vorgespraech_plz),
        vorgespraech_calendar_uid = COALESCE(?, vorgespraech_calendar_uid)
      WHERE id = ?
    `).run(datum ?? null, ort ?? null, notizen ?? null, plz ?? null, calendar_uid ?? null, id);
  }

  if (action === 'erledigt') {
    // Kalender-Eintrag löschen falls vorhanden
    const calUid = event.vorgespraech_calendar_uid as string | null;
    if (calUid) {
      await deleteCalEvent(calUid).catch(() => null);
    }

    db.prepare(`
      UPDATE dj_events SET
        vorgespraech_status = 'erledigt',
        vorgespraech_km = ?,
        vorgespraech_calendar_uid = NULL
      WHERE id = ?
    `).run(km ?? null, id);

    // Fahrt-Ausgabe erstellen (0,30 € / km)
    if (km && km > 0) {
      const kmRound = Math.round(km);
      const amountGross = Math.round(kmRound * 0.30 * 100) / 100;
      const eventTitle = event.title as string || `Event #${id}`;
      const dateStr = (datum ?? new Date().toISOString().slice(0, 10));
      db.prepare(`
        INSERT INTO dj_expenses (expense_date, category, description, amount_gross, tax_rate, amount_net, vat_amount, notes)
        VALUES (?, 'fahrzeug', ?, ?, 0, ?, 0, ?)
      `).run(
        dateStr,
        `Fahrt Vorgespräch – ${eventTitle}`,
        amountGross,
        amountGross,
        `${kmRound} km × 0,30 €`,
      );
    }
  }

  res.json(loadEvent(id));
});

// DELETE /api/dj/events/:id (Soft-Delete)
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: 'Ungültige ID' }); return; }

  const existing = db.prepare('SELECT * FROM dj_events WHERE id = ? AND deleted_at IS NULL').get(id);
  if (!existing) { res.status(404).json({ error: 'Event nicht gefunden' }); return; }

  db.prepare("UPDATE dj_events SET deleted_at = datetime('now') WHERE id = ?").run(id);
  logAudit(req, 'event', id, 'delete', existing, undefined);
  res.json({ ok: true });
});

export default router;
