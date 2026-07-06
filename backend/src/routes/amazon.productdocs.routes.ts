import { Router, type Request, type Response } from 'express';
import db from '../db/connection';
import multer from 'multer';
import path from 'path';
import os from 'os';
import fs from 'fs';
import crypto from 'crypto';

// ── Datei-Speicher (multer) ── eigenes Verzeichnis für Produkt-Dokumente ──
// Nimmt BELIEBIGE Dateitypen (Bilder UND PDF/Dielines/Anleitungen etc.) — KEINE MIME-Beschränkung.
const DOCS_FILES_DIR = path.join(os.homedir(), '.local', 'share', 'benny-dashboard', 'amazon-product-docs');
if (!fs.existsSync(DOCS_FILES_DIR)) fs.mkdirSync(DOCS_FILES_DIR, { recursive: true });
const docUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, DOCS_FILES_DIR),
    filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname) || ''}`),
  }),
  limits: { fileSize: 50 * 1024 * 1024 },
});
function deleteFileFromDisk(filename: string | null | undefined) {
  if (!filename) return;
  const abs = path.resolve(DOCS_FILES_DIR, filename);
  if (!abs.startsWith(path.resolve(DOCS_FILES_DIR) + path.sep)) return;
  try { fs.unlinkSync(abs); } catch { /* schon weg */ }
}

// ── Typen ──
type DocArea = 'verpackung' | 'anleitung';
interface DocRow {
  id: number; product_id: number; area: DocArea; sort_order: number;
  file_path: string; original_name: string | null; mime: string | null; created_at: number;
}

const router = Router();

const MAX_NOTES = 20000;

function ensureProduct(id: number): boolean {
  return db.prepare(`SELECT 1 FROM amazon_products WHERE id = ?`).get(id) !== undefined;
}
function isArea(v: unknown): v is DocArea {
  return v === 'verpackung' || v === 'anleitung';
}

// ── GET /products/:id/docs/:area ── Dateien + Notiz ──
router.get('/products/:id/docs/:area', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const area = req.params.area;
  if (!Number.isInteger(id) || !ensureProduct(id) || !isArea(area)) { res.status(404).json({ error: 'not found' }); return; }
  const files = db.prepare(
    `SELECT * FROM amazon_product_docs WHERE product_id = ? AND area = ? ORDER BY sort_order, id`,
  ).all(id, area) as DocRow[];
  const noteRow = db.prepare(
    `SELECT notes FROM amazon_product_doc_notes WHERE product_id = ? AND area = ?`,
  ).get(id, area) as { notes: string } | undefined;
  res.json({ files, notes: noteRow?.notes ?? '' });
});

// ── POST /products/:id/docs/:area ── (multipart „file") beliebiger Dateityp ──
router.post('/products/:id/docs/:area', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const area = req.params.area;
  if (!Number.isInteger(id) || !ensureProduct(id) || !isArea(area)) { res.status(404).json({ error: 'not found' }); return; }
  docUpload.single('file')(req, res, (err: unknown) => {
    if (err) { res.status(400).json({ error: err instanceof Error ? err.message : 'upload failed' }); return; }
    const file = (req as Request & { file?: { filename: string; originalname: string; mimetype: string } }).file;
    if (!file) { res.status(400).json({ error: 'no file' }); return; }
    const maxOrder = (db.prepare(
      `SELECT COALESCE(MAX(sort_order),0) AS m FROM amazon_product_docs WHERE product_id = ? AND area = ?`,
    ).get(id, area) as { m: number }).m;
    const r = db.prepare(
      `INSERT INTO amazon_product_docs (product_id, area, sort_order, file_path, original_name, mime) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      id, area, maxOrder + 1, file.filename,
      Buffer.from(file.originalname, 'latin1').toString('utf8').slice(0, 300),
      file.mimetype.slice(0, 200),
    );
    res.status(201).json({ file: db.prepare(`SELECT * FROM amazon_product_docs WHERE id = ?`).get(r.lastInsertRowid) as DocRow });
  });
});

// ── GET /products/:id/docs/:area/files/:fileId ── Blob streamen (inline) ──
router.get('/products/:id/docs/:area/files/:fileId', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const area = req.params.area;
  const fileId = Number(req.params.fileId);
  if (!Number.isInteger(id) || !Number.isInteger(fileId) || !isArea(area)) { res.status(404).end(); return; }
  const row = db.prepare(
    `SELECT * FROM amazon_product_docs WHERE id = ? AND product_id = ? AND area = ?`,
  ).get(fileId, id, area) as DocRow | undefined;
  if (!row) { res.status(404).end(); return; }
  const abs = path.resolve(DOCS_FILES_DIR, row.file_path);
  if (!abs.startsWith(path.resolve(DOCS_FILES_DIR) + path.sep) || !fs.existsSync(abs)) { res.status(404).end(); return; }
  res.setHeader('Content-Type', row.mime || 'application/octet-stream');
  const ascii = (row.original_name ?? 'datei').replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
  res.setHeader('Content-Disposition', `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(row.original_name ?? 'datei')}`);
  fs.createReadStream(abs).pipe(res);
});

// ── DELETE /products/:id/docs/:area/files/:fileId ── Datei + Zeile ──
router.delete('/products/:id/docs/:area/files/:fileId', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const area = req.params.area;
  const fileId = Number(req.params.fileId);
  if (!Number.isInteger(id) || !Number.isInteger(fileId) || !isArea(area)) { res.status(404).json({ error: 'not found' }); return; }
  const row = db.prepare(
    `SELECT * FROM amazon_product_docs WHERE id = ? AND product_id = ? AND area = ?`,
  ).get(fileId, id, area) as DocRow | undefined;
  if (!row) { res.status(404).json({ error: 'not found' }); return; }
  db.prepare(`DELETE FROM amazon_product_docs WHERE id = ?`).run(fileId);
  deleteFileFromDisk(row.file_path);
  res.status(204).end();
});

// ── POST /products/:id/docs/:area/reorder ── ({ order: number[] }) ──
router.post('/products/:id/docs/:area/reorder', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const area = req.params.area;
  if (!Number.isInteger(id) || !ensureProduct(id) || !isArea(area)) { res.status(404).json({ error: 'not found' }); return; }
  const order = req.body?.order;
  if (!Array.isArray(order)) { res.status(400).json({ error: 'order fehlt' }); return; }
  const upd = db.prepare(`UPDATE amazon_product_docs SET sort_order = ? WHERE id = ? AND product_id = ? AND area = ?`);
  db.transaction(() => { order.forEach((fid: number, idx: number) => upd.run(idx + 1, fid, id, area)); })();
  res.status(204).end();
});

// ── PUT /products/:id/docs/:area/notes ── ({ notes }) UPSERT ──
router.put('/products/:id/docs/:area/notes', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const area = req.params.area;
  if (!Number.isInteger(id) || !ensureProduct(id) || !isArea(area)) { res.status(404).json({ error: 'not found' }); return; }
  const notes = String((req.body ?? {}).notes ?? '').slice(0, MAX_NOTES);
  db.prepare(`
    INSERT INTO amazon_product_doc_notes (product_id, area, notes)
    VALUES (?, ?, ?)
    ON CONFLICT(product_id, area) DO UPDATE SET
      notes = excluded.notes,
      updated_at = unixepoch()
  `).run(id, area, notes);
  res.json({ notes });
});

export default router;
