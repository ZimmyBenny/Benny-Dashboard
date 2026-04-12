import { Router } from 'express';
import db from '../db/connection';

const router = Router();

// GET /api/app-settings — Alle Settings als Key-Value-Objekt
router.get('/', (_req, res) => {
  const rows = db.prepare(`SELECT key, value FROM app_settings`).all() as Array<{ key: string; value: string }>;
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  res.json(result);
});

// PUT /api/app-settings — Settings aktualisieren (ein oder mehrere Key-Value-Paare)
router.put('/', (req, res) => {
  const body = req.body as Record<string, string>;
  if (!body || typeof body !== 'object') {
    res.status(400).json({ error: 'Body muss ein Key-Value-Objekt sein' });
    return;
  }

  const updateFn = db.transaction(() => {
    for (const [key, value] of Object.entries(body)) {
      if (typeof value !== 'string') continue;
      db.prepare(`INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))`).run(key, value);
    }
  });

  updateFn();

  const rows = db.prepare(`SELECT key, value FROM app_settings`).all() as Array<{ key: string; value: string }>;
  const result: Record<string, string> = {};
  for (const row of rows) {
    result[row.key] = row.value;
  }
  res.json(result);
});

export default router;
