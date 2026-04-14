import { Router } from 'express';
import db from '../db/connection';
import {
  getCalendars, syncRange, createEvent, deleteEvent,
} from '../services/calendarSwift.service';

const router = Router();

// GET /api/calendar/calendars — Kalender-Liste aus EventKit
router.get('/calendars', async (_req, res) => {
  const calendars = await getCalendars();
  res.json(calendars);
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
    is_all_day = false, location, notes,
  } = req.body as {
    title: string;
    start_at: string;
    end_at: string;
    calendar_id: string;
    is_all_day?: boolean;
    location?: string;
    notes?: string;
  };

  if (!title || !start_at || !end_at || !calendar_id) {
    return res.status(400).json({ error: 'title, start_at, end_at, calendar_id required' });
  }

  const event = await createEvent({ title, start_at, end_at, calendar_id, is_all_day, location, notes });
  res.status(201).json({ ok: true, event });
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
