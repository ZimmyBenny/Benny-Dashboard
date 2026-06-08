import { Router, type Request, type Response } from 'express';
import db from '../db/connection';
import multer from 'multer';
import path from 'path';
import os from 'os';
import fs from 'fs';
import crypto from 'crypto';

const router = Router();

const UPLOAD_DIR = path.join(os.homedir(), '.local', 'share', 'benny-dashboard', 'amazon-usp');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const EXT_BY_MIME: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const CONTENT_BY_EXT: Record<string, string> = { '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
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
  fileFilter: (_req, file, cb) => { if (!ALLOWED_MIME.has(file.mimetype)) return cb(new Error('mime not allowed')); cb(null, true); },
});
function deleteUspImageFile(filename: string | null | undefined) {
  if (!filename) return;
  const abs = path.resolve(UPLOAD_DIR, filename);
  if (!abs.startsWith(path.resolve(UPLOAD_DIR) + path.sep)) return;
  try { fs.unlinkSync(abs); } catch { /* schon weg */ }
}
function loadImageForProduct(productId: number, pointId: number, imageId: number): ImageRow | undefined {
  return db.prepare(
    `SELECT i.* FROM amazon_usp_point_images i
     JOIN amazon_usp_points p ON p.id = i.point_id
     WHERE i.id = ? AND i.point_id = ? AND p.product_id = ?`
  ).get(imageId, pointId, productId) as ImageRow | undefined;
}

const MAX_MARKE = 200, MAX_HAUPTFOKUS = 2000, MAX_TITLE = 200, MAX_BODY = 5000;

interface MetaRow { product_id: number; marke: string | null; hauptfokus: string | null; updated_at: number; }
interface PointRow { id: number; product_id: number; sort_order: number; title: string; body: string | null; created_at: number; updated_at: number; }
interface ImageRow { id: number; point_id: number; sort_order: number; file_path: string; created_at: number; }
interface ManufacturerRow { id: number; product_id: number; sort_order: number; name: string; datum: string | null; notes: string | null; created_at: number; updated_at: number; }
interface FeasibilityRow { id: number; point_id: number; manufacturer_id: number; status: string; note: string | null; updated_at: number; }

function normalizeText(raw: unknown, max: number): { ok: true; value: string | null } | { ok: false } {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: false };
  const t = raw.trim();
  if (t.length === 0) return { ok: true, value: null };
  if (t.length > max) return { ok: false };
  return { ok: true, value: t };
}
function ensureProduct(id: number): boolean {
  return db.prepare(`SELECT 1 FROM amazon_products WHERE id = ?`).get(id) !== undefined;
}
function getOrCreateMeta(productId: number): MetaRow {
  const existing = db.prepare(`SELECT * FROM amazon_usp WHERE product_id = ?`).get(productId) as MetaRow | undefined;
  if (existing) return existing;
  db.prepare(`INSERT INTO amazon_usp (product_id) VALUES (?)`).run(productId);
  return db.prepare(`SELECT * FROM amazon_usp WHERE product_id = ?`).get(productId) as MetaRow;
}
function ensureDefaultManufacturer(productId: number): void {
  const c = (db.prepare(`SELECT COUNT(*) AS c FROM amazon_usp_manufacturers WHERE product_id = ?`).get(productId) as { c: number }).c;
  if (c === 0) db.prepare(`INSERT INTO amazon_usp_manufacturers (product_id, sort_order, name) VALUES (?, 1, '')`).run(productId);
}
function loadImages(pointId: number): ImageRow[] {
  return db.prepare(`SELECT * FROM amazon_usp_point_images WHERE point_id = ? ORDER BY sort_order, id`).all(pointId) as ImageRow[];
}
function loadPoints(productId: number): Array<PointRow & { images: ImageRow[] }> {
  const pts = db.prepare(`SELECT * FROM amazon_usp_points WHERE product_id = ? ORDER BY sort_order, id`).all(productId) as PointRow[];
  return pts.map(p => ({ ...p, images: loadImages(p.id) }));
}
function loadManufacturers(productId: number): ManufacturerRow[] {
  return db.prepare(`SELECT * FROM amazon_usp_manufacturers WHERE product_id = ? ORDER BY sort_order, id`).all(productId) as ManufacturerRow[];
}
function loadFeasibility(productId: number): FeasibilityRow[] {
  return db.prepare(
    `SELECT f.* FROM amazon_usp_feasibility f
     JOIN amazon_usp_points p ON p.id = f.point_id
     WHERE p.product_id = ?`
  ).all(productId) as FeasibilityRow[];
}
function loadPointForProduct(productId: number, pointId: number): PointRow | undefined {
  return db.prepare(`SELECT * FROM amazon_usp_points WHERE id = ? AND product_id = ?`).get(pointId, productId) as PointRow | undefined;
}
router.get('/products/:id/usp', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) { res.status(404).json({ error: 'product not found' }); return; }
  const meta = getOrCreateMeta(id);
  ensureDefaultManufacturer(id);
  res.json({ meta, points: loadPoints(id), manufacturers: loadManufacturers(id), feasibility: loadFeasibility(id) });
});

router.patch('/products/:id/usp', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) { res.status(404).json({ error: 'product not found' }); return; }
  getOrCreateMeta(id);
  const body = (req.body as Record<string, unknown>) ?? {};
  const updates: string[] = []; const params: unknown[] = [];
  for (const [col, max] of [['marke', MAX_MARKE], ['hauptfokus', MAX_HAUPTFOKUS]] as const) {
    if (body[col] !== undefined) {
      const v = normalizeText(body[col], max);
      if (!v.ok) { res.status(400).json({ error: `invalid ${col}` }); return; }
      updates.push(`${col} = ?`); params.push(v.value);
    }
  }
  if (updates.length > 0) {
    updates.push('updated_at = unixepoch()'); params.push(id);
    db.prepare(`UPDATE amazon_usp SET ${updates.join(', ')} WHERE product_id = ?`).run(...params);
  }
  res.json({ meta: db.prepare(`SELECT * FROM amazon_usp WHERE product_id = ?`).get(id) as MetaRow });
});

router.post('/products/:id/usp/points', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) { res.status(404).json({ error: 'product not found' }); return; }
  const titleRaw = (req.body as { title?: unknown })?.title;
  let title = '';
  if (titleRaw !== undefined && titleRaw !== null) {
    if (typeof titleRaw !== 'string' || titleRaw.trim().length > MAX_TITLE) { res.status(400).json({ error: 'invalid title' }); return; }
    title = titleRaw.trim();
  }
  const maxOrder = (db.prepare(`SELECT COALESCE(MAX(sort_order),0) AS m FROM amazon_usp_points WHERE product_id = ?`).get(id) as { m: number }).m;
  const r = db.prepare(`INSERT INTO amazon_usp_points (product_id, sort_order, title) VALUES (?, ?, ?)`).run(id, maxOrder + 1, title);
  const row = db.prepare(`SELECT * FROM amazon_usp_points WHERE id = ?`).get(r.lastInsertRowid) as PointRow;
  res.status(201).json({ point: { ...row, images: [] } });
});

router.patch('/products/:id/usp/points/reorder', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) { res.status(404).json({ error: 'product not found' }); return; }
  const order = (req.body as { order?: unknown })?.order;
  if (!Array.isArray(order) || order.some(x => !Number.isInteger(x))) { res.status(400).json({ error: 'invalid order' }); return; }
  const own = db.prepare(`SELECT id FROM amazon_usp_points WHERE product_id = ?`).all(id) as Array<{ id: number }>;
  const ownIds = new Set(own.map(o => o.id));
  if (order.length !== ownIds.size || order.some((x: number) => !ownIds.has(x))) { res.status(400).json({ error: 'order mismatch' }); return; }
  const upd = db.prepare(`UPDATE amazon_usp_points SET sort_order = ?, updated_at = unixepoch() WHERE id = ?`);
  db.transaction(() => { order.forEach((pid: number, idx: number) => upd.run(idx + 1, pid)); })();
  res.json({ points: loadPoints(id) });
});

router.patch('/products/:id/usp/points/:pointId', (req: Request, res: Response) => {
  const id = Number(req.params.id); const pointId = Number(req.params.pointId);
  if (!Number.isInteger(id) || !Number.isInteger(pointId)) { res.status(404).json({ error: 'not found' }); return; }
  if (!ensureProduct(id) || !loadPointForProduct(id, pointId)) { res.status(404).json({ error: 'not found' }); return; }
  const body = (req.body as Record<string, unknown>) ?? {};
  const updates: string[] = []; const params: unknown[] = [];
  if (body.title !== undefined) {
    if (typeof body.title !== 'string' || body.title.trim().length > MAX_TITLE) { res.status(400).json({ error: 'invalid title' }); return; }
    updates.push('title = ?'); params.push(body.title.trim());
  }
  if (body.body !== undefined) {
    const v = normalizeText(body.body, MAX_BODY);
    if (!v.ok) { res.status(400).json({ error: 'invalid body' }); return; }
    updates.push('body = ?'); params.push(v.value);
  }
  if (updates.length > 0) {
    updates.push('updated_at = unixepoch()'); params.push(pointId);
    db.prepare(`UPDATE amazon_usp_points SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }
  const row = db.prepare(`SELECT * FROM amazon_usp_points WHERE id = ?`).get(pointId) as PointRow;
  res.json({ point: { ...row, images: loadImages(pointId) } });
});

router.delete('/products/:id/usp/points/:pointId', (req: Request, res: Response) => {
  const id = Number(req.params.id); const pointId = Number(req.params.pointId);
  if (!Number.isInteger(id) || !Number.isInteger(pointId)) { res.status(404).json({ error: 'not found' }); return; }
  if (!ensureProduct(id) || !loadPointForProduct(id, pointId)) { res.status(404).json({ error: 'not found' }); return; }
  const imgs = loadImages(pointId);
  db.prepare(`DELETE FROM amazon_usp_points WHERE id = ?`).run(pointId);
  for (const img of imgs) deleteUspImageFile(img.file_path);
  res.status(204).end();
});

router.post('/products/:id/usp/points/:pointId/images', (req: Request, res: Response) => {
  const id = Number(req.params.id); const pointId = Number(req.params.pointId);
  if (!Number.isInteger(id) || !Number.isInteger(pointId)) { res.status(404).json({ error: 'not found' }); return; }
  if (!ensureProduct(id) || !loadPointForProduct(id, pointId)) { res.status(404).json({ error: 'not found' }); return; }
  upload.single('file')(req, res, (err: unknown) => {
    if (err) { res.status(400).json({ error: err instanceof Error ? err.message : 'upload failed' }); return; }
    const file = (req as Request & { file?: { filename: string } }).file;
    if (!file) { res.status(400).json({ error: 'no file' }); return; }
    const maxOrder = (db.prepare(`SELECT COALESCE(MAX(sort_order),0) AS m FROM amazon_usp_point_images WHERE point_id = ?`).get(pointId) as { m: number }).m;
    const r = db.prepare(`INSERT INTO amazon_usp_point_images (point_id, sort_order, file_path) VALUES (?, ?, ?)`).run(pointId, maxOrder + 1, file.filename);
    res.status(201).json({ image: db.prepare(`SELECT * FROM amazon_usp_point_images WHERE id = ?`).get(r.lastInsertRowid) as ImageRow });
  });
});

router.patch('/products/:id/usp/points/:pointId/images/reorder', (req: Request, res: Response) => {
  const id = Number(req.params.id); const pointId = Number(req.params.pointId);
  if (!Number.isInteger(id) || !Number.isInteger(pointId)) { res.status(404).json({ error: 'not found' }); return; }
  if (!ensureProduct(id) || !loadPointForProduct(id, pointId)) { res.status(404).json({ error: 'not found' }); return; }
  const order = (req.body as { order?: unknown })?.order;
  if (!Array.isArray(order) || order.some(x => !Number.isInteger(x))) { res.status(400).json({ error: 'invalid order' }); return; }
  const own = db.prepare(`SELECT id FROM amazon_usp_point_images WHERE point_id = ?`).all(pointId) as Array<{ id: number }>;
  const ownIds = new Set(own.map(o => o.id));
  if (order.length !== ownIds.size || order.some((x: number) => !ownIds.has(x))) { res.status(400).json({ error: 'order mismatch' }); return; }
  const upd = db.prepare(`UPDATE amazon_usp_point_images SET sort_order = ? WHERE id = ?`);
  db.transaction(() => { order.forEach((iid: number, idx: number) => upd.run(idx + 1, iid)); })();
  res.json({ images: loadImages(pointId) });
});

router.delete('/products/:id/usp/points/:pointId/images/:imageId', (req: Request, res: Response) => {
  const id = Number(req.params.id); const pointId = Number(req.params.pointId); const imageId = Number(req.params.imageId);
  if (![id, pointId, imageId].every(Number.isInteger) || !ensureProduct(id)) { res.status(404).json({ error: 'not found' }); return; }
  const img = loadImageForProduct(id, pointId, imageId);
  if (!img) { res.status(404).json({ error: 'not found' }); return; }
  db.prepare(`DELETE FROM amazon_usp_point_images WHERE id = ?`).run(imageId);
  deleteUspImageFile(img.file_path);
  res.status(204).end();
});

router.get('/products/:id/usp/images/:imageId', (req: Request, res: Response) => {
  const id = Number(req.params.id); const imageId = Number(req.params.imageId);
  if (!Number.isInteger(id) || !Number.isInteger(imageId) || !ensureProduct(id)) { res.status(404).end(); return; }
  const img = db.prepare(
    `SELECT i.* FROM amazon_usp_point_images i
     JOIN amazon_usp_points p ON p.id = i.point_id
     WHERE i.id = ? AND p.product_id = ?`
  ).get(imageId, id) as ImageRow | undefined;
  if (!img) { res.status(404).end(); return; }
  const abs = path.resolve(UPLOAD_DIR, img.file_path);
  if (!abs.startsWith(path.resolve(UPLOAD_DIR) + path.sep) || !fs.existsSync(abs)) { res.status(404).end(); return; }
  res.setHeader('Content-Type', CONTENT_BY_EXT[path.extname(abs).toLowerCase()] ?? 'application/octet-stream');
  fs.createReadStream(abs).pipe(res);
});

export default router;
