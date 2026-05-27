import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import os from 'os';
import fs from 'fs';
import db from '../db/connection';

// ── Upload-Speicher ────────────────────────────────────────────────────────────

const ATTACHMENTS_DIR = path.join(os.homedir(), '.local', 'share', 'benny-dashboard', 'dj-event-attachments');
if (!fs.existsSync(ATTACHMENTS_DIR)) fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const p = (req.params as { id?: string | string[] }).id;
    const eventId = Array.isArray(p) ? p[0] : p;
    const subDir = path.join(ATTACHMENTS_DIR, String(Number(eventId)));
    fs.mkdirSync(subDir, { recursive: true });
    cb(null, subDir);
  },
  filename: (_req, file, cb) => {
    const timestamp = Date.now();
    // Sanitize original name (Path-Traversal-Schutz)
    const safe = file.originalname.replace(/[/\\]+/g, '_');
    cb(null, `${timestamp}_${safe}`);
  },
});

const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } }); // 50 MB

const router = Router({ mergeParams: true });

interface AttachmentRow {
  id: number;
  event_id: number;
  file_path: string;
  original_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  label: string | null;
  uploaded_at: string;
}

// GET /api/dj/events/:id/attachments — Liste aller Anhaenge eines Events
router.get('/', (req, res) => {
  const eventId = Number((req.params as { id?: string }).id);
  if (!Number.isInteger(eventId)) { res.status(400).json({ error: 'Ungültige Event-ID' }); return; }

  const rows = db.prepare(
    'SELECT * FROM dj_event_attachments WHERE event_id = ? ORDER BY uploaded_at DESC, id DESC'
  ).all(eventId) as AttachmentRow[];

  res.json(rows);
});

// POST /api/dj/events/:id/attachments — Upload (multipart/form-data, field "files" und optional "label")
router.post('/', upload.array('files', 10), (req, res) => {
  const eventId = Number((req.params as { id?: string }).id);
  if (!Number.isInteger(eventId)) { res.status(400).json({ error: 'Ungültige Event-ID' }); return; }

  const eventExists = db.prepare('SELECT 1 FROM dj_events WHERE id = ? AND deleted_at IS NULL').get(eventId);
  if (!eventExists) { res.status(404).json({ error: 'Event nicht gefunden' }); return; }

  const files = (req.files ?? []) as Express.Multer.File[];
  if (files.length === 0) { res.status(400).json({ error: 'Keine Datei hochgeladen' }); return; }

  const label = typeof req.body?.label === 'string' && req.body.label.trim() ? req.body.label.trim() : null;

  const insert = db.prepare(
    `INSERT INTO dj_event_attachments
       (event_id, file_path, original_name, mime_type, size_bytes, label)
     VALUES (?, ?, ?, ?, ?, ?)`
  );

  const inserted: AttachmentRow[] = [];
  for (const f of files) {
    const relPath = path.relative(ATTACHMENTS_DIR, f.path);
    const result = insert.run(eventId, relPath, f.originalname, f.mimetype, f.size, label);
    const row = db.prepare('SELECT * FROM dj_event_attachments WHERE id = ?').get(result.lastInsertRowid) as AttachmentRow;
    inserted.push(row);
  }

  res.status(201).json(inserted);
});

// GET /api/dj/events/:id/attachments/:attId/download — File-Serve
router.get('/:attId/download', (req, res) => {
  const params = req.params as { id?: string; attId?: string };
  const eventId = Number(params.id);
  const attId = Number(params.attId);
  if (!Number.isInteger(eventId) || !Number.isInteger(attId)) {
    res.status(400).json({ error: 'Ungültige IDs' });
    return;
  }

  const row = db.prepare(
    'SELECT * FROM dj_event_attachments WHERE id = ? AND event_id = ?'
  ).get(attId, eventId) as AttachmentRow | undefined;

  if (!row) { res.status(404).json({ error: 'Anhang nicht gefunden' }); return; }

  // Path-Traversal-Schutz: relPath darf nicht aus ATTACHMENTS_DIR rausfuehren
  const absPath = path.resolve(ATTACHMENTS_DIR, row.file_path);
  if (!absPath.startsWith(path.resolve(ATTACHMENTS_DIR) + path.sep)) {
    res.status(403).json({ error: 'Zugriff verweigert' });
    return;
  }
  if (!fs.existsSync(absPath)) { res.status(404).json({ error: 'Datei fehlt auf Disk' }); return; }

  res.setHeader('Content-Type', row.mime_type ?? 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(row.original_name)}"`);
  fs.createReadStream(absPath).pipe(res);
});

// DELETE /api/dj/events/:id/attachments/:attId
router.delete('/:attId', (req, res) => {
  const params = req.params as { id?: string; attId?: string };
  const eventId = Number(params.id);
  const attId = Number(params.attId);
  if (!Number.isInteger(eventId) || !Number.isInteger(attId)) {
    res.status(400).json({ error: 'Ungültige IDs' });
    return;
  }

  const row = db.prepare(
    'SELECT * FROM dj_event_attachments WHERE id = ? AND event_id = ?'
  ).get(attId, eventId) as AttachmentRow | undefined;

  if (!row) { res.status(404).json({ error: 'Anhang nicht gefunden' }); return; }

  // Datei loeschen — Errors werden ignoriert (Best-Effort)
  const absPath = path.resolve(ATTACHMENTS_DIR, row.file_path);
  if (absPath.startsWith(path.resolve(ATTACHMENTS_DIR) + path.sep)) {
    try { fs.unlinkSync(absPath); } catch { /* ignore */ }
  }
  db.prepare('DELETE FROM dj_event_attachments WHERE id = ?').run(attId);

  res.status(204).end();
});

export default router;
