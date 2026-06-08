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

const MAX_MARKE = 200, MAX_HAUPTFOKUS = 2000, MAX_TITLE = 200, MAX_BODY = 5000, MAX_QUESTION = 500;
const MAX_MNAME = 200, MAX_DATUM = 50, MAX_MNOTES = 2000, MAX_FNOTE = 1000, MAX_ANSPRECH = 200;
const VALID_STATUS = new Set(['offen', 'umsetzbar', 'teilweise', 'nicht']);

interface MetaRow { product_id: number; marke: string | null; hauptfokus: string | null; logo_path: string | null; updated_at: number; }
interface PointRow { id: number; product_id: number; sort_order: number; title: string; body: string | null; include_in_pdf: number; created_at: number; updated_at: number; }
interface ImageRow { id: number; point_id: number; sort_order: number; file_path: string; created_at: number; }
interface QuestionRow { id: number; point_id: number; sort_order: number; text: string; created_at: number; updated_at: number; }
interface ManufacturerRow { id: number; product_id: number; sort_order: number; name: string; ansprechpartner: string | null; datum: string | null; notes: string | null; gesendet: number; created_at: number; updated_at: number; }
interface FeasibilityRow { id: number; point_id: number; manufacturer_id: number; status: string; note: string | null; include_in_pdf: number; updated_at: number; }

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
function loadQuestions(pointId: number): QuestionRow[] {
  return db.prepare(`SELECT * FROM amazon_usp_point_questions WHERE point_id = ? ORDER BY sort_order, id`).all(pointId) as QuestionRow[];
}
function loadPoints(productId: number): Array<PointRow & { images: ImageRow[]; questions: QuestionRow[] }> {
  const pts = db.prepare(`SELECT * FROM amazon_usp_points WHERE product_id = ? ORDER BY sort_order, id`).all(productId) as PointRow[];
  return pts.map(p => ({ ...p, images: loadImages(p.id), questions: loadQuestions(p.id) }));
}
function loadQuestionForProduct(productId: number, pointId: number, qId: number): QuestionRow | undefined {
  return db.prepare(
    `SELECT q.* FROM amazon_usp_point_questions q
     JOIN amazon_usp_points p ON p.id = q.point_id
     WHERE q.id = ? AND q.point_id = ? AND p.product_id = ?`
  ).get(qId, pointId, productId) as QuestionRow | undefined;
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
function loadManufacturerForProduct(productId: number, mId: number): ManufacturerRow | undefined {
  return db.prepare(`SELECT * FROM amazon_usp_manufacturers WHERE id = ? AND product_id = ?`).get(mId, productId) as ManufacturerRow | undefined;
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
  res.status(201).json({ point: { ...row, images: [], questions: [] } });
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
  if (body.include_in_pdf !== undefined) {
    if (body.include_in_pdf !== 0 && body.include_in_pdf !== 1) { res.status(400).json({ error: 'invalid include_in_pdf' }); return; }
    updates.push('include_in_pdf = ?'); params.push(body.include_in_pdf);
  }
  if (updates.length > 0) {
    updates.push('updated_at = unixepoch()'); params.push(pointId);
    db.prepare(`UPDATE amazon_usp_points SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }
  const row = db.prepare(`SELECT * FROM amazon_usp_points WHERE id = ?`).get(pointId) as PointRow;
  res.json({ point: { ...row, images: loadImages(pointId), questions: loadQuestions(pointId) } });
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

router.post('/products/:id/usp/manufacturers', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) { res.status(404).json({ error: 'product not found' }); return; }
  const nameRaw = (req.body as { name?: unknown })?.name;
  let name = '';
  if (nameRaw !== undefined && nameRaw !== null) {
    if (typeof nameRaw !== 'string' || nameRaw.trim().length > MAX_MNAME) { res.status(400).json({ error: 'invalid name' }); return; }
    name = nameRaw.trim();
  }
  const maxOrder = (db.prepare(`SELECT COALESCE(MAX(sort_order),0) AS m FROM amazon_usp_manufacturers WHERE product_id = ?`).get(id) as { m: number }).m;
  const r = db.prepare(`INSERT INTO amazon_usp_manufacturers (product_id, sort_order, name) VALUES (?, ?, ?)`).run(id, maxOrder + 1, name);
  res.status(201).json({ manufacturer: db.prepare(`SELECT * FROM amazon_usp_manufacturers WHERE id = ?`).get(r.lastInsertRowid) as ManufacturerRow });
});

router.patch('/products/:id/usp/manufacturers/reorder', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) { res.status(404).json({ error: 'product not found' }); return; }
  const order = (req.body as { order?: unknown })?.order;
  if (!Array.isArray(order) || order.some(x => !Number.isInteger(x))) { res.status(400).json({ error: 'invalid order' }); return; }
  const own = db.prepare(`SELECT id FROM amazon_usp_manufacturers WHERE product_id = ?`).all(id) as Array<{ id: number }>;
  const ownIds = new Set(own.map(o => o.id));
  if (order.length !== ownIds.size || order.some((x: number) => !ownIds.has(x))) { res.status(400).json({ error: 'order mismatch' }); return; }
  const upd = db.prepare(`UPDATE amazon_usp_manufacturers SET sort_order = ?, updated_at = unixepoch() WHERE id = ?`);
  db.transaction(() => { order.forEach((mid: number, idx: number) => upd.run(idx + 1, mid)); })();
  res.json({ manufacturers: loadManufacturers(id) });
});

router.patch('/products/:id/usp/manufacturers/:mId', (req: Request, res: Response) => {
  const id = Number(req.params.id); const mId = Number(req.params.mId);
  if (!Number.isInteger(id) || !Number.isInteger(mId)) { res.status(404).json({ error: 'not found' }); return; }
  if (!ensureProduct(id) || !loadManufacturerForProduct(id, mId)) { res.status(404).json({ error: 'not found' }); return; }
  const body = (req.body as Record<string, unknown>) ?? {};
  const updates: string[] = []; const params: unknown[] = [];
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim().length > MAX_MNAME) { res.status(400).json({ error: 'invalid name' }); return; }
    updates.push('name = ?'); params.push(body.name.trim());
  }
  if (body.ansprechpartner !== undefined) {
    const v = normalizeText(body.ansprechpartner, MAX_ANSPRECH);
    if (!v.ok) { res.status(400).json({ error: 'invalid ansprechpartner' }); return; }
    updates.push('ansprechpartner = ?'); params.push(v.value);
  }
  if (body.datum !== undefined) {
    const v = normalizeText(body.datum, MAX_DATUM);
    if (!v.ok) { res.status(400).json({ error: 'invalid datum' }); return; }
    updates.push('datum = ?'); params.push(v.value);
  }
  if (body.notes !== undefined) {
    const v = normalizeText(body.notes, MAX_MNOTES);
    if (!v.ok) { res.status(400).json({ error: 'invalid notes' }); return; }
    updates.push('notes = ?'); params.push(v.value);
  }
  if (body.gesendet !== undefined) {
    if (body.gesendet !== 0 && body.gesendet !== 1) { res.status(400).json({ error: 'invalid gesendet' }); return; }
    updates.push('gesendet = ?'); params.push(body.gesendet);
  }
  if (updates.length > 0) {
    updates.push('updated_at = unixepoch()'); params.push(mId);
    db.prepare(`UPDATE amazon_usp_manufacturers SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }
  res.json({ manufacturer: db.prepare(`SELECT * FROM amazon_usp_manufacturers WHERE id = ?`).get(mId) as ManufacturerRow });
});

router.delete('/products/:id/usp/manufacturers/:mId', (req: Request, res: Response) => {
  const id = Number(req.params.id); const mId = Number(req.params.mId);
  if (!Number.isInteger(id) || !Number.isInteger(mId)) { res.status(404).json({ error: 'not found' }); return; }
  if (!ensureProduct(id) || !loadManufacturerForProduct(id, mId)) { res.status(404).json({ error: 'not found' }); return; }
  db.prepare(`DELETE FROM amazon_usp_manufacturers WHERE id = ?`).run(mId);
  res.status(204).end();
});

router.put('/products/:id/usp/feasibility', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) { res.status(404).json({ error: 'product not found' }); return; }
  const body = (req.body as Record<string, unknown>) ?? {};
  const pointId = Number(body.point_id); const mId = Number(body.manufacturer_id);
  if (!Number.isInteger(pointId) || !Number.isInteger(mId)) { res.status(400).json({ error: 'invalid ids' }); return; }
  if (!loadPointForProduct(id, pointId) || !loadManufacturerForProduct(id, mId)) { res.status(404).json({ error: 'not found' }); return; }
  if (body.status !== undefined && (typeof body.status !== 'string' || !VALID_STATUS.has(body.status))) { res.status(400).json({ error: 'invalid status' }); return; }
  let note: string | null | undefined;
  if (body.note !== undefined) {
    const v = normalizeText(body.note, MAX_FNOTE);
    if (!v.ok) { res.status(400).json({ error: 'invalid note' }); return; }
    note = v.value;
  }
  if (body.include_in_pdf !== undefined && body.include_in_pdf !== 0 && body.include_in_pdf !== 1) { res.status(400).json({ error: 'invalid include_in_pdf' }); return; }
  db.prepare(`INSERT OR IGNORE INTO amazon_usp_feasibility (point_id, manufacturer_id) VALUES (?, ?)`).run(pointId, mId);
  const updates: string[] = []; const params: unknown[] = [];
  if (body.status !== undefined) { updates.push('status = ?'); params.push(body.status); }
  if (note !== undefined) { updates.push('note = ?'); params.push(note); }
  if (body.include_in_pdf !== undefined) { updates.push('include_in_pdf = ?'); params.push(body.include_in_pdf); }
  if (updates.length > 0) {
    updates.push('updated_at = unixepoch()'); params.push(pointId, mId);
    db.prepare(`UPDATE amazon_usp_feasibility SET ${updates.join(', ')} WHERE point_id = ? AND manufacturer_id = ?`).run(...params);
  }
  res.json({ feasibility: db.prepare(`SELECT * FROM amazon_usp_feasibility WHERE point_id = ? AND manufacturer_id = ?`).get(pointId, mId) as FeasibilityRow });
});

// ── Fragen an den Hersteller (je Punkt) ──
router.post('/products/:id/usp/points/:pointId/questions', (req: Request, res: Response) => {
  const id = Number(req.params.id); const pointId = Number(req.params.pointId);
  if (!Number.isInteger(id) || !Number.isInteger(pointId)) { res.status(404).json({ error: 'not found' }); return; }
  if (!ensureProduct(id) || !loadPointForProduct(id, pointId)) { res.status(404).json({ error: 'not found' }); return; }
  const textRaw = (req.body as { text?: unknown })?.text;
  let text = '';
  if (textRaw !== undefined && textRaw !== null) {
    if (typeof textRaw !== 'string' || textRaw.trim().length > MAX_QUESTION) { res.status(400).json({ error: 'invalid text' }); return; }
    text = textRaw.trim();
  }
  const maxOrder = (db.prepare(`SELECT COALESCE(MAX(sort_order),0) AS m FROM amazon_usp_point_questions WHERE point_id = ?`).get(pointId) as { m: number }).m;
  const r = db.prepare(`INSERT INTO amazon_usp_point_questions (point_id, sort_order, text) VALUES (?, ?, ?)`).run(pointId, maxOrder + 1, text);
  res.status(201).json({ question: db.prepare(`SELECT * FROM amazon_usp_point_questions WHERE id = ?`).get(r.lastInsertRowid) as QuestionRow });
});

router.patch('/products/:id/usp/points/:pointId/questions/:qId', (req: Request, res: Response) => {
  const id = Number(req.params.id); const pointId = Number(req.params.pointId); const qId = Number(req.params.qId);
  if (![id, pointId, qId].every(Number.isInteger)) { res.status(404).json({ error: 'not found' }); return; }
  if (!ensureProduct(id) || !loadQuestionForProduct(id, pointId, qId)) { res.status(404).json({ error: 'not found' }); return; }
  const textRaw = (req.body as { text?: unknown })?.text;
  if (textRaw !== undefined) {
    if (typeof textRaw !== 'string' || textRaw.trim().length > MAX_QUESTION) { res.status(400).json({ error: 'invalid text' }); return; }
    db.prepare(`UPDATE amazon_usp_point_questions SET text = ?, updated_at = unixepoch() WHERE id = ?`).run(textRaw.trim(), qId);
  }
  res.json({ question: db.prepare(`SELECT * FROM amazon_usp_point_questions WHERE id = ?`).get(qId) as QuestionRow });
});

router.delete('/products/:id/usp/points/:pointId/questions/:qId', (req: Request, res: Response) => {
  const id = Number(req.params.id); const pointId = Number(req.params.pointId); const qId = Number(req.params.qId);
  if (![id, pointId, qId].every(Number.isInteger)) { res.status(404).json({ error: 'not found' }); return; }
  if (!ensureProduct(id) || !loadQuestionForProduct(id, pointId, qId)) { res.status(404).json({ error: 'not found' }); return; }
  db.prepare(`DELETE FROM amazon_usp_point_questions WHERE id = ?`).run(qId);
  res.status(204).end();
});

// ── Logo (ein Bild je Produkt-USP) ──
router.post('/products/:id/usp/logo', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) { res.status(404).json({ error: 'product not found' }); return; }
  getOrCreateMeta(id);
  upload.single('file')(req, res, (err: unknown) => {
    if (err) { res.status(400).json({ error: err instanceof Error ? err.message : 'upload failed' }); return; }
    const file = (req as Request & { file?: { filename: string } }).file;
    if (!file) { res.status(400).json({ error: 'no file' }); return; }
    const prev = db.prepare(`SELECT logo_path FROM amazon_usp WHERE product_id = ?`).get(id) as { logo_path: string | null } | undefined;
    db.prepare(`UPDATE amazon_usp SET logo_path = ?, updated_at = unixepoch() WHERE product_id = ?`).run(file.filename, id);
    if (prev?.logo_path) deleteUspImageFile(prev.logo_path);
    res.json({ meta: db.prepare(`SELECT * FROM amazon_usp WHERE product_id = ?`).get(id) as MetaRow });
  });
});

router.delete('/products/:id/usp/logo', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) { res.status(404).json({ error: 'product not found' }); return; }
  const prev = db.prepare(`SELECT logo_path FROM amazon_usp WHERE product_id = ?`).get(id) as { logo_path: string | null } | undefined;
  db.prepare(`UPDATE amazon_usp SET logo_path = NULL, updated_at = unixepoch() WHERE product_id = ?`).run(id);
  if (prev?.logo_path) deleteUspImageFile(prev.logo_path);
  res.status(204).end();
});

router.get('/products/:id/usp/logo', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) { res.status(404).end(); return; }
  const row = db.prepare(`SELECT logo_path FROM amazon_usp WHERE product_id = ?`).get(id) as { logo_path: string | null } | undefined;
  if (!row?.logo_path) { res.status(404).end(); return; }
  const abs = path.resolve(UPLOAD_DIR, row.logo_path);
  if (!abs.startsWith(path.resolve(UPLOAD_DIR) + path.sep) || !fs.existsSync(abs)) { res.status(404).end(); return; }
  res.setHeader('Content-Type', CONTENT_BY_EXT[path.extname(abs).toLowerCase()] ?? 'application/octet-stream');
  fs.createReadStream(abs).pipe(res);
});

export default router;
