import { Router } from 'express';
import db from '../db/connection';
import { markReminderCompleted, syncReminders } from '../services/remindersSync.service';

const router = Router();

// GET /api/reminders — alle offenen Erinnerungen aus lokaler DB
router.get('/', (_req, res) => {
  const rows = db.prepare(`
    SELECT id, apple_uid, title, list_name, due_date, reminder_date, completed, notes, last_synced_at
    FROM apple_reminders
    WHERE completed = 0
    ORDER BY id DESC
  `).all();
  res.json(rows);
});

// POST /api/reminders/:uid/complete — Erinnerung in Apple als erledigt markieren
router.post('/:uid/complete', async (req, res) => {
  const { uid } = req.params;
  try {
    await markReminderCompleted(uid);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'complete failed' });
  }
});

// POST /api/reminders/sync — manuellen Sync auslösen (für Debug / UAT)
router.post('/sync', async (_req, res) => {
  try {
    await syncReminders();
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'sync failed' });
  }
});

export default router;
