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

const SAMPLE_PHOTOS_DIR = path.join(os.homedir(), '.local', 'share', 'benny-dashboard', 'amazon-manufacturer-sample-photos');
if (!fs.existsSync(SAMPLE_PHOTOS_DIR)) fs.mkdirSync(SAMPLE_PHOTOS_DIR, { recursive: true });
const samplePhotoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, SAMPLE_PHOTOS_DIR),
    filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname) || ''}`),
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
});
function deleteSamplePhotoFromDisk(filename: string | null | undefined) {
  if (!filename) return;
  const abs = path.resolve(SAMPLE_PHOTOS_DIR, filename);
  if (!abs.startsWith(path.resolve(SAMPLE_PHOTOS_DIR) + path.sep)) return;
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
interface SettingsRow { product_id: number; usd_eur_rate: string | null; rate_date: string | null; updated_at: number; }

function loadManufacturer(productId: number, mId: number): ManufacturerRow | undefined {
  return db.prepare(`SELECT * FROM amazon_manufacturers WHERE id = ? AND product_id = ?`).get(mId, productId) as ManufacturerRow | undefined;
}
function loadOffers(mId: number): OfferRow[] {
  return db.prepare(`SELECT * FROM amazon_manufacturer_offers WHERE manufacturer_id = ? ORDER BY sort_order, id`).all(mId) as OfferRow[];
}
function loadOffer(mId: number, oId: number): OfferRow | undefined {
  return db.prepare(`SELECT * FROM amazon_manufacturer_offers WHERE id = ? AND manufacturer_id = ?`).get(oId, mId) as OfferRow | undefined;
}
interface SampleRow {
  id: number; manufacturer_id: number; sort_order: number;
  bezeichnung: string; received_date: string | null; rating: number;
  status: string; is_favorite: number;
  notizen: string | null; maengel: string | null; kosten: string | null; currency: string;
  sendungsnummer: string | null; link_url: string | null;
  created_at: number; updated_at: number;
}
interface SamplePhotoRow { id: number; sample_id: number; sort_order: number; file_path: string; original_name: string | null; mime: string | null; created_at: number; }
const SAMPLE_STATUS = new Set(['angefragt', 'bestellt', 'erhalten', 'abgelehnt']);

function loadSamples(mId: number): SampleRow[] {
  return db.prepare(`SELECT * FROM amazon_manufacturer_samples WHERE manufacturer_id = ? ORDER BY sort_order, id`).all(mId) as SampleRow[];
}
function loadSample(mId: number, sId: number): SampleRow | undefined {
  return db.prepare(`SELECT * FROM amazon_manufacturer_samples WHERE id = ? AND manufacturer_id = ?`).get(sId, mId) as SampleRow | undefined;
}
function loadSamplePhotos(sampleId: number): SamplePhotoRow[] {
  return db.prepare(`SELECT * FROM amazon_manufacturer_sample_photos WHERE sample_id = ? ORDER BY sort_order, id`).all(sampleId) as SamplePhotoRow[];
}
function loadSamplePhoto(sampleId: number, photoId: number): SamplePhotoRow | undefined {
  return db.prepare(`SELECT * FROM amazon_manufacturer_sample_photos WHERE id = ? AND sample_id = ?`).get(photoId, sampleId) as SamplePhotoRow | undefined;
}
function samplesWithPhotos(mId: number) {
  // Pruefbericht-Fortschritt je Sample: total = USP-Punkte des Produkts, done = bewertete (Status != 'offen')
  const productRow = db.prepare(`SELECT product_id FROM amazon_manufacturers WHERE id = ?`).get(mId) as { product_id: number } | undefined;
  const inspectionTotal = productRow
    ? (db.prepare(`SELECT COUNT(*) AS c FROM amazon_usp_points WHERE product_id = ?`).get(productRow.product_id) as { c: number }).c
    : 0;
  return loadSamples(mId).map(s => {
    const done = (db.prepare(
      `SELECT COUNT(*) AS c FROM amazon_sample_inspection_results WHERE sample_id = ? AND status != 'offen'`
    ).get(s.id) as { c: number }).c;
    return { ...s, photos: loadSamplePhotos(s.id), inspection_total: inspectionTotal, inspection_done: done };
  });
}

function withOffers(m: ManufacturerRow) {
  return {
    ...m,
    offers: loadOffers(m.id).map(o => ({ ...o, files: loadOfferFiles(o.id) })),
    samples: samplesWithPhotos(m.id),
  };
}
function loadMachbarkeit(productId: number, masterId: number): { umsetzbar: number; teilweise: number; nicht: number; offen: number; total: number } | null {
  const uspMan = db.prepare(`SELECT id FROM amazon_usp_manufacturers WHERE manufacturer_id = ? ORDER BY id LIMIT 1`).get(masterId) as { id: number } | undefined;
  if (!uspMan) return null;
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM amazon_usp_points WHERE product_id = ?`).get(productId) as { c: number }).c;
  if (total === 0) return null;
  const countByStatus = (status: string) => (db.prepare(
    `SELECT COUNT(*) AS c FROM amazon_usp_feasibility f JOIN amazon_usp_points p ON p.id = f.point_id
     WHERE p.product_id = ? AND f.manufacturer_id = ? AND f.status = ?`
  ).get(productId, uspMan.id, status) as { c: number }).c;
  const umsetzbar = countByStatus('umsetzbar');
  const teilweise = countByStatus('teilweise');
  const nicht = countByStatus('nicht');
  const offen = total - umsetzbar - teilweise - nicht;
  return { umsetzbar, teilweise, nicht, offen, total };
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

router.get('/fx/eur-usd', async (_req: Request, res: Response) => {
  try {
    const r = await fetch('https://api.frankfurter.app/latest?from=EUR&to=USD');
    if (!r.ok) { res.status(502).json({ error: 'fx unavailable' }); return; }
    const data = await r.json() as { rates?: { USD?: number }; date?: string };
    const rate = data?.rates?.USD; const date = data?.date;
    if (typeof rate !== 'number' || typeof date !== 'string') { res.status(502).json({ error: 'fx unavailable' }); return; }
    res.json({ rate, date });
  } catch {
    res.status(502).json({ error: 'fx unavailable' });
  }
});

router.get('/products/:id/manufacturers', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) { res.status(404).json({ error: 'product not found' }); return; }
  const rows = db.prepare(`SELECT * FROM amazon_manufacturers WHERE product_id = ? ORDER BY sort_order, id`).all(id) as ManufacturerRow[];
  res.json({ manufacturers: rows.map(m => ({ ...withOffers(m), machbarkeit: loadMachbarkeit(id, m.id) })), settings: getOrCreateSettings(id) });
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
  const body = (req.body ?? {}) as { usd_eur_rate?: unknown; rate_date?: unknown };
  const raw = body.usd_eur_rate;
  let value: string | null;
  if (raw === undefined || raw === null) value = null;
  else if (typeof raw !== 'string') { res.status(400).json({ error: 'invalid usd_eur_rate' }); return; }
  else { const t = raw.trim(); value = t.length === 0 ? null : t.slice(0, 50); }
  let dateValue: string | null = null;
  if ('rate_date' in body) {
    const rd = body.rate_date;
    if (rd === undefined || rd === null) dateValue = null;
    else if (typeof rd !== 'string') { res.status(400).json({ error: 'invalid rate_date' }); return; }
    else { const t = rd.trim(); dateValue = t.length === 0 ? null : t.slice(0, 30); }
  }
  getOrCreateSettings(id);
  db.prepare(`UPDATE amazon_manufacturer_settings SET usd_eur_rate = ?, rate_date = ?, updated_at = unixepoch() WHERE product_id = ?`).run(value, dateValue, id);
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
      .run(oId, maxOrder + 1, file.filename, Buffer.from(file.originalname, 'latin1').toString('utf8').slice(0, 300), file.mimetype.slice(0, 200));
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

// ── Samples ──
router.post('/products/:id/manufacturers/:mId/samples', (req: Request, res: Response) => {
  const id = Number(req.params.id); const mId = Number(req.params.mId);
  if (![id, mId].every(Number.isInteger) || !ensureProduct(id) || !loadManufacturer(id, mId)) { res.status(404).json({ error: 'not found' }); return; }
  const maxOrder = (db.prepare(`SELECT COALESCE(MAX(sort_order),0) AS m FROM amazon_manufacturer_samples WHERE manufacturer_id = ?`).get(mId) as { m: number }).m;
  const r = db.prepare(`INSERT INTO amazon_manufacturer_samples (manufacturer_id, sort_order) VALUES (?, ?)`).run(mId, maxOrder + 1);
  const s = db.prepare(`SELECT * FROM amazon_manufacturer_samples WHERE id = ?`).get(r.lastInsertRowid) as SampleRow;
  res.status(201).json({ sample: { ...s, photos: [] } });
});

router.patch('/products/:id/manufacturers/:mId/samples/reorder', (req: Request, res: Response) => {
  const id = Number(req.params.id); const mId = Number(req.params.mId);
  if (![id, mId].every(Number.isInteger) || !ensureProduct(id) || !loadManufacturer(id, mId)) { res.status(404).json({ error: 'not found' }); return; }
  const order = (req.body as { order?: unknown })?.order;
  if (!Array.isArray(order) || order.some(x => !Number.isInteger(x))) { res.status(400).json({ error: 'invalid order' }); return; }
  const own = new Set(loadSamples(mId).map(s => s.id));
  if (order.length !== own.size || order.some((x: number) => !own.has(x))) { res.status(400).json({ error: 'order mismatch' }); return; }
  const upd = db.prepare(`UPDATE amazon_manufacturer_samples SET sort_order = ? WHERE id = ?`);
  db.transaction(() => { order.forEach((sid: number, idx: number) => upd.run(idx + 1, sid)); })();
  res.json({ samples: samplesWithPhotos(mId) });
});

router.patch('/products/:id/manufacturers/:mId/samples/:sId', (req: Request, res: Response) => {
  const id = Number(req.params.id); const mId = Number(req.params.mId); const sId = Number(req.params.sId);
  if (![id, mId, sId].every(Number.isInteger) || !ensureProduct(id) || !loadManufacturer(id, mId) || !loadSample(mId, sId)) { res.status(404).json({ error: 'not found' }); return; }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const sets: string[] = []; const vals: unknown[] = [];
  for (const field of ['bezeichnung', 'received_date', 'notizen', 'maengel', 'kosten', 'sendungsnummer', 'link_url'] as const) {
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
  if (body.status !== undefined) {
    if (typeof body.status !== 'string' || !SAMPLE_STATUS.has(body.status)) { res.status(400).json({ error: 'invalid status' }); return; }
    sets.push('status = ?'); vals.push(body.status);
  }
  if (body.rating !== undefined) {
    const rt = Number(body.rating);
    if (!Number.isInteger(rt) || rt < 0 || rt > 5) { res.status(400).json({ error: 'invalid rating' }); return; }
    sets.push('rating = ?'); vals.push(rt);
  }
  if (body.is_favorite !== undefined) {
    if (body.is_favorite !== 0 && body.is_favorite !== 1) { res.status(400).json({ error: 'invalid is_favorite' }); return; }
    sets.push('is_favorite = ?'); vals.push(body.is_favorite);
  }
  if (sets.length === 0) { res.json({ sample: { ...(loadSample(mId, sId) as SampleRow), photos: loadSamplePhotos(sId) } }); return; }
  sets.push('updated_at = unixepoch()');
  db.prepare(`UPDATE amazon_manufacturer_samples SET ${sets.join(', ')} WHERE id = ?`).run(...vals, sId);
  res.json({ sample: { ...(loadSample(mId, sId) as SampleRow), photos: loadSamplePhotos(sId) } });
});

router.delete('/products/:id/manufacturers/:mId/samples/:sId', (req: Request, res: Response) => {
  const id = Number(req.params.id); const mId = Number(req.params.mId); const sId = Number(req.params.sId);
  if (![id, mId, sId].every(Number.isInteger) || !ensureProduct(id) || !loadManufacturer(id, mId) || !loadSample(mId, sId)) { res.status(404).json({ error: 'not found' }); return; }
  const photos = loadSamplePhotos(sId);
  db.transaction(() => {
    db.prepare(`DELETE FROM amazon_manufacturer_sample_photos WHERE sample_id = ?`).run(sId);
    db.prepare(`DELETE FROM amazon_manufacturer_samples WHERE id = ?`).run(sId);
  })();
  photos.forEach(p => deleteSamplePhotoFromDisk(p.file_path));
  res.status(204).end();
});

// ── Sample-Fotos ──
router.post('/products/:id/manufacturers/:mId/samples/:sId/photos', (req: Request, res: Response) => {
  const id = Number(req.params.id); const mId = Number(req.params.mId); const sId = Number(req.params.sId);
  if (![id, mId, sId].every(Number.isInteger) || !ensureProduct(id) || !loadManufacturer(id, mId) || !loadSample(mId, sId)) { res.status(404).json({ error: 'not found' }); return; }
  samplePhotoUpload.single('file')(req, res, (err: unknown) => {
    if (err) { res.status(400).json({ error: err instanceof Error ? err.message : 'upload failed' }); return; }
    const file = (req as Request & { file?: { filename: string; originalname: string; mimetype: string } }).file;
    if (!file) { res.status(400).json({ error: 'no file' }); return; }
    const maxOrder = (db.prepare(`SELECT COALESCE(MAX(sort_order),0) AS m FROM amazon_manufacturer_sample_photos WHERE sample_id = ?`).get(sId) as { m: number }).m;
    const r = db.prepare(`INSERT INTO amazon_manufacturer_sample_photos (sample_id, sort_order, file_path, original_name, mime) VALUES (?, ?, ?, ?, ?)`)
      .run(sId, maxOrder + 1, file.filename, Buffer.from(file.originalname, 'latin1').toString('utf8').slice(0, 300), file.mimetype.slice(0, 200));
    res.status(201).json({ photo: db.prepare(`SELECT * FROM amazon_manufacturer_sample_photos WHERE id = ?`).get(r.lastInsertRowid) as SamplePhotoRow });
  });
});

router.get('/products/:id/manufacturers/:mId/samples/:sId/photos/:photoId', (req: Request, res: Response) => {
  const id = Number(req.params.id); const mId = Number(req.params.mId); const sId = Number(req.params.sId); const photoId = Number(req.params.photoId);
  if (![id, mId, sId, photoId].every(Number.isInteger) || !ensureProduct(id) || !loadManufacturer(id, mId) || !loadSample(mId, sId)) { res.status(404).end(); return; }
  const p = loadSamplePhoto(sId, photoId);
  if (!p) { res.status(404).end(); return; }
  const abs = path.resolve(SAMPLE_PHOTOS_DIR, p.file_path);
  if (!abs.startsWith(path.resolve(SAMPLE_PHOTOS_DIR) + path.sep) || !fs.existsSync(abs)) { res.status(404).end(); return; }
  res.setHeader('Content-Type', p.mime || 'application/octet-stream');
  const ascii = (p.original_name ?? 'foto').replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
  res.setHeader('Content-Disposition', `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(p.original_name ?? 'foto')}`);
  fs.createReadStream(abs).pipe(res);
});

router.delete('/products/:id/manufacturers/:mId/samples/:sId/photos/:photoId', (req: Request, res: Response) => {
  const id = Number(req.params.id); const mId = Number(req.params.mId); const sId = Number(req.params.sId); const photoId = Number(req.params.photoId);
  if (![id, mId, sId, photoId].every(Number.isInteger) || !ensureProduct(id) || !loadManufacturer(id, mId) || !loadSample(mId, sId)) { res.status(404).json({ error: 'not found' }); return; }
  const p = loadSamplePhoto(sId, photoId);
  if (!p) { res.status(404).json({ error: 'not found' }); return; }
  db.prepare(`DELETE FROM amazon_manufacturer_sample_photos WHERE id = ?`).run(photoId);
  deleteSamplePhotoFromDisk(p.file_path);
  res.status(204).end();
});

// ─────────────────────────────────────────────────────────────────────────────
// Sample-Pruefbericht: ein Sample gegen die USP-Anforderungen pruefen
// ─────────────────────────────────────────────────────────────────────────────

interface SampleInspectionContext {
  sample_id: number; manufacturer_id: number; manufacturer_name: string;
  inspection_notes: string | null; product_id: number; product_name: string;
}
function sampleInspectionContext(sampleId: number): SampleInspectionContext | undefined {
  return db.prepare(`
    SELECT s.id AS sample_id, s.manufacturer_id, s.inspection_notes,
           m.name AS manufacturer_name, m.product_id, p.name AS product_name
    FROM amazon_manufacturer_samples s
    JOIN amazon_manufacturers m ON m.id = s.manufacturer_id
    JOIN amazon_products p ON p.id = m.product_id
    WHERE s.id = ?
  `).get(sampleId) as SampleInspectionContext | undefined;
}

const VALID_INSPECTION_STATUS = new Set(['erfuellt', 'teilweise', 'nicht', 'offen']);

// GET Pruefbericht laden (USP-Punkte + Soll/Ist + Kopf-Daten)
router.get('/products/:id/manufacturers/:mId/samples/:sampleId/inspection', (req: Request, res: Response) => {
  const sampleId = Number(req.params.sampleId);
  const ctx = sampleInspectionContext(sampleId);
  if (!ctx) { res.status(404).json({ error: 'sample not found' }); return; }

  const finalRow = db.prepare(
    `SELECT name FROM amazon_brand_name_candidates WHERE product_id = ? AND is_final = 1 ORDER BY id LIMIT 1`
  ).get(ctx.product_id) as { name: string } | undefined;

  const points = db.prepare(
    `SELECT id, title, body FROM amazon_usp_points WHERE product_id = ? ORDER BY sort_order, id`
  ).all(ctx.product_id) as { id: number; title: string; body: string | null }[];

  const questionsByPoint = new Map<number, string[]>();
  for (const q of db.prepare(
    `SELECT q.point_id AS point_id, q.text AS text FROM amazon_usp_point_questions q
     JOIN amazon_usp_points p ON p.id = q.point_id WHERE p.product_id = ? ORDER BY q.sort_order, q.id`
  ).all(ctx.product_id) as { point_id: number; text: string }[]) {
    const arr = questionsByPoint.get(q.point_id) ?? [];
    arr.push(q.text);
    questionsByPoint.set(q.point_id, arr);
  }

  // Soll: Hersteller-Angabe, falls dieser Hersteller im USP verknuepft ist
  const uspMan = db.prepare(
    `SELECT id FROM amazon_usp_manufacturers WHERE product_id = ? AND manufacturer_id = ?`
  ).get(ctx.product_id, ctx.manufacturer_id) as { id: number } | undefined;
  const sollByPoint = new Map<number, string>();
  if (uspMan) {
    for (const f of db.prepare(
      `SELECT point_id, status FROM amazon_usp_feasibility WHERE manufacturer_id = ?`
    ).all(uspMan.id) as { point_id: number; status: string }[]) {
      sollByPoint.set(f.point_id, f.status);
    }
  }

  const resultByPoint = new Map<number, { status: string; note: string | null }>();
  for (const r of db.prepare(
    `SELECT point_id, status, note FROM amazon_sample_inspection_results WHERE sample_id = ?`
  ).all(sampleId) as { point_id: number; status: string; note: string | null }[]) {
    resultByPoint.set(r.point_id, { status: r.status, note: r.note });
  }

  res.json({
    product_name: ctx.product_name,
    manufacturer_name: ctx.manufacturer_name,
    marke: finalRow?.name ?? null,
    inspection_notes: ctx.inspection_notes,
    points: points.map((p) => ({
      id: p.id,
      title: p.title,
      body: p.body,
      questions: questionsByPoint.get(p.id) ?? [],
      soll_status: sollByPoint.get(p.id) ?? null,
      ist_status: resultByPoint.get(p.id)?.status ?? 'offen',
      ist_note: resultByPoint.get(p.id)?.note ?? null,
    })),
  });
});

// PUT Ergebnis je Punkt (Upsert)
router.put('/products/:id/manufacturers/:mId/samples/:sampleId/inspection/:pointId', (req: Request, res: Response) => {
  const sampleId = Number(req.params.sampleId);
  const pointId = Number(req.params.pointId);
  const status = String(req.body?.status ?? 'offen');
  if (!VALID_INSPECTION_STATUS.has(status)) { res.status(400).json({ error: 'invalid status' }); return; }
  const note = req.body?.note == null ? null : String(req.body.note);
  if (!sampleInspectionContext(sampleId)) { res.status(404).json({ error: 'sample not found' }); return; }
  db.prepare(`
    INSERT INTO amazon_sample_inspection_results (sample_id, point_id, status, note, updated_at)
    VALUES (?, ?, ?, ?, unixepoch())
    ON CONFLICT(sample_id, point_id) DO UPDATE SET status = excluded.status, note = excluded.note, updated_at = unixepoch()
  `).run(sampleId, pointId, status, note);
  res.json({ ok: true });
});

// PATCH Zusatz-Notizen des Pruefberichts
router.patch('/products/:id/manufacturers/:mId/samples/:sampleId/inspection', (req: Request, res: Response) => {
  const sampleId = Number(req.params.sampleId);
  if (!sampleInspectionContext(sampleId)) { res.status(404).json({ error: 'sample not found' }); return; }
  const notes = req.body?.inspection_notes == null ? null : String(req.body.inspection_notes);
  db.prepare(`UPDATE amazon_manufacturer_samples SET inspection_notes = ? WHERE id = ?`).run(notes, sampleId);
  res.json({ ok: true });
});

export default router;
