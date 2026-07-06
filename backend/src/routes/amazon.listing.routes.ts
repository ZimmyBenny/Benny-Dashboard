import { Router, type Request, type Response } from 'express';
import db from '../db/connection';
import multer from 'multer';
import path from 'path';
import os from 'os';
import fs from 'fs';
import crypto from 'crypto';

// ── Bild-Speicher (multer) ── eigenes Verzeichnis für Listing-Bilder ──
const LISTING_FILES_DIR = path.join(os.homedir(), '.local', 'share', 'benny-dashboard', 'amazon-listing-images');
if (!fs.existsSync(LISTING_FILES_DIR)) fs.mkdirSync(LISTING_FILES_DIR, { recursive: true });
const listingImageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, LISTING_FILES_DIR),
    filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname) || ''}`),
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
});
function deleteImageFromDisk(filename: string | null | undefined) {
  if (!filename) return;
  const abs = path.resolve(LISTING_FILES_DIR, filename);
  if (!abs.startsWith(path.resolve(LISTING_FILES_DIR) + path.sep)) return;
  try { fs.unlinkSync(abs); } catch { /* schon weg */ }
}

// ── Typen ──
type ListingKind = 'listing' | 'competitor';
interface ListingRow {
  product_id: number;
  title: string;
  bullet_1: string; bullet_2: string; bullet_3: string; bullet_4: string; bullet_5: string;
  description: string;
  keywords_main: string;
  keywords_backend: string;
  created_at: number;
  updated_at: number;
}
interface ListingImageRow {
  id: number; product_id: number; kind: ListingKind; sort_order: number;
  file_path: string; original_name: string | null; mime: string | null; label: string | null; created_at: number;
}

const router = Router();

// Großzügige Obergrenze zur DoS-Absicherung — KEIN fachliches Byte-Limit
// (die Byte-Limits sind rein visuell im Frontend; User darf technisch drüber).
const MAX_FIELD = 10000;
const TEXT_FIELDS = ['title', 'bullet_1', 'bullet_2', 'bullet_3', 'bullet_4', 'bullet_5', 'description', 'keywords_main', 'keywords_backend'] as const;

function ensureProduct(id: number): boolean {
  return db.prepare(`SELECT 1 FROM amazon_products WHERE id = ?`).get(id) !== undefined;
}

function emptyListing(productId: number): ListingRow {
  return {
    product_id: productId,
    title: '', bullet_1: '', bullet_2: '', bullet_3: '', bullet_4: '', bullet_5: '',
    description: '', keywords_main: '', keywords_backend: '',
    created_at: 0, updated_at: 0,
  };
}

function loadImages(productId: number): { listing: ListingImageRow[]; competitor: ListingImageRow[] } {
  const rows = db.prepare(
    `SELECT * FROM amazon_listing_images WHERE product_id = ? ORDER BY sort_order, id`,
  ).all(productId) as ListingImageRow[];
  return {
    listing: rows.filter(r => r.kind === 'listing'),
    competitor: rows.filter(r => r.kind === 'competitor'),
  };
}

// ── GET /products/:id/listing ── (Upsert-Read, kein Zwangs-Insert) ──
router.get('/products/:id/listing', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) { res.status(404).json({ error: 'not found' }); return; }
  const row = db.prepare(`SELECT * FROM amazon_listing WHERE product_id = ?`).get(id) as ListingRow | undefined;
  res.json({ listing: row ?? emptyListing(id), images: loadImages(id) });
});

// ── PUT /products/:id/listing ── (Upsert Textfelder) ──
router.put('/products/:id/listing', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) { res.status(404).json({ error: 'not found' }); return; }
  const body = (req.body ?? {}) as Record<string, unknown>;

  // Vollständige Zeile für UPSERT bauen: bestehende Werte + übergebene Felder.
  const existing = db.prepare(`SELECT * FROM amazon_listing WHERE product_id = ?`).get(id) as ListingRow | undefined;
  const base = existing ?? emptyListing(id);
  const next: Record<typeof TEXT_FIELDS[number], string> = { ...base } as never;
  for (const f of TEXT_FIELDS) {
    if (f in body) next[f] = String(body[f] ?? '').slice(0, MAX_FIELD);
    else next[f] = base[f];
  }

  db.prepare(`
    INSERT INTO amazon_listing
      (product_id, title, bullet_1, bullet_2, bullet_3, bullet_4, bullet_5, description, keywords_main, keywords_backend)
    VALUES (@product_id, @title, @bullet_1, @bullet_2, @bullet_3, @bullet_4, @bullet_5, @description, @keywords_main, @keywords_backend)
    ON CONFLICT(product_id) DO UPDATE SET
      title = excluded.title,
      bullet_1 = excluded.bullet_1,
      bullet_2 = excluded.bullet_2,
      bullet_3 = excluded.bullet_3,
      bullet_4 = excluded.bullet_4,
      bullet_5 = excluded.bullet_5,
      description = excluded.description,
      keywords_main = excluded.keywords_main,
      keywords_backend = excluded.keywords_backend,
      updated_at = unixepoch()
  `).run({ product_id: id, ...next });

  res.json({ listing: db.prepare(`SELECT * FROM amazon_listing WHERE product_id = ?`).get(id) as ListingRow });
});

// ── POST /products/:id/listing/images ── kind via Query oder Body ──
router.post('/products/:id/listing/images', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) { res.status(404).json({ error: 'not found' }); return; }
  const kind = String(req.query.kind ?? req.body?.kind ?? '');
  if (kind !== 'listing' && kind !== 'competitor') { res.status(400).json({ error: "kind muss 'listing' oder 'competitor' sein" }); return; }
  listingImageUpload.single('file')(req, res, (err: unknown) => {
    if (err) { res.status(400).json({ error: err instanceof Error ? err.message : 'upload failed' }); return; }
    const file = (req as Request & { file?: { filename: string; originalname: string; mimetype: string } }).file;
    if (!file) { res.status(400).json({ error: 'no file' }); return; }
    const maxOrder = (db.prepare(
      `SELECT COALESCE(MAX(sort_order),0) AS m FROM amazon_listing_images WHERE product_id = ? AND kind = ?`,
    ).get(id, kind) as { m: number }).m;
    const r = db.prepare(
      `INSERT INTO amazon_listing_images (product_id, kind, sort_order, file_path, original_name, mime) VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(id, kind, maxOrder + 1, file.filename, Buffer.from(file.originalname, 'latin1').toString('utf8').slice(0, 300), file.mimetype.slice(0, 200));
    res.status(201).json({ image: db.prepare(`SELECT * FROM amazon_listing_images WHERE id = ?`).get(r.lastInsertRowid) as ListingImageRow });
  });
});

// ── GET /products/:id/listing/images/:imageId ── Blob streamen ──
router.get('/products/:id/listing/images/:imageId', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const imageId = Number(req.params.imageId);
  if (!Number.isInteger(id) || !Number.isInteger(imageId)) { res.status(404).end(); return; }
  const im = db.prepare(`SELECT * FROM amazon_listing_images WHERE id = ? AND product_id = ?`).get(imageId, id) as ListingImageRow | undefined;
  if (!im) { res.status(404).end(); return; }
  const abs = path.resolve(LISTING_FILES_DIR, im.file_path);
  if (!abs.startsWith(path.resolve(LISTING_FILES_DIR) + path.sep) || !fs.existsSync(abs)) { res.status(404).end(); return; }
  res.setHeader('Content-Type', im.mime || 'application/octet-stream');
  const ascii = (im.original_name ?? 'bild').replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
  res.setHeader('Content-Disposition', `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(im.original_name ?? 'bild')}`);
  fs.createReadStream(abs).pipe(res);
});

// ── DELETE /products/:id/listing/images/:imageId ──
router.delete('/products/:id/listing/images/:imageId', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const imageId = Number(req.params.imageId);
  if (!Number.isInteger(id) || !Number.isInteger(imageId)) { res.status(404).json({ error: 'not found' }); return; }
  const im = db.prepare(`SELECT * FROM amazon_listing_images WHERE id = ? AND product_id = ?`).get(imageId, id) as ListingImageRow | undefined;
  if (!im) { res.status(404).json({ error: 'not found' }); return; }
  db.prepare(`DELETE FROM amazon_listing_images WHERE id = ?`).run(imageId);
  deleteImageFromDisk(im.file_path);
  res.status(204).end();
});

// ── POST /products/:id/listing/images/reorder ──
router.post('/products/:id/listing/images/reorder', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) { res.status(404).json({ error: 'not found' }); return; }
  const kind = String(req.body?.kind ?? '');
  if (kind !== 'listing' && kind !== 'competitor') { res.status(400).json({ error: "kind muss 'listing' oder 'competitor' sein" }); return; }
  const order = req.body?.order;
  if (!Array.isArray(order)) { res.status(400).json({ error: 'order fehlt' }); return; }
  const upd = db.prepare(`UPDATE amazon_listing_images SET sort_order = ? WHERE id = ? AND product_id = ? AND kind = ?`);
  db.transaction(() => { order.forEach((iid: number, idx: number) => upd.run(idx + 1, iid, id, kind)); })();
  res.status(204).end();
});

// ── PATCH /products/:id/listing/images/:imageId ── (nur label) ──
router.patch('/products/:id/listing/images/:imageId', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const imageId = Number(req.params.imageId);
  if (!Number.isInteger(id) || !Number.isInteger(imageId)) { res.status(404).json({ error: 'not found' }); return; }
  const im = db.prepare(`SELECT * FROM amazon_listing_images WHERE id = ? AND product_id = ?`).get(imageId, id) as ListingImageRow | undefined;
  if (!im) { res.status(404).json({ error: 'not found' }); return; }
  if (!('label' in (req.body ?? {}))) { res.status(400).json({ error: 'label fehlt' }); return; }
  const label = req.body.label == null ? null : String(req.body.label).slice(0, 300);
  db.prepare(`UPDATE amazon_listing_images SET label = ? WHERE id = ?`).run(label, imageId);
  res.json({ image: db.prepare(`SELECT * FROM amazon_listing_images WHERE id = ?`).get(imageId) as ListingImageRow });
});

export default router;
