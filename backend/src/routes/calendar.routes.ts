import { Router } from 'express';
import db from '../db/connection';
import {
  syncPull, pushEvent, updateAppleEvent, deleteAppleEvent,
  listCalendars, detectNewCalendars,
} from '../services/calendarSync.service';

const router = Router();

// GET /api/calendar/events?start=ISO&end=ISO
router.get('/events', (req, res) => {
  const { start, end } = req.query as { start?: string; end?: string };
  let rows;
  if (start && end) {
    rows = db.prepare(
      'SELECT * FROM calendar_events WHERE start_at >= ? AND start_at <= ? ORDER BY start_at'
    ).all(start, end);
  } else {
    // Default: -30 / +90 Tage
    const now = new Date();
    const from = new Date(now); from.setDate(from.getDate() - 30);
    const to   = new Date(now); to.setDate(to.getDate() + 90);
    rows = db.prepare(
      'SELECT * FROM calendar_events WHERE start_at >= ? AND start_at <= ? ORDER BY start_at'
    ).all(from.toISOString(), to.toISOString());
  }
  res.json(rows);
});

// POST /api/calendar/sync — on-demand Pull von Apple Calendar (non-blocking)
// Sync braucht 90-140s — sofort 202 zurückgeben, Sync läuft im Hintergrund
router.post('/sync', (_req, res) => {
  res.status(202).json({ ok: true, status: 'started' });
  syncPull().catch((err) => console.error('[sync] on-demand sync error:', err));
});

// GET /api/calendar/calendars — Kalender-Liste + optional neue Kalender erkennen
router.get('/calendars', async (req, res) => {
  const checkNew = req.query.check_new === 'true';
  if (checkNew) {
    const newCalendars = await detectNewCalendars();
    const known = db.prepare('SELECT * FROM known_calendars ORDER BY name').all();
    res.json({ known, new_calendars: newCalendars });
  } else {
    const known = db.prepare('SELECT * FROM known_calendars ORDER BY name').all();
    res.json({ known, new_calendars: [] });
  }
});

// GET /api/calendar/sync-log?limit=50
router.get('/sync-log', (req, res) => {
  const limit = Math.min(parseInt(String(req.query.limit ?? '50')), 200);
  const rows = db.prepare(
    'SELECT * FROM calendar_sync_log ORDER BY synced_at DESC LIMIT ?'
  ).all(limit);
  res.json(rows);
});

// GET /api/calendar/apple-calendars — alle Kalender direkt aus Apple Calendar
router.get('/apple-calendars', async (_req, res) => {
  const names = await listCalendars();
  res.json(names);
});

// POST /api/calendar/events — Neues Event erstellen (Dashboard -> SQLite -> Apple)
router.post('/events', async (req, res) => {
  const { title, start_at, end_at, is_all_day = 0, calendar_name, location, notes } = req.body as {
    title: string; start_at: string; end_at: string; is_all_day?: number;
    calendar_name: string; location?: string; notes?: string;
  };

  if (!title || !start_at || !end_at || !calendar_name) {
    return res.status(400).json({ error: 'title, start_at, end_at, calendar_name required' });
  }

  // Zuerst SQLite, dann Apple push
  const result = db.prepare(`
    INSERT INTO calendar_events (apple_uid, title, start_at, end_at, is_all_day, calendar_name, location, notes, sync_status)
    VALUES ('pending-' || lower(hex(randomblob(8))), ?, ?, ?, ?, ?, ?, ?, 'pending_push')
  `).run(title, start_at, end_at, is_all_day, calendar_name, location ?? null, notes ?? null);

  const newId = result.lastInsertRowid as number;
  const { uid } = await pushEvent(newId);
  const row = db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(newId);
  res.status(201).json({ ok: true, uid, event: row });
});

// PUT /api/calendar/events/:id — Event updaten
router.put('/events/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const { title, start_at, end_at, is_all_day, location, notes } = req.body as {
    title?: string; start_at?: string; end_at?: string; is_all_day?: number;
    location?: string; notes?: string;
  };

  const existing = db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(id) as {
    id: number; apple_uid: string;
  } | undefined;
  if (!existing) return res.status(404).json({ error: 'Not found' });

  // Nur uebergebene Felder updaten
  const updates: string[] = [];
  const vals: unknown[] = [];
  if (title      !== undefined) { updates.push('title = ?');      vals.push(title); }
  if (start_at   !== undefined) { updates.push('start_at = ?');   vals.push(start_at); }
  if (end_at     !== undefined) { updates.push('end_at = ?');     vals.push(end_at); }
  if (is_all_day !== undefined) { updates.push('is_all_day = ?'); vals.push(is_all_day); }
  if (location   !== undefined) { updates.push('location = ?');   vals.push(location); }
  if (notes      !== undefined) { updates.push('notes = ?');      vals.push(notes); }

  if (updates.length > 0) {
    updates.push("sync_status = 'pending_push'", 'updated_at = ?');
    vals.push(new Date().toISOString(), id);
    db.prepare(`UPDATE calendar_events SET ${updates.join(', ')} WHERE id = ?`).run(...vals);
  }

  // Apple Calendar updaten (async — ~2s)
  await updateAppleEvent(id);
  const row = db.prepare('SELECT * FROM calendar_events WHERE id = ?').get(id);
  res.json({ ok: true, event: row });
});

// DELETE /api/calendar/events/:id
router.delete('/events/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const existing = db.prepare('SELECT id FROM calendar_events WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Not found' });
  await deleteAppleEvent(id);
  res.json({ ok: true });
});

export default router;
