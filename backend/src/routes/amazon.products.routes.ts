import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import path from 'path';
import os from 'os';
import fs from 'fs';
import crypto from 'crypto';
import db from '../db/connection';

const UPLOAD_DIR = path.join(os.homedir(), '.local', 'share', 'benny-dashboard', 'amazon-products');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png':  '.png',
  'image/webp': '.webp',
};

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = EXT_BY_MIME[file.mimetype];
      if (!ext) return cb(new Error('mime not allowed'), '');
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) return cb(new Error('mime not allowed'));
    cb(null, true);
  },
});

function deleteImageFile(filename: string | null | undefined) {
  if (!filename) return;
  const abs = path.resolve(UPLOAD_DIR, filename);
  if (!abs.startsWith(path.resolve(UPLOAD_DIR) + path.sep)) return;
  try { fs.unlinkSync(abs); } catch { /* schon weg, egal */ }
}

const router = Router();

type Status = 'interessant' | 'aktiv' | 'bestehend' | 'verworfen';
const VALID_STATUS: ReadonlySet<Status> = new Set(['interessant', 'aktiv', 'bestehend', 'verworfen']);
const MAX_NAME_LEN = 200;

interface ProductRow {
  id: number;
  name: string;
  status: Status;
  image_path: string | null;
  created_at: number;
  updated_at: number;
}

function validateName(raw: unknown): { ok: true; value: string } | { ok: false } {
  if (typeof raw !== 'string') return { ok: false };
  const trimmed = raw.trim();
  if (trimmed.length < 1 || trimmed.length > MAX_NAME_LEN) return { ok: false };
  return { ok: true, value: trimmed };
}

// GET /api/amazon/products?include_discarded=true|false
router.get('/products', (req: Request, res: Response) => {
  const includeDiscarded = String(req.query.include_discarded) === 'true';
  const sql = includeDiscarded
    ? `SELECT * FROM amazon_products ORDER BY created_at DESC, id DESC`
    : `SELECT * FROM amazon_products WHERE status != 'verworfen' ORDER BY created_at DESC, id DESC`;
  res.json(db.prepare(sql).all());
});

// POST /api/amazon/products
router.post('/products', (req: Request, res: Response) => {
  const name = validateName((req.body as { name?: unknown })?.name);
  if (!name.ok) { res.status(400).json({ error: 'name length invalid' }); return; }

  const result = db.prepare(
    `INSERT INTO amazon_products (name) VALUES (?)`
  ).run(name.value);
  const row = db.prepare(`SELECT * FROM amazon_products WHERE id = ?`).get(result.lastInsertRowid) as ProductRow;
  res.status(201).json(row);
});

// PATCH /api/amazon/products/:id
router.patch('/products/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: 'invalid id' }); return; }

  const existing = db.prepare(`SELECT * FROM amazon_products WHERE id = ?`).get(id) as ProductRow | undefined;
  if (!existing) { res.status(404).json({ error: 'not found' }); return; }

  const body = (req.body as { name?: unknown; status?: unknown }) ?? {};
  const updates: string[] = [];
  const params: unknown[] = [];

  if (body.name !== undefined) {
    const name = validateName(body.name);
    if (!name.ok) { res.status(400).json({ error: 'name length invalid' }); return; }
    updates.push('name = ?');
    params.push(name.value);
  }
  if (body.status !== undefined) {
    if (typeof body.status !== 'string' || !VALID_STATUS.has(body.status as Status)) {
      res.status(400).json({ error: 'invalid status' });
      return;
    }
    updates.push('status = ?');
    params.push(body.status);
  }

  if (updates.length === 0) { res.json(existing); return; }

  updates.push('updated_at = unixepoch()');
  params.push(id);
  db.prepare(`UPDATE amazon_products SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  const row = db.prepare(`SELECT * FROM amazon_products WHERE id = ?`).get(id) as ProductRow;
  res.json(row);
});

// DELETE /api/amazon/products/:id
router.delete('/products/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: 'invalid id' }); return; }
  const row = db.prepare(`SELECT image_path FROM amazon_products WHERE id=?`).get(id) as { image_path: string | null } | undefined;
  if (row) deleteImageFile(row.image_path);
  db.prepare(`DELETE FROM amazon_products WHERE id = ?`).run(id);
  res.status(204).end();
});

// POST /api/amazon/products/:id/image
router.post('/products/:id/image', (req: Request, res: Response) => {
  upload.single('file')(req, res, (err: unknown) => {
    if (err) {
      const msg = err instanceof Error ? err.message : 'upload failed';
      res.status(400).json({ error: msg });
      return;
    }
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) { res.status(400).json({ error: 'invalid id' }); return; }
    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file) { res.status(400).json({ error: 'no file' }); return; }

    const existing = db.prepare(`SELECT image_path FROM amazon_products WHERE id=?`).get(id) as { image_path: string | null } | undefined;
    if (!existing) {
      deleteImageFile(file.filename);
      res.status(404).json({ error: 'not found' });
      return;
    }

    deleteImageFile(existing.image_path);
    db.prepare(`UPDATE amazon_products SET image_path = ?, updated_at = unixepoch() WHERE id = ?`)
      .run(file.filename, id);
    res.json({ image_path: file.filename });
  });
});

// GET /api/amazon/products/:id/image
router.get('/products/:id/image', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: 'invalid id' }); return; }
  const row = db.prepare(`SELECT image_path FROM amazon_products WHERE id=?`).get(id) as { image_path: string | null } | undefined;
  if (!row || !row.image_path) { res.status(404).json({ error: 'no image' }); return; }

  const abs = path.resolve(UPLOAD_DIR, row.image_path);
  if (!abs.startsWith(path.resolve(UPLOAD_DIR) + path.sep) || !fs.existsSync(abs)) {
    res.status(404).json({ error: 'file missing' });
    return;
  }

  const ext = path.extname(abs).toLowerCase();
  const contentType =
    ext === '.png'  ? 'image/png'  :
    ext === '.webp' ? 'image/webp' :
    'image/jpeg';
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'private, max-age=300');
  fs.createReadStream(abs).pipe(res);
});

// DELETE /api/amazon/products/:id/image
router.delete('/products/:id/image', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: 'invalid id' }); return; }
  const row = db.prepare(`SELECT image_path FROM amazon_products WHERE id=?`).get(id) as { image_path: string | null } | undefined;
  if (!row) { res.status(404).json({ error: 'not found' }); return; }
  deleteImageFile(row.image_path);
  db.prepare(`UPDATE amazon_products SET image_path = NULL, updated_at = unixepoch() WHERE id=?`).run(id);
  res.status(204).end();
});

export default router;
