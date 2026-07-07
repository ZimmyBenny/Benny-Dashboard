import { Router, type Request, type Response } from 'express';
import db from '../db/connection';
import multer from 'multer';
import path from 'path';
import os from 'os';
import fs from 'fs';
import crypto from 'crypto';
import { ZipArchive } from 'archiver';

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
  is_final: number; manufacturer_id: number | null;
}

// Bucket-Parsing: 0 (oder leer/ungueltig) → Allgemein (NULL). Sonst positive Hersteller-ID.
function parseBucketToMfrId(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}
// Herstellername fuer ZIP-Dateiname holen; Sonderzeichen fuer Dateinamen bereinigen.
function sanitizeForFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, '_').replace(/\s+/g, ' ').trim() || 'Datei';
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
  // ALLE Notiz-Buckets als Map (Key = manufacturer_bucket als String; "0" = Allgemein).
  const noteRows = db.prepare(
    `SELECT manufacturer_bucket, notes FROM amazon_product_doc_notes WHERE product_id = ? AND area = ?`,
  ).all(id, area) as { manufacturer_bucket: number; notes: string }[];
  const notes: Record<string, string> = {};
  for (const n of noteRows) notes[String(n.manufacturer_bucket)] = n.notes;
  res.json({ files, notes });
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
    // Optionaler is_final (Query oder Body, 0|1). Default 0 = Arbeitsdatei.
    const rawFinal = (req.query.is_final ?? (req.body as { is_final?: unknown } | undefined)?.is_final);
    const isFinal = String(rawFinal) === '1' ? 1 : 0;
    // Optionaler manufacturer_id (Query oder Body) fuer Direkt-Upload in einen Final-Reiter.
    // Nur relevant wenn is_final=1; sonst immer NULL (Arbeitsdateien sind gemeinsam).
    const rawMfr = (req.query.manufacturer_id ?? (req.body as { manufacturer_id?: unknown } | undefined)?.manufacturer_id);
    const mfrId = isFinal === 1 ? parseBucketToMfrId(rawMfr) : null;
    const r = db.prepare(
      `INSERT INTO amazon_product_docs (product_id, area, sort_order, file_path, original_name, mime, is_final, manufacturer_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id, area, maxOrder + 1, file.filename,
      Buffer.from(file.originalname, 'latin1').toString('utf8').slice(0, 300),
      file.mimetype.slice(0, 200),
      isFinal, mfrId,
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

// ── GET /products/:id/docs/:area/final.zip ── alle finalen Dateien als ZIP ──
// Eintragsnamen = original_name; doppelte Namen bekommen einen Zaehler-Praefix
// (z. B. „2_name.pdf"). Muss VOR der generischen /files/:fileId-Route stehen? Nein —
// der Pfad enthaelt kein „files/"-Segment, daher kollisionsfrei.
router.get('/products/:id/docs/:area/final.zip', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const area = req.params.area;
  if (!Number.isInteger(id) || !ensureProduct(id) || !isArea(area)) { res.status(404).json({ error: 'not found' }); return; }
  // bucket=0 → Allgemein (manufacturer_id IS NULL); bucket=<id> → manufacturer_id = <id>.
  const mfrId = parseBucketToMfrId(req.query.bucket);
  const rows = (mfrId === null
    ? db.prepare(
        `SELECT * FROM amazon_product_docs WHERE product_id = ? AND area = ? AND is_final = 1 AND manufacturer_id IS NULL ORDER BY sort_order, id`,
      ).all(id, area)
    : db.prepare(
        `SELECT * FROM amazon_product_docs WHERE product_id = ? AND area = ? AND is_final = 1 AND manufacturer_id = ? ORDER BY sort_order, id`,
      ).all(id, area, mfrId)) as DocRow[];
  if (rows.length === 0) { res.status(400).json({ error: 'Keine finalen Dateien vorhanden.' }); return; }

  // Herstellername (oder „Allgemein") fuer den Dateinamen.
  let bucketLabel = 'Allgemein';
  if (mfrId !== null) {
    const m = db.prepare(`SELECT name FROM amazon_manufacturers WHERE id = ? AND product_id = ?`).get(mfrId, id) as { name: string } | undefined;
    bucketLabel = m ? sanitizeForFilename(m.name) : `Hersteller-${mfrId}`;
  }
  const zipBase = area === 'verpackung' ? 'Verpackungsdesign' : 'Aufbauanleitung';
  const zipName = `${zipBase}-${bucketLabel}-final.zip`;
  const asciiZip = zipName.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${asciiZip}"; filename*=UTF-8''${encodeURIComponent(zipName)}`);

  const archive = new ZipArchive({ zlib: { level: 9 } });
  archive.on('error', (err) => {
    // Header sind evtl. schon gesendet — Verbindung sauber beenden.
    if (!res.headersSent) res.status(500).json({ error: err.message });
    else { try { res.destroy(); } catch { /* ignore */ } }
  });
  archive.pipe(res);

  const usedNames = new Set<string>();
  for (const row of rows) {
    const abs = path.resolve(DOCS_FILES_DIR, row.file_path);
    // Path-Traversal-Schutz + Existenzpruefung wie im Rest der Datei.
    if (!abs.startsWith(path.resolve(DOCS_FILES_DIR) + path.sep) || !fs.existsSync(abs)) continue;
    let entryName = (row.original_name ?? 'datei').replace(/[/\\]/g, '_') || 'datei';
    // Bei doppelten Namen mit Zaehler eindeutig machen: name.pdf, 2_name.pdf, 3_name.pdf …
    if (usedNames.has(entryName)) {
      let n = 2;
      while (usedNames.has(`${n}_${entryName}`)) n++;
      entryName = `${n}_${entryName}`;
    }
    usedNames.add(entryName);
    archive.file(abs, { name: entryName });
  }
  archive.finalize();
});

// ── PATCH /products/:id/docs/:area/files/:fileId ── ({ is_final?, manufacturer_id? }) ──
// Verschieben zwischen Arbeit (0) und Final (1). Beim Verschieben nach Final wird der
// Ziel-Bucket gesetzt (manufacturer_id = Hersteller-ID oder NULL fuer Allgemein).
// Zurueck zu Arbeit (is_final=0) → manufacturer_id immer NULL (Arbeitsdateien gemeinsam).
router.patch('/products/:id/docs/:area/files/:fileId', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const area = req.params.area;
  const fileId = Number(req.params.fileId);
  if (!Number.isInteger(id) || !Number.isInteger(fileId) || !isArea(area)) { res.status(404).json({ error: 'not found' }); return; }
  const body = (req.body ?? {}) as { is_final?: unknown; manufacturer_id?: unknown };
  const rawFinal = body.is_final;
  // Ownership: Datei muss zu product + area gehoeren.
  const row = db.prepare(
    `SELECT * FROM amazon_product_docs WHERE id = ? AND product_id = ? AND area = ?`,
  ).get(fileId, id, area) as DocRow | undefined;
  if (!row) { res.status(404).json({ error: 'not found' }); return; }

  // is_final: bei fehlendem Wert den bestehenden Zustand beibehalten (z. B. reiner Bucket-Wechsel).
  let isFinal = row.is_final;
  if (rawFinal !== undefined) {
    if (String(rawFinal) !== '0' && String(rawFinal) !== '1') { res.status(400).json({ error: 'is_final muss 0 oder 1 sein' }); return; }
    isFinal = String(rawFinal) === '1' ? 1 : 0;
  }
  // manufacturer_id: nur bei Final relevant. „manufacturer_id" im Body → Ziel-Bucket setzen.
  // Zurueck zu Arbeit → immer NULL. Wenn im Body nicht angegeben und Final bleibt → bestehenden Wert halten.
  let mfrId: number | null;
  if (isFinal === 0) {
    mfrId = null;
  } else if ('manufacturer_id' in body) {
    mfrId = parseBucketToMfrId(body.manufacturer_id);
  } else {
    mfrId = row.manufacturer_id;
  }
  db.prepare(`UPDATE amazon_product_docs SET is_final = ?, manufacturer_id = ? WHERE id = ?`).run(isFinal, mfrId, fileId);
  res.json({ file: db.prepare(`SELECT * FROM amazon_product_docs WHERE id = ?`).get(fileId) as DocRow });
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

// ── PUT /products/:id/docs/:area/notes ── ({ manufacturer_bucket, notes }) UPSERT ──
// Eine Notiz pro Bereich UND Bucket (0 = Allgemein, sonst manufacturer_id).
router.put('/products/:id/docs/:area/notes', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const area = req.params.area;
  if (!Number.isInteger(id) || !ensureProduct(id) || !isArea(area)) { res.status(404).json({ error: 'not found' }); return; }
  const body = (req.body ?? {}) as { manufacturer_bucket?: unknown; notes?: unknown };
  const notes = String(body.notes ?? '').slice(0, MAX_NOTES);
  // Bucket: 0 (oder ungueltig) = Allgemein; sonst Hersteller-ID.
  const bucket = parseBucketToMfrId(body.manufacturer_bucket) ?? 0;
  db.prepare(`
    INSERT INTO amazon_product_doc_notes (product_id, area, manufacturer_bucket, notes)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(product_id, area, manufacturer_bucket) DO UPDATE SET
      notes = excluded.notes,
      updated_at = unixepoch()
  `).run(id, area, bucket, notes);
  res.json({ manufacturer_bucket: bucket, notes });
});

export default router;
