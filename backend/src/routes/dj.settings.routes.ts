import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import db from '../db/connection';
import { logAudit } from '../services/dj.audit.service';

const router = Router();

const FINANCIAL_KEYS = ['company', 'tax', 'payment_terms', 'templates'];

// ── Logo-Upload-Konfiguration ─────────────────────────────────────────────────

const LOGO_DIR = path.join(process.cwd(), 'uploads', 'logo');
fs.mkdirSync(LOGO_DIR, { recursive: true });

const logoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, LOGO_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `logo${ext}`);
  },
});

const logoUpload = multer({
  storage: logoStorage,
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Ungültiger Dateityp. Erlaubt: PNG, JPEG, SVG, WebP'));
    }
  },
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
});

// ── Logo-Endpunkte (vor /:key registrieren!) ──────────────────────────────────

// POST /api/dj/settings/logo — Logo hochladen
router.post('/logo', logoUpload.single('file'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'Keine Datei hochgeladen' });
    return;
  }

  const filename = req.file.filename;
  const relativePath = `uploads/logo/${filename}`;

  // Alte Logo-Dateien löschen (außer der gerade hochgeladenen)
  try {
    const existing = fs.readdirSync(LOGO_DIR);
    for (const f of existing) {
      if (f !== filename && f !== '.gitkeep') {
        try { fs.unlinkSync(path.join(LOGO_DIR, f)); } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }

  // Pfad in dj_settings speichern
  db.prepare(`
    INSERT INTO dj_settings (key, value, updated_at) VALUES ('logo_path', ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(relativePath);

  res.json({ ok: true, path: relativePath });
});

// GET /api/dj/settings/logo — Logo-Datei ausliefern
router.get('/logo', (_req, res) => {
  const row = db.prepare("SELECT value FROM dj_settings WHERE key = 'logo_path'").get() as { value: string } | undefined;
  if (!row) {
    res.status(404).json({ error: 'Kein Logo hinterlegt' });
    return;
  }

  const absPath = path.join(process.cwd(), row.value);
  if (!fs.existsSync(absPath)) {
    res.status(404).json({ error: 'Logo-Datei nicht gefunden' });
    return;
  }

  const ext = path.extname(absPath).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp',
  };
  const contentType = mimeMap[ext] ?? 'application/octet-stream';
  res.setHeader('Content-Type', contentType);
  res.sendFile(absPath);
});

// DELETE /api/dj/settings/logo — Logo löschen
router.delete('/logo', (_req, res) => {
  const row = db.prepare("SELECT value FROM dj_settings WHERE key = 'logo_path'").get() as { value: string } | undefined;
  if (row) {
    const absPath = path.join(process.cwd(), row.value);
    try { fs.unlinkSync(absPath); } catch { /* ignore ENOENT */ }
    db.prepare("DELETE FROM dj_settings WHERE key = 'logo_path'").run();
  }
  res.json({ ok: true });
});

// ── Allgemeine Settings-Endpunkte ─────────────────────────────────────────────

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

// GET /api/dj/settings/sequences/all — Nummernkreise (vor /:key registrieren)
router.get('/sequences/all', (_req, res) => {
  const rows = db.prepare('SELECT * FROM dj_number_sequences').all();
  res.json(rows);
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
  const raw = req.body;
  // Frontend wraps string values as { value: "..." } to avoid express.json strict mode rejection
  const newValue = (raw !== null && typeof raw === 'object' && Object.prototype.hasOwnProperty.call(raw, 'value'))
    ? raw.value
    : raw;

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

export default router;
