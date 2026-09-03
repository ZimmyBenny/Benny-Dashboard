import { Router, type Request, type Response } from 'express';
import db from '../db/connection';
import multer from 'multer';
import path from 'path';
import os from 'os';
import fs from 'fs';
import crypto from 'crypto';

// ── Datei-Speicher (multer) — Screenshots/Anhänge je Mitbewerber ──
const COMPETITOR_FILES_DIR = path.join(os.homedir(), '.local', 'share', 'benny-dashboard', 'amazon-competitor-files');
if (!fs.existsSync(COMPETITOR_FILES_DIR)) fs.mkdirSync(COMPETITOR_FILES_DIR, { recursive: true });
const competitorUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, COMPETITOR_FILES_DIR),
    filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname) || ''}`),
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
});
function deleteFileFromDisk(filename: string | null | undefined) {
  if (!filename) return;
  const abs = path.resolve(COMPETITOR_FILES_DIR, filename);
  if (!abs.startsWith(path.resolve(COMPETITOR_FILES_DIR) + path.sep)) return;
  try { fs.unlinkSync(abs); } catch { /* schon weg */ }
}

// ── Typen ──
interface CompetitorRow {
  id: number; product_id: number; sort_order: number;
  asin: string; url: string; title: string; subtitle: string; brand: string; price: string;
  rating: number | null; reviews: number | null; checked_on: string;
  strengths: string; weaknesses: string; differentiation: string; neutral: string;
  is_main: number; created_at: number; updated_at: number;
}
interface FileRow { id: number; competitor_id: number; sort_order: number; file_path: string; original_name: string | null; mime: string | null; created_at: number; }

const router = Router();

const MAX_SHORT = 500;   // asin/url/title/price
const MAX_LONG = 5000;   // strengths/weaknesses/differentiation

function ensureProduct(id: number): boolean {
  return db.prepare(`SELECT 1 FROM amazon_products WHERE id = ?`).get(id) !== undefined;
}
// Mitbewerber gehört zum Produkt?
function loadCompetitor(productId: number, cid: number): CompetitorRow | undefined {
  return db.prepare(`SELECT * FROM amazon_competitors WHERE id = ? AND product_id = ?`).get(cid, productId) as CompetitorRow | undefined;
}
// Datei gehört zu einem Mitbewerber dieses Produkts?
function loadFile(productId: number, fid: number): FileRow | undefined {
  return db.prepare(
    `SELECT f.* FROM amazon_competitor_files f
     JOIN amazon_competitors c ON c.id = f.competitor_id
     WHERE f.id = ? AND c.product_id = ?`,
  ).get(fid, productId) as FileRow | undefined;
}

function clampRating(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(5, Math.max(0, n));
}
function clampReviews(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.trunc(n));
}

// ── GET: Liste inkl. Dateien (Hauptkonkurrenten zuerst, dann sort_order) ──
router.get('/products/:id/competitors', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) { res.status(404).json({ error: 'not found' }); return; }
  const rows = db.prepare(
    `SELECT * FROM amazon_competitors WHERE product_id = ? ORDER BY is_main DESC, sort_order, id`,
  ).all(id) as CompetitorRow[];
  const filesStmt = db.prepare(`SELECT * FROM amazon_competitor_files WHERE competitor_id = ? ORDER BY sort_order, id`);
  const competitors = rows.map(c => ({ ...c, files: filesStmt.all(c.id) as FileRow[] }));
  res.json({ competitors });
});

// ── POST: leeren Mitbewerber anlegen ──
router.post('/products/:id/competitors', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) { res.status(404).json({ error: 'not found' }); return; }
  const maxOrder = (db.prepare(`SELECT COALESCE(MAX(sort_order),0) AS m FROM amazon_competitors WHERE product_id = ?`).get(id) as { m: number }).m;
  const r = db.prepare(`INSERT INTO amazon_competitors (product_id, sort_order) VALUES (?, ?)`).run(id, maxOrder + 1);
  const c = db.prepare(`SELECT * FROM amazon_competitors WHERE id = ?`).get(r.lastInsertRowid) as CompetitorRow;
  res.status(201).json({ competitor: { ...c, files: [] } });
});

// ── PATCH reorder (MUSS vor /:cid stehen) ──
router.patch('/products/:id/competitors/reorder', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) { res.status(404).json({ error: 'not found' }); return; }
  const order = (req.body ?? {}).order;
  if (!Array.isArray(order)) { res.status(400).json({ error: 'order fehlt' }); return; }
  const upd = db.prepare(`UPDATE amazon_competitors SET sort_order = ? WHERE id = ? AND product_id = ?`);
  const tx = db.transaction((ids: number[]) => { ids.forEach((cid, i) => upd.run(i, cid, id)); });
  tx(order.map(Number).filter(Number.isInteger));
  res.status(204).end();
});

// ── PATCH: Feld-Update ──
const TEXT_FIELDS = ['asin', 'url', 'title', 'subtitle', 'brand', 'price', 'checked_on', 'strengths', 'weaknesses', 'differentiation', 'neutral'] as const;
router.patch('/products/:id/competitors/:cid', (req: Request, res: Response) => {
  const id = Number(req.params.id); const cid = Number(req.params.cid);
  if (!Number.isInteger(id) || !Number.isInteger(cid) || !loadCompetitor(id, cid)) { res.status(404).json({ error: 'not found' }); return; }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const sets: string[] = []; const vals: unknown[] = [];
  for (const f of TEXT_FIELDS) {
    if (f in body) {
      const limit = (f === 'subtitle' || f === 'strengths' || f === 'weaknesses' || f === 'differentiation' || f === 'neutral') ? MAX_LONG : MAX_SHORT;
      sets.push(`${f} = ?`); vals.push(String(body[f] ?? '').slice(0, limit));
    }
  }
  if ('rating' in body) { sets.push('rating = ?'); vals.push(clampRating(body.rating)); }
  if ('reviews' in body) { sets.push('reviews = ?'); vals.push(clampReviews(body.reviews)); }
  if ('is_main' in body) { sets.push('is_main = ?'); vals.push(body.is_main ? 1 : 0); }
  if (sets.length === 0) { res.json({ competitor: loadCompetitor(id, cid) }); return; }
  sets.push('updated_at = unixepoch()');
  db.prepare(`UPDATE amazon_competitors SET ${sets.join(', ')} WHERE id = ?`).run(...vals, cid);
  const c = loadCompetitor(id, cid)!;
  const files = db.prepare(`SELECT * FROM amazon_competitor_files WHERE competitor_id = ? ORDER BY sort_order, id`).all(cid) as FileRow[];
  res.json({ competitor: { ...c, files } });
});

// ── DELETE Mitbewerber (CASCADE räumt Datei-Zeilen; Dateien auf Platte separat entfernen) ──
router.delete('/products/:id/competitors/:cid', (req: Request, res: Response) => {
  const id = Number(req.params.id); const cid = Number(req.params.cid);
  if (!Number.isInteger(id) || !Number.isInteger(cid) || !loadCompetitor(id, cid)) { res.status(404).json({ error: 'not found' }); return; }
  const files = db.prepare(`SELECT file_path FROM amazon_competitor_files WHERE competitor_id = ?`).all(cid) as { file_path: string }[];
  db.prepare(`DELETE FROM amazon_competitors WHERE id = ?`).run(cid);
  files.forEach(f => deleteFileFromDisk(f.file_path));
  res.status(204).end();
});

// ── Datei-Upload je Mitbewerber ──
router.post('/products/:id/competitors/:cid/files', (req: Request, res: Response) => {
  const id = Number(req.params.id); const cid = Number(req.params.cid);
  if (!Number.isInteger(id) || !Number.isInteger(cid) || !loadCompetitor(id, cid)) { res.status(404).json({ error: 'not found' }); return; }
  competitorUpload.single('file')(req, res, (err: unknown) => {
    if (err) { res.status(400).json({ error: err instanceof Error ? err.message : 'upload failed' }); return; }
    const file = (req as Request & { file?: { filename: string; originalname: string; mimetype: string } }).file;
    if (!file) { res.status(400).json({ error: 'no file' }); return; }
    const maxOrder = (db.prepare(`SELECT COALESCE(MAX(sort_order),0) AS m FROM amazon_competitor_files WHERE competitor_id = ?`).get(cid) as { m: number }).m;
    // multer/busboy liefert originalname latin1-dekodiert -> UTF-8 wiederherstellen (Umlaute)
    const original = Buffer.from(file.originalname, 'latin1').toString('utf8').slice(0, 300);
    const r = db.prepare(`INSERT INTO amazon_competitor_files (competitor_id, sort_order, file_path, original_name, mime) VALUES (?, ?, ?, ?, ?)`)
      .run(cid, maxOrder + 1, file.filename, original, file.mimetype.slice(0, 200));
    res.status(201).json({ file: db.prepare(`SELECT * FROM amazon_competitor_files WHERE id = ?`).get(r.lastInsertRowid) as FileRow });
  });
});

// ── Datei ausliefern (Blob) ──
router.get('/products/:id/competitors/files/:fid/blob', (req: Request, res: Response) => {
  const id = Number(req.params.id); const fid = Number(req.params.fid);
  if (!Number.isInteger(id) || !Number.isInteger(fid)) { res.status(404).end(); return; }
  const f = loadFile(id, fid);
  if (!f) { res.status(404).end(); return; }
  const abs = path.resolve(COMPETITOR_FILES_DIR, f.file_path);
  if (!abs.startsWith(path.resolve(COMPETITOR_FILES_DIR) + path.sep) || !fs.existsSync(abs)) { res.status(404).end(); return; }
  res.setHeader('Content-Type', f.mime || 'application/octet-stream');
  const ascii = (f.original_name ?? 'datei').replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
  res.setHeader('Content-Disposition', `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(f.original_name ?? 'datei')}`);
  fs.createReadStream(abs).pipe(res);
});

// ── Datei löschen ──
router.delete('/products/:id/competitors/files/:fid', (req: Request, res: Response) => {
  const id = Number(req.params.id); const fid = Number(req.params.fid);
  if (!Number.isInteger(id) || !Number.isInteger(fid)) { res.status(404).json({ error: 'not found' }); return; }
  const f = loadFile(id, fid);
  if (!f) { res.status(404).json({ error: 'not found' }); return; }
  db.prepare(`DELETE FROM amazon_competitor_files WHERE id = ?`).run(fid);
  deleteFileFromDisk(f.file_path);
  res.status(204).end();
});

export default router;
