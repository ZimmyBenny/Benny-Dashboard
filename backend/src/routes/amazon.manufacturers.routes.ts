import { Router, type Request, type Response } from 'express';
import db from '../db/connection';
import multer from 'multer';
import path from 'path';
import os from 'os';
import fs from 'fs';
import crypto from 'crypto';

const OFFER_FILES_DIR = path.join(os.homedir(), '.local', 'share', 'benny-dashboard', 'amazon-manufacturer-offer-files');
if (!fs.existsSync(OFFER_FILES_DIR)) fs.mkdirSync(OFFER_FILES_DIR, { recursive: true });
const offerFileUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, OFFER_FILES_DIR),
    filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname) || ''}`),
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
});
function deleteOfferFileFromDisk(filename: string | null | undefined) {
  if (!filename) return;
  const abs = path.resolve(OFFER_FILES_DIR, filename);
  if (!abs.startsWith(path.resolve(OFFER_FILES_DIR) + path.sep)) return;
  try { fs.unlinkSync(abs); } catch { /* schon weg */ }
}
interface OfferFileRow { id: number; offer_id: number; sort_order: number; file_path: string; original_name: string | null; mime: string | null; created_at: number; }
function loadOfferFiles(offerId: number): OfferFileRow[] {
  return db.prepare(`SELECT * FROM amazon_manufacturer_offer_files WHERE offer_id = ? ORDER BY sort_order, id`).all(offerId) as OfferFileRow[];
}
function loadOfferFile(offerId: number, fId: number): OfferFileRow | undefined {
  return db.prepare(`SELECT * FROM amazon_manufacturer_offer_files WHERE id = ? AND offer_id = ?`).get(fId, offerId) as OfferFileRow | undefined;
}

const router = Router();
const MAX_TEXT_LEN = 2000;

function ensureProduct(id: number): boolean {
  return db.prepare(`SELECT 1 FROM amazon_products WHERE id = ?`).get(id) !== undefined;
}
function getOrCreateSettings(productId: number): SettingsRow {
  let row = db.prepare(`SELECT * FROM amazon_manufacturer_settings WHERE product_id = ?`).get(productId) as SettingsRow | undefined;
  if (!row) {
    db.prepare(`INSERT INTO amazon_manufacturer_settings (product_id) VALUES (?)`).run(productId);
    row = db.prepare(`SELECT * FROM amazon_manufacturer_settings WHERE product_id = ?`).get(productId) as SettingsRow;
  }
  return row;
}

interface ManufacturerRow {
  id: number; product_id: number; sort_order: number; name: string;
  ansprechpartner: string | null; adresse: string | null; email: string | null;
  webseite: string | null; notizen: string | null; created_at: number; updated_at: number;
}
interface OfferRow {
  id: number; manufacturer_id: number; sort_order: number;
  menge_variante: string | null; preis: string | null; moq: string | null;
  lieferzeit: string | null; datum: string | null; notiz: string | null;
  currency: string; is_latest: number;
  created_at: number; updated_at: number;
}
interface SettingsRow { product_id: number; usd_eur_rate: string | null; updated_at: number; }

function loadManufacturer(productId: number, mId: number): ManufacturerRow | undefined {
  return db.prepare(`SELECT * FROM amazon_manufacturers WHERE id = ? AND product_id = ?`).get(mId, productId) as ManufacturerRow | undefined;
}
function loadOffers(mId: number): OfferRow[] {
  return db.prepare(`SELECT * FROM amazon_manufacturer_offers WHERE manufacturer_id = ? ORDER BY sort_order, id`).all(mId) as OfferRow[];
}
function loadOffer(mId: number, oId: number): OfferRow | undefined {
  return db.prepare(`SELECT * FROM amazon_manufacturer_offers WHERE id = ? AND manufacturer_id = ?`).get(oId, mId) as OfferRow | undefined;
}
function withOffers(m: ManufacturerRow) {
  return { ...m, offers: loadOffers(m.id).map(o => ({ ...o, files: loadOfferFiles(o.id) })) };
}
function normText(raw: unknown): { skip: true } | { skip: false; value: string | null } | { error: true } {
  if (raw === undefined) return { skip: true };
  if (raw === null) return { skip: false, value: null };
  if (typeof raw !== 'string') return { error: true };
  const t = raw.trim();
  if (t.length === 0) return { skip: false, value: null };
  if (t.length > MAX_TEXT_LEN) return { error: true };
  return { skip: false, value: t };
}

router.get('/products/:id/manufacturers', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) { res.status(404).json({ error: 'product not found' }); return; }
  const rows = db.prepare(`SELECT * FROM amazon_manufacturers WHERE product_id = ? ORDER BY sort_order, id`).all(id) as ManufacturerRow[];
  res.json({ manufacturers: rows.map(withOffers), settings: getOrCreateSettings(id) });
});

router.post('/products/:id/manufacturers', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) { res.status(404).json({ error: 'product not found' }); return; }
  const nameRaw = (req.body as { name?: unknown })?.name;
  const name = typeof nameRaw === 'string' ? nameRaw.trim().slice(0, MAX_TEXT_LEN) : '';
  const maxOrder = (db.prepare(`SELECT COALESCE(MAX(sort_order),0) AS m FROM amazon_manufacturers WHERE product_id = ?`).get(id) as { m: number }).m;
  const r = db.prepare(`INSERT INTO amazon_manufacturers (product_id, sort_order, name) VALUES (?, ?, ?)`).run(id, maxOrder + 1, name);
  const row = db.prepare(`SELECT * FROM amazon_manufacturers WHERE id = ?`).get(r.lastInsertRowid) as ManufacturerRow;
  res.status(201).json({ manufacturer: withOffers(row) });
});

// settings + reorder MUST be registered before /:mId to prevent Express matching literal paths as the param
router.patch('/products/:id/manufacturers/settings', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) { res.status(404).json({ error: 'not found' }); return; }
  const raw = (req.body as { usd_eur_rate?: unknown })?.usd_eur_rate;
  let value: string | null;
  if (raw === undefined || raw === null) value = null;
  else if (typeof raw !== 'string') { res.status(400).json({ error: 'invalid usd_eur_rate' }); return; }
  else { const t = raw.trim(); value = t.length === 0 ? null : t.slice(0, 50); }
  getOrCreateSettings(id);
  db.prepare(`UPDATE amazon_manufacturer_settings SET usd_eur_rate = ?, updated_at = unixepoch() WHERE product_id = ?`).run(value, id);
  res.json({ settings: getOrCreateSettings(id) });
});

router.patch('/products/:id/manufacturers/reorder', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) { res.status(404).json({ error: 'not found' }); return; }
  const order = (req.body as { order?: unknown })?.order;
  if (!Array.isArray(order) || order.some(x => !Number.isInteger(x))) { res.status(400).json({ error: 'invalid order' }); return; }
  const own = db.prepare(`SELECT id FROM amazon_manufacturers WHERE product_id = ?`).all(id) as Array<{ id: number }>;
  const ownIds = new Set(own.map(o => o.id));
  if (order.length !== ownIds.size || order.some((x: number) => !ownIds.has(x))) { res.status(400).json({ error: 'order mismatch' }); return; }
  const upd = db.prepare(`UPDATE amazon_manufacturers SET sort_order = ? WHERE id = ?`);
  db.transaction(() => { order.forEach((mid: number, idx: number) => upd.run(idx + 1, mid)); })();
  const rows = db.prepare(`SELECT * FROM amazon_manufacturers WHERE product_id = ? ORDER BY sort_order, id`).all(id) as ManufacturerRow[];
  res.json({ manufacturers: rows.map(withOffers) });
});

router.patch('/products/:id/manufacturers/:mId', (req: Request, res: Response) => {
  const id = Number(req.params.id); const mId = Number(req.params.mId);
  if (!Number.isInteger(id) || !Number.isInteger(mId)) { res.status(404).json({ error: 'not found' }); return; }
  if (!ensureProduct(id) || !loadManufacturer(id, mId)) { res.status(404).json({ error: 'not found' }); return; }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const sets: string[] = []; const vals: unknown[] = [];
  if (body.name !== undefined) {
    if (typeof body.name !== 'string') { res.status(400).json({ error: 'invalid name' }); return; }
    const nm = body.name.trim();
    if (nm.length === 0 || nm.length > MAX_TEXT_LEN) { res.status(400).json({ error: 'invalid name' }); return; }
    sets.push('name = ?'); vals.push(nm);
  }
  for (const field of ['ansprechpartner', 'adresse', 'email', 'webseite', 'notizen'] as const) {
    if (field in body) {
      const n = normText(body[field]);
      if ('error' in n) { res.status(400).json({ error: `invalid ${field}` }); return; }
      if (!n.skip) { sets.push(`${field} = ?`); vals.push(n.value); }
    }
  }
  if (sets.length === 0) { res.json({ manufacturer: withOffers(loadManufacturer(id, mId) as ManufacturerRow) }); return; }
  sets.push('updated_at = unixepoch()');
  db.prepare(`UPDATE amazon_manufacturers SET ${sets.join(', ')} WHERE id = ?`).run(...vals, mId);
  res.json({ manufacturer: withOffers(loadManufacturer(id, mId) as ManufacturerRow) });
});

router.delete('/products/:id/manufacturers/:mId', (req: Request, res: Response) => {
  const id = Number(req.params.id); const mId = Number(req.params.mId);
  if (!Number.isInteger(id) || !Number.isInteger(mId) || !ensureProduct(id) || !loadManufacturer(id, mId)) { res.status(404).json({ error: 'not found' }); return; }
  let fileRows: OfferFileRow[] = [];
  db.transaction(() => {
    const offerIds = (db.prepare(`SELECT id FROM amazon_manufacturer_offers WHERE manufacturer_id = ?`).all(mId) as Array<{ id: number }>).map(o => o.id);
    fileRows = offerIds.flatMap(oid => loadOfferFiles(oid));
    if (offerIds.length) db.prepare(`DELETE FROM amazon_manufacturer_offer_files WHERE offer_id IN (${offerIds.map(() => '?').join(',')})`).run(...offerIds);
    db.prepare(`DELETE FROM amazon_manufacturer_offers WHERE manufacturer_id = ?`).run(mId);
    try { db.prepare(`UPDATE amazon_usp_manufacturers SET manufacturer_id = NULL WHERE manufacturer_id = ?`).run(mId); } catch { /* Spalte evtl. noch nicht da (Phase A) */ }
    db.prepare(`DELETE FROM amazon_manufacturers WHERE id = ?`).run(mId);
  })();
  fileRows.forEach(f => deleteOfferFileFromDisk(f.file_path));
  res.status(204).end();
});

router.post('/products/:id/manufacturers/:mId/offers', (req: Request, res: Response) => {
  const id = Number(req.params.id); const mId = Number(req.params.mId);
  if (!Number.isInteger(id) || !Number.isInteger(mId) || !ensureProduct(id) || !loadManufacturer(id, mId)) { res.status(404).json({ error: 'not found' }); return; }
  const maxOrder = (db.prepare(`SELECT COALESCE(MAX(sort_order),0) AS m FROM amazon_manufacturer_offers WHERE manufacturer_id = ?`).get(mId) as { m: number }).m;
  const r = db.prepare(`INSERT INTO amazon_manufacturer_offers (manufacturer_id, sort_order) VALUES (?, ?)`).run(mId, maxOrder + 1);
  res.status(201).json({ offer: db.prepare(`SELECT * FROM amazon_manufacturer_offers WHERE id = ?`).get(r.lastInsertRowid) as OfferRow });
});

// reorder MUST be registered before /:oId to prevent Express matching "reorder" as the param
router.patch('/products/:id/manufacturers/:mId/offers/reorder', (req: Request, res: Response) => {
  const id = Number(req.params.id); const mId = Number(req.params.mId);
  if (![id, mId].every(Number.isInteger) || !ensureProduct(id) || !loadManufacturer(id, mId)) { res.status(404).json({ error: 'not found' }); return; }
  const order = (req.body as { order?: unknown })?.order;
  if (!Array.isArray(order) || order.some(x => !Number.isInteger(x))) { res.status(400).json({ error: 'invalid order' }); return; }
  const own = new Set(loadOffers(mId).map(o => o.id));
  if (order.length !== own.size || order.some((x: number) => !own.has(x))) { res.status(400).json({ error: 'order mismatch' }); return; }
  const upd = db.prepare(`UPDATE amazon_manufacturer_offers SET sort_order = ? WHERE id = ?`);
  db.transaction(() => { order.forEach((oid: number, idx: number) => upd.run(idx + 1, oid)); })();
  res.json({ offers: loadOffers(mId) });
});

router.patch('/products/:id/manufacturers/:mId/offers/:oId', (req: Request, res: Response) => {
  const id = Number(req.params.id); const mId = Number(req.params.mId); const oId = Number(req.params.oId);
  if (![id, mId, oId].every(Number.isInteger) || !ensureProduct(id) || !loadManufacturer(id, mId) || !loadOffer(mId, oId)) { res.status(404).json({ error: 'not found' }); return; }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const sets: string[] = []; const vals: unknown[] = [];
  for (const field of ['menge_variante', 'preis', 'moq', 'lieferzeit', 'datum', 'notiz'] as const) {
    if (field in body) {
      const n = normText(body[field]);
      if ('error' in n) { res.status(400).json({ error: `invalid ${field}` }); return; }
      if (!n.skip) { sets.push(`${field} = ?`); vals.push(n.value); }
    }
  }
  if (body.currency !== undefined) {
    if (body.currency !== 'USD' && body.currency !== 'EUR') { res.status(400).json({ error: 'invalid currency' }); return; }
    sets.push('currency = ?'); vals.push(body.currency);
  }
  let setLatestExclusive = false;
  if (body.is_latest !== undefined) {
    if (body.is_latest !== 0 && body.is_latest !== 1) { res.status(400).json({ error: 'invalid is_latest' }); return; }
    sets.push('is_latest = ?'); vals.push(body.is_latest);
    if (body.is_latest === 1) setLatestExclusive = true;
  }
  if (sets.length === 0) { res.json({ offer: loadOffer(mId, oId) as OfferRow }); return; }
  sets.push('updated_at = unixepoch()');
  db.transaction(() => {
    db.prepare(`UPDATE amazon_manufacturer_offers SET ${sets.join(', ')} WHERE id = ?`).run(...vals, oId);
    if (setLatestExclusive) db.prepare(`UPDATE amazon_manufacturer_offers SET is_latest = 0 WHERE manufacturer_id = ? AND id != ?`).run(mId, oId);
  })();
  res.json({ offer: loadOffer(mId, oId) as OfferRow });
});

router.delete('/products/:id/manufacturers/:mId/offers/:oId', (req: Request, res: Response) => {
  const id = Number(req.params.id); const mId = Number(req.params.mId); const oId = Number(req.params.oId);
  if (![id, mId, oId].every(Number.isInteger) || !ensureProduct(id) || !loadManufacturer(id, mId) || !loadOffer(mId, oId)) { res.status(404).json({ error: 'not found' }); return; }
  const ofiles = loadOfferFiles(oId);
  db.transaction(() => {
    db.prepare(`DELETE FROM amazon_manufacturer_offer_files WHERE offer_id = ?`).run(oId);
    db.prepare(`DELETE FROM amazon_manufacturer_offers WHERE id = ?`).run(oId);
  })();
  ofiles.forEach(f => deleteOfferFileFromDisk(f.file_path));
  res.status(204).end();
});

router.post('/products/:id/manufacturers/:mId/offers/:oId/files', (req: Request, res: Response) => {
  const id = Number(req.params.id); const mId = Number(req.params.mId); const oId = Number(req.params.oId);
  if (![id, mId, oId].every(Number.isInteger) || !ensureProduct(id) || !loadManufacturer(id, mId) || !loadOffer(mId, oId)) { res.status(404).json({ error: 'not found' }); return; }
  offerFileUpload.single('file')(req, res, (err: unknown) => {
    if (err) { res.status(400).json({ error: err instanceof Error ? err.message : 'upload failed' }); return; }
    const file = (req as Request & { file?: { filename: string; originalname: string; mimetype: string } }).file;
    if (!file) { res.status(400).json({ error: 'no file' }); return; }
    const maxOrder = (db.prepare(`SELECT COALESCE(MAX(sort_order),0) AS m FROM amazon_manufacturer_offer_files WHERE offer_id = ?`).get(oId) as { m: number }).m;
    const r = db.prepare(`INSERT INTO amazon_manufacturer_offer_files (offer_id, sort_order, file_path, original_name, mime) VALUES (?, ?, ?, ?, ?)`)
      .run(oId, maxOrder + 1, file.filename, file.originalname.slice(0, 300), file.mimetype.slice(0, 200));
    res.status(201).json({ file: db.prepare(`SELECT * FROM amazon_manufacturer_offer_files WHERE id = ?`).get(r.lastInsertRowid) as OfferFileRow });
  });
});

router.get('/products/:id/manufacturers/:mId/offers/:oId/files/:fId', (req: Request, res: Response) => {
  const id = Number(req.params.id); const mId = Number(req.params.mId); const oId = Number(req.params.oId); const fId = Number(req.params.fId);
  if (![id, mId, oId, fId].every(Number.isInteger) || !ensureProduct(id) || !loadManufacturer(id, mId) || !loadOffer(mId, oId)) { res.status(404).end(); return; }
  const f = loadOfferFile(oId, fId);
  if (!f) { res.status(404).end(); return; }
  const abs = path.resolve(OFFER_FILES_DIR, f.file_path);
  if (!abs.startsWith(path.resolve(OFFER_FILES_DIR) + path.sep) || !fs.existsSync(abs)) { res.status(404).end(); return; }
  res.setHeader('Content-Type', f.mime || 'application/octet-stream');
  const ascii = (f.original_name ?? 'datei').replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
  res.setHeader('Content-Disposition', `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(f.original_name ?? 'datei')}`);
  fs.createReadStream(abs).pipe(res);
});

router.delete('/products/:id/manufacturers/:mId/offers/:oId/files/:fId', (req: Request, res: Response) => {
  const id = Number(req.params.id); const mId = Number(req.params.mId); const oId = Number(req.params.oId); const fId = Number(req.params.fId);
  if (![id, mId, oId, fId].every(Number.isInteger) || !ensureProduct(id) || !loadManufacturer(id, mId) || !loadOffer(mId, oId)) { res.status(404).json({ error: 'not found' }); return; }
  const f = loadOfferFile(oId, fId);
  if (!f) { res.status(404).json({ error: 'not found' }); return; }
  db.prepare(`DELETE FROM amazon_manufacturer_offer_files WHERE id = ?`).run(fId);
  deleteOfferFileFromDisk(f.file_path);
  res.status(204).end();
});

export default router;
