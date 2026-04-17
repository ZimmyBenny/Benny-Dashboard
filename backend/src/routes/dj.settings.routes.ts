import { Router } from 'express';
import db from '../db/connection';
import { logAudit } from '../services/dj.audit.service';

const router = Router();

const FINANCIAL_KEYS = ['company', 'tax', 'payment_terms', 'templates'];

// GET /api/dj/settings
router.get('/', (_req, res) => {
  const rows = db.prepare('SELECT key, value FROM dj_settings').all() as Array<{ key: string; value: string }>;
  const result: Record<string, unknown> = {};
  for (const row of rows) {
    try { result[row.key] = JSON.parse(row.value); }
    catch { result[row.key] = row.value; }
  }
  res.json(result);
});

// GET /api/dj/settings/:key
router.get('/:key', (req, res) => {
  const row = db.prepare('SELECT value FROM dj_settings WHERE key = ?').get(req.params.key) as { value: string } | undefined;
  if (!row) { res.status(404).json({ error: 'Einstellung nicht gefunden' }); return; }
  try { res.json(JSON.parse(row.value)); }
  catch { res.json(row.value); }
});

// PATCH /api/dj/settings/:key
router.patch('/:key', (req, res) => {
  const { key } = req.params;
  const newValue = req.body;

  const existing = db.prepare('SELECT value FROM dj_settings WHERE key = ?').get(key) as { value: string } | undefined;
  const valueStr = typeof newValue === 'string' ? newValue : JSON.stringify(newValue);

  db.prepare(`
    INSERT INTO dj_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(key, valueStr);

  if (FINANCIAL_KEYS.includes(key)) {
    logAudit(req, 'settings', 0, 'update',
      existing ? JSON.parse(existing.value) : undefined,
      newValue
    );
  }

  res.json({ ok: true });
});

// GET /api/dj/settings/sequences/all — Nummernkreise
router.get('/sequences/all', (_req, res) => {
  const rows = db.prepare('SELECT * FROM dj_number_sequences').all();
  res.json(rows);
});

export default router;
