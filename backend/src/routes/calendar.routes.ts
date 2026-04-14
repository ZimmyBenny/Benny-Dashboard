import { Router } from 'express';
import db from '../db/connection';
import {
  getAllCalendars, syncRange, createEvent, updateEvent, deleteEvent, fullSync,
} from '../services/calendarSwift.service';

const router = Router();

// GET /api/calendar/calendars — Alle Kalender (inkl. ausgeblendete) fuer Toggle-Chips
router.get('/calendars', async (_req, res) => {
  const calendars = await getAllCalendars();
  res.json(calendars);
});

// PATCH /api/calendar/calendars/:id — Sichtbarkeit toggling
router.patch('/calendars/:id', (req, res) => {
  const { id } = req.params;
  const { is_visible } = req.body as { is_visible: boolean };

  if (typeof is_visible !== 'boolean') {
    return res.status(400).json({ error: 'is_visible (boolean) required' });
  }

  const result = db.prepare('UPDATE calendars SET is_visible = ? WHERE id = ?')
    .run(is_visible ? 1 : 0, id);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Calendar not found' });
  }

  res.json({ ok: true });
});

// GET /api/calendar/events?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/events', async (req, res) => {
  const { from, to } = req.query as { from?: string; to?: string };

  if (!from || !to) {
    // Default: aktueller Monat
    const now = new Date();
    const defaultFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const defaultTo = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    await syncRange(defaultFrom, defaultTo);
    const rows = db.prepare(
      "SELECT * FROM calendar_events WHERE start_at >= ? AND start_at <= ? ORDER BY start_at"
    ).all(`${defaultFrom}T00:00:00.000Z`, `${defaultTo}T23:59:59.000Z`);
    return res.json(rows);
  }

  // Sync triggern (cached wenn < 5 Min alt)
  await syncRange(from, to);

  const rows = db.prepare(
    "SELECT * FROM calendar_events WHERE start_at >= ? AND start_at <= ? ORDER BY start_at"
  ).all(`${from}T00:00:00.000Z`, `${to}T23:59:59.000Z`);
  res.json(rows);
});

// POST /api/calendar/events — Neues Event erstellen
router.post('/events', async (req, res) => {
  const {
    title, start_at, end_at, calendar_id,
    is_all_day = false, location, notes, alarm_minutes,
  } = req.body as {
    title: string;
    start_at: string;
    end_at: string;
    calendar_id: string;
    is_all_day?: boolean;
    location?: string;
    notes?: string;
    alarm_minutes?: number;
  };

  if (!title || !start_at || !end_at || !calendar_id) {
    return res.status(400).json({ error: 'title, start_at, end_at, calendar_id required' });
  }

  const event = await createEvent({ title, start_at, end_at, calendar_id, is_all_day, location, notes, alarm_minutes });
  res.status(201).json({ ok: true, event });
});

// POST /api/calendar/sync — Manueller Force-Sync (löscht Cache, synct sofort)
router.post('/sync', async (req, res) => {
  const { from, to } = req.body as { from?: string; to?: string };

  // Cache für den Zeitraum löschen
  if (from && to) {
    db.prepare('DELETE FROM calendar_sync_ranges WHERE range_start = ? AND range_end = ?').run(from, to);
  } else {
    db.prepare('DELETE FROM calendar_sync_ranges').run();
  }

  await fullSync();
  res.json({ ok: true, message: 'Sync abgeschlossen' });
});

// PATCH /api/calendar/events/:id — Event aktualisieren (id = SQLite integer id)
router.patch('/events/:id', async (req, res) => {
  const dbId = Number(req.params.id);
  if (!Number.isInteger(dbId)) {
    return res.status(400).json({ error: 'id must be an integer' });
  }

  const row = db.prepare('SELECT apple_uid FROM calendar_events WHERE id = ?').get(dbId) as { apple_uid: string } | undefined;
  if (!row) {
    return res.status(404).json({ error: 'Event not found' });
  }

  const { title, start_at, end_at, calendar_id, is_all_day, location, notes, alarm_minutes } = req.body as {
    title?: string;
    start_at?: string;
    end_at?: string;
    calendar_id?: string;
    is_all_day?: boolean;
    location?: string | null;
    notes?: string | null;
    alarm_minutes?: number | null;
  };

  const event = await updateEvent(row.apple_uid, { title, start_at, end_at, calendar_id, is_all_day, location, notes, alarm_minutes });
  res.json({ ok: true, event });
});

// DELETE /api/calendar/events/:id — Event loeschen (id = apple_uid / eventIdentifier)
router.delete('/events/:id', async (req, res) => {
  const appleUid = req.params.id;

  const existing = db.prepare('SELECT apple_uid FROM calendar_events WHERE apple_uid = ?').get(appleUid);
  if (!existing) {
    return res.status(404).json({ error: 'Event not found' });
  }

  await deleteEvent(appleUid);
  res.json({ ok: true });
});

export default router;
