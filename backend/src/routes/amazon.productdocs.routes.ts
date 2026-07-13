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
// Hinweis: Die Spalte `area` bleibt in der DB (NOT NULL + CHECK), ist aber LEGACY.
// Gefiltert wird ausschliesslich ueber topic_id. Neue Uploads schreiben konstant
// area='verpackung' als CHECK-erfuellenden Platzhalter (siehe POST-Route).
interface DocRow {
  id: number; product_id: number; area: string; topic_id: number | null; sort_order: number;
  file_path: string; original_name: string | null; mime: string | null; created_at: number;
  is_final: number; manufacturer_id: number | null;
}
interface TopicRow {
  id: number; product_id: number; name: string; sort_order: number; created_at: number;
}
interface TextVariantRow {
  id: number; topic_id: number; text: string; is_favorite: number; sort_order: number;
  created_at: number; updated_at: number;
}

// Bucket-Parsing: 0 (oder leer/ungueltig) → Allgemein (NULL). Sonst positive Hersteller-ID.
function parseBucketToMfrId(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}
// Herstellername/Topic-Name fuer ZIP-Dateiname holen; Sonderzeichen fuer Dateinamen bereinigen.
function sanitizeForFilename(name: string): string {
  return name.replace(/[/\\?%*:|"<>]/g, '_').replace(/\s+/g, ' ').trim() || 'Datei';
}

const router = Router();

const MAX_NOTES = 20000;
const MAX_TOPIC_NAME = 300;
const MAX_VARIANT_TEXT = 20000;

function ensureProduct(id: number): boolean {
  return db.prepare(`SELECT 1 FROM amazon_products WHERE id = ?`).get(id) !== undefined;
}
// Ownership-Guard: Topic muss existieren UND zum Produkt gehoeren.
function ensureTopic(productId: number, topicId: number): boolean {
  if (!Number.isInteger(productId) || !Number.isInteger(topicId)) return false;
  return db.prepare(`SELECT 1 FROM amazon_product_doc_topics WHERE id = ? AND product_id = ?`).get(topicId, productId) !== undefined;
}

// ════════════════════════════════════════════════════════════════════════════
// Topic-CRUD (Unterpunkte von „Design & Druck").
// WICHTIG: literale/reorder-Pfade MUESSEN vor /:topicId registriert werden,
// sonst matcht Express „reorder" als :topicId (vgl. manufacturers reorder).
// ════════════════════════════════════════════════════════════════════════════

// ── GET /products/:id/topics ── alle Unterpunkte eines Produkts ──
router.get('/products/:id/topics', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) { res.status(404).json({ error: 'product not found' }); return; }
  const topics = db.prepare(
    `SELECT * FROM amazon_product_doc_topics WHERE product_id = ? ORDER BY sort_order, id`,
  ).all(id) as TopicRow[];
  res.json({ topics });
});

// ── POST /products/:id/topics ── neuen Unterpunkt anlegen ──
router.post('/products/:id/topics', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) { res.status(404).json({ error: 'product not found' }); return; }
  const rawName = (req.body as { name?: unknown })?.name;
  const name = (typeof rawName === 'string' ? rawName.trim() : '').slice(0, MAX_TOPIC_NAME) || 'Neuer Unterpunkt';
  const maxOrder = (db.prepare(
    `SELECT COALESCE(MAX(sort_order),0) AS m FROM amazon_product_doc_topics WHERE product_id = ?`,
  ).get(id) as { m: number }).m;
  const r = db.prepare(
    `INSERT INTO amazon_product_doc_topics (product_id, name, sort_order) VALUES (?, ?, ?)`,
  ).run(id, name, maxOrder + 1);
  const topic = db.prepare(`SELECT * FROM amazon_product_doc_topics WHERE id = ?`).get(r.lastInsertRowid) as TopicRow;
  res.status(201).json({ topic });
});

// ── PATCH /products/:id/topics/reorder ── VOR /:topicId ── ──
router.patch('/products/:id/topics/reorder', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) { res.status(404).json({ error: 'not found' }); return; }
  const order = (req.body as { order?: unknown })?.order;
  if (!Array.isArray(order) || order.some(x => !Number.isInteger(x))) { res.status(400).json({ error: 'invalid order' }); return; }
  const own = db.prepare(`SELECT id FROM amazon_product_doc_topics WHERE product_id = ?`).all(id) as Array<{ id: number }>;
  const ownIds = new Set(own.map(o => o.id));
  if (order.length !== ownIds.size || order.some((x: number) => !ownIds.has(x))) { res.status(400).json({ error: 'order mismatch' }); return; }
  const upd = db.prepare(`UPDATE amazon_product_doc_topics SET sort_order = ? WHERE id = ?`);
  db.transaction(() => { order.forEach((tid: number, idx: number) => upd.run(idx + 1, tid)); })();
  const topics = db.prepare(`SELECT * FROM amazon_product_doc_topics WHERE product_id = ? ORDER BY sort_order, id`).all(id) as TopicRow[];
  res.json({ topics });
});

// ── PATCH /products/:id/topics/:topicId ── umbenennen ──
router.patch('/products/:id/topics/:topicId', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const topicId = Number(req.params.topicId);
  if (!ensureTopic(id, topicId)) { res.status(404).json({ error: 'not found' }); return; }
  const rawName = (req.body as { name?: unknown })?.name;
  if (typeof rawName !== 'string') { res.status(400).json({ error: 'invalid name' }); return; }
  const name = rawName.trim().slice(0, MAX_TOPIC_NAME);
  if (name.length === 0) { res.status(400).json({ error: 'invalid name' }); return; }
  db.prepare(`UPDATE amazon_product_doc_topics SET name = ? WHERE id = ? AND product_id = ?`).run(name, topicId, id);
  const topic = db.prepare(`SELECT * FROM amazon_product_doc_topics WHERE id = ?`).get(topicId) as TopicRow;
  res.json({ topic });
});

// ── DELETE /products/:id/topics/:topicId ── EXPLIZITES Cascade (nicht auf FK verlassen) ──
router.delete('/products/:id/topics/:topicId', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const topicId = Number(req.params.topicId);
  if (!ensureTopic(id, topicId)) { res.status(404).json({ error: 'not found' }); return; }
  // Datei-Zeilen VOR dem Loeschen lesen (fuer Disk-Cleanup nach der Transaktion).
  const fileRows = db.prepare(`SELECT file_path FROM amazon_product_docs WHERE topic_id = ?`).all(topicId) as Array<{ file_path: string }>;
  db.transaction(() => {
    db.prepare(`DELETE FROM amazon_product_doc_notes WHERE topic_id = ?`).run(topicId);
    db.prepare(`DELETE FROM amazon_product_docs WHERE topic_id = ?`).run(topicId);
    db.prepare(`DELETE FROM amazon_product_doc_topics WHERE id = ? AND product_id = ?`).run(topicId, id);
  })();
  // Disk-Files NACH erfolgreicher Transaktion entfernen.
  fileRows.forEach(r => deleteFileFromDisk(r.file_path));
  res.status(204).end();
});

// ════════════════════════════════════════════════════════════════════════════
// Doc-Routen — jetzt ueber :topicId (Ownership per ensureTopic statt isArea).
// ════════════════════════════════════════════════════════════════════════════

// ── GET /products/:id/docs/:topicId ── Dateien + Notiz ──
router.get('/products/:id/docs/:topicId', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const topicId = Number(req.params.topicId);
  if (!ensureTopic(id, topicId)) { res.status(404).json({ error: 'not found' }); return; }
  const files = db.prepare(
    `SELECT * FROM amazon_product_docs WHERE product_id = ? AND topic_id = ? ORDER BY sort_order, id`,
  ).all(id, topicId) as DocRow[];
  // „Gesendet an"-Marker: pro Datei die Liste der Hersteller-IDs, an die sie schon ging.
  const fileIds = files.map((f) => f.id);
  const sentMap = new Map<number, number[]>();
  if (fileIds.length > 0) {
    const placeholders = fileIds.map(() => '?').join(',');
    const sendRows = db.prepare(
      `SELECT file_id, manufacturer_id FROM amazon_product_doc_sends WHERE file_id IN (${placeholders})`,
    ).all(...fileIds) as { file_id: number; manufacturer_id: number }[];
    for (const s of sendRows) {
      const arr = sentMap.get(s.file_id) ?? [];
      arr.push(s.manufacturer_id);
      sentMap.set(s.file_id, arr);
    }
  }
  const filesOut = files.map((f) => ({ ...f, sent_to: sentMap.get(f.id) ?? [] }));
  // ALLE Notiz-Buckets als Map (Key = manufacturer_bucket als String; "0" = Allgemein).
  const noteRows = db.prepare(
    `SELECT manufacturer_bucket, notes FROM amazon_product_doc_notes WHERE topic_id = ?`,
  ).all(topicId) as { manufacturer_bucket: number; notes: string }[];
  const notes: Record<string, string> = {};
  for (const n of noteRows) notes[String(n.manufacturer_bucket)] = n.notes;
  // Text-Varianten dieses Topics (Beileger etc.) — topic-weit, unabhaengig vom Bucket.
  const textVariants = db.prepare(
    `SELECT * FROM amazon_product_doc_text_variants WHERE topic_id = ? ORDER BY sort_order, id`,
  ).all(topicId) as TextVariantRow[];
  res.json({ files: filesOut, notes, textVariants });
});

// ── POST /products/:id/docs/:topicId ── (multipart „file") beliebiger Dateityp ──
router.post('/products/:id/docs/:topicId', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const topicId = Number(req.params.topicId);
  if (!ensureTopic(id, topicId)) { res.status(404).json({ error: 'not found' }); return; }
  docUpload.single('file')(req, res, (err: unknown) => {
    if (err) { res.status(400).json({ error: err instanceof Error ? err.message : 'upload failed' }); return; }
    const file = (req as Request & { file?: { filename: string; originalname: string; mimetype: string } }).file;
    if (!file) { res.status(400).json({ error: 'no file' }); return; }
    const maxOrder = (db.prepare(
      `SELECT COALESCE(MAX(sort_order),0) AS m FROM amazon_product_docs WHERE product_id = ? AND topic_id = ?`,
    ).get(id, topicId) as { m: number }).m;
    // Optionaler is_final (Query oder Body, 0|1). Default 0 = Arbeitsdatei.
    const rawFinal = (req.query.is_final ?? (req.body as { is_final?: unknown } | undefined)?.is_final);
    const isFinal = String(rawFinal) === '1' ? 1 : 0;
    // Optionaler manufacturer_id (Query oder Body) fuer Direkt-Upload in einen Final-Reiter.
    const rawMfr = (req.query.manufacturer_id ?? (req.body as { manufacturer_id?: unknown } | undefined)?.manufacturer_id);
    const mfrId = isFinal === 1 ? parseBucketToMfrId(rawMfr) : null;
    // area ist LEGACY (NOT NULL + CHECK): konstanter Platzhalter 'verpackung', wird von der
    // Query-Logik ignoriert — gefiltert wird ausschliesslich ueber topic_id.
    const r = db.prepare(
      `INSERT INTO amazon_product_docs (product_id, area, topic_id, sort_order, file_path, original_name, mime, is_final, manufacturer_id) VALUES (?, 'verpackung', ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id, topicId, maxOrder + 1, file.filename,
      Buffer.from(file.originalname, 'latin1').toString('utf8').slice(0, 300),
      file.mimetype.slice(0, 200),
      isFinal, mfrId,
    );
    res.status(201).json({ file: db.prepare(`SELECT * FROM amazon_product_docs WHERE id = ?`).get(r.lastInsertRowid) as DocRow });
  });
});

// ── GET /products/:id/docs/:topicId/final.zip ── alle finalen Dateien als ZIP ──
// (Kein „files/"-Segment im Pfad → kollisionsfrei mit /files/:fileId.)
router.get('/products/:id/docs/:topicId/final.zip', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const topicId = Number(req.params.topicId);
  if (!ensureTopic(id, topicId)) { res.status(404).json({ error: 'not found' }); return; }
  // bucket=0 → Allgemein (nur manufacturer_id IS NULL).
  // bucket=<id> → Hersteller-Satz: manufacturer_id = <id> ODER manufacturer_id IS NULL,
  //   d.h. die Allgemein-Dateien gelten fuer ALLE Hersteller und sind mit im ZIP.
  const mfrId = parseBucketToMfrId(req.query.bucket);
  const rows = (mfrId === null
    ? db.prepare(
        `SELECT * FROM amazon_product_docs WHERE product_id = ? AND topic_id = ? AND is_final = 1 AND manufacturer_id IS NULL ORDER BY sort_order, id`,
      ).all(id, topicId)
    : db.prepare(
        `SELECT * FROM amazon_product_docs WHERE product_id = ? AND topic_id = ? AND is_final = 1 AND (manufacturer_id = ? OR manufacturer_id IS NULL) ORDER BY (manufacturer_id IS NULL), sort_order, id`,
      ).all(id, topicId, mfrId)) as DocRow[];
  if (rows.length === 0) { res.status(400).json({ error: 'Keine finalen Dateien vorhanden.' }); return; }

  // Herstellername (oder „Allgemein") fuer den Dateinamen.
  let bucketLabel = 'Allgemein';
  if (mfrId !== null) {
    const m = db.prepare(`SELECT name FROM amazon_manufacturers WHERE id = ? AND product_id = ?`).get(mfrId, id) as { name: string } | undefined;
    bucketLabel = m ? sanitizeForFilename(m.name) : `Hersteller-${mfrId}`;
  }
  // ZIP-Basisname aus dem Topic-Namen (muss zur Frontend-zipFilenameFor passen: sanitize(Topic-Name)).
  const topic = db.prepare(`SELECT name FROM amazon_product_doc_topics WHERE id = ?`).get(topicId) as { name: string } | undefined;
  const zipBase = sanitizeForFilename(topic?.name ?? 'Unterpunkt');
  const zipName = `${zipBase}-${bucketLabel}-final.zip`;
  const asciiZip = zipName.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${asciiZip}"; filename*=UTF-8''${encodeURIComponent(zipName)}`);

  const archive = new ZipArchive({ zlib: { level: 9 } });
  archive.on('error', (err) => {
    if (!res.headersSent) res.status(500).json({ error: err.message });
    else { try { res.destroy(); } catch { /* ignore */ } }
  });
  archive.pipe(res);

  const usedNames = new Set<string>();
  for (const row of rows) {
    const abs = path.resolve(DOCS_FILES_DIR, row.file_path);
    if (!abs.startsWith(path.resolve(DOCS_FILES_DIR) + path.sep) || !fs.existsSync(abs)) continue;
    let entryName = (row.original_name ?? 'datei').replace(/[/\\]/g, '_') || 'datei';
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

// ── GET /products/:id/docs/:topicId/files/:fileId ── Blob streamen (inline) ──
router.get('/products/:id/docs/:topicId/files/:fileId', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const topicId = Number(req.params.topicId);
  const fileId = Number(req.params.fileId);
  if (!Number.isInteger(fileId) || !ensureTopic(id, topicId)) { res.status(404).end(); return; }
  const row = db.prepare(
    `SELECT * FROM amazon_product_docs WHERE id = ? AND product_id = ? AND topic_id = ?`,
  ).get(fileId, id, topicId) as DocRow | undefined;
  if (!row) { res.status(404).end(); return; }
  const abs = path.resolve(DOCS_FILES_DIR, row.file_path);
  if (!abs.startsWith(path.resolve(DOCS_FILES_DIR) + path.sep) || !fs.existsSync(abs)) { res.status(404).end(); return; }
  res.setHeader('Content-Type', row.mime || 'application/octet-stream');
  const ascii = (row.original_name ?? 'datei').replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
  res.setHeader('Content-Disposition', `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(row.original_name ?? 'datei')}`);
  fs.createReadStream(abs).pipe(res);
});

// ── PATCH /products/:id/docs/:topicId/files/:fileId ── ({ is_final?, manufacturer_id?, topic_id? }) ──
// Zwei Modi:
//  a) OHNE topic_id → internes Verschieben (Arbeit↔Final / Bucket) innerhalb des Topics (bisher).
//  b) MIT topic_id → Datei in einen ANDEREN Unterpunkt DESSELBEN Produkts verschieben
//     (Cross-Topic-Move; kein Kopieren — topic_id wird umgesetzt).
router.patch('/products/:id/docs/:topicId/files/:fileId', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const topicId = Number(req.params.topicId);
  const fileId = Number(req.params.fileId);
  if (!Number.isInteger(fileId) || !ensureTopic(id, topicId)) { res.status(404).json({ error: 'not found' }); return; }
  const body = (req.body ?? {}) as { is_final?: unknown; manufacturer_id?: unknown; topic_id?: unknown; original_name?: unknown };
  const rawFinal = body.is_final;
  const row = db.prepare(
    `SELECT * FROM amazon_product_docs WHERE id = ? AND product_id = ? AND topic_id = ?`,
  ).get(fileId, id, topicId) as DocRow | undefined;
  if (!row) { res.status(404).json({ error: 'not found' }); return; }

  // ── Umbenennen ── body.original_name gesetzt → nur den Anzeige-/Download-Namen aendern.
  // Die physische Datei (file_path) bleibt unangetastet; original_name ist reiner Anzeigename.
  if (body.original_name !== undefined) {
    let newName = String(body.original_name).replace(/[/\\]/g, '_').trim().slice(0, 300);
    if (!newName) { res.status(400).json({ error: 'Name darf nicht leer sein' }); return; }
    // Original-Endung erhalten, damit die Datei beim Download korrekt oeffnet.
    const extMatch = (row.original_name ?? '').match(/\.[A-Za-z0-9]{1,10}$/);
    const oldExt = extMatch ? extMatch[0] : '';
    if (oldExt && !newName.toLowerCase().endsWith(oldExt.toLowerCase())) newName += oldExt;
    db.prepare(`UPDATE amazon_product_docs SET original_name = ? WHERE id = ?`).run(newName, fileId);
    res.json({ file: db.prepare(`SELECT * FROM amazon_product_docs WHERE id = ?`).get(fileId) as DocRow });
    return;
  }

  let isFinal = row.is_final;
  if (rawFinal !== undefined) {
    if (String(rawFinal) !== '0' && String(rawFinal) !== '1') { res.status(400).json({ error: 'is_final muss 0 oder 1 sein' }); return; }
    isFinal = String(rawFinal) === '1' ? 1 : 0;
  }
  let mfrId: number | null;
  if (isFinal === 0) {
    mfrId = null;
  } else if ('manufacturer_id' in body) {
    mfrId = parseBucketToMfrId(body.manufacturer_id);
  } else {
    mfrId = row.manufacturer_id;
  }

  // Cross-Topic-Move: body.topic_id gesetzt → Ziel-Topic muss zum selben Produkt gehoeren.
  if (body.topic_id !== undefined) {
    const targetTopicId = Number(body.topic_id);
    if (!Number.isInteger(targetTopicId) || !ensureTopic(id, targetTopicId)) { res.status(404).json({ error: 'target topic not found' }); return; }
    // is_final/manufacturer_id fuer den Ziel-Bucket: Defaults 0/NULL, wenn nicht mitgegeben.
    const targetFinal = rawFinal !== undefined ? isFinal : 0;
    const targetMfr = targetFinal === 1 ? mfrId : null;
    db.prepare(
      `UPDATE amazon_product_docs SET topic_id = ?, is_final = ?, manufacturer_id = ? WHERE id = ? AND topic_id = ?`,
    ).run(targetTopicId, targetFinal, targetMfr, fileId, topicId);
    res.json({ file: db.prepare(`SELECT * FROM amazon_product_docs WHERE id = ?`).get(fileId) as DocRow });
    return;
  }

  db.prepare(`UPDATE amazon_product_docs SET is_final = ?, manufacturer_id = ? WHERE id = ?`).run(isFinal, mfrId, fileId);
  res.json({ file: db.prepare(`SELECT * FROM amazon_product_docs WHERE id = ?`).get(fileId) as DocRow });
});

// ── DELETE /products/:id/docs/:topicId/files/:fileId ── Datei + Zeile ──
router.delete('/products/:id/docs/:topicId/files/:fileId', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const topicId = Number(req.params.topicId);
  const fileId = Number(req.params.fileId);
  if (!Number.isInteger(fileId) || !ensureTopic(id, topicId)) { res.status(404).json({ error: 'not found' }); return; }
  const row = db.prepare(
    `SELECT * FROM amazon_product_docs WHERE id = ? AND product_id = ? AND topic_id = ?`,
  ).get(fileId, id, topicId) as DocRow | undefined;
  if (!row) { res.status(404).json({ error: 'not found' }); return; }
  db.prepare(`DELETE FROM amazon_product_docs WHERE id = ?`).run(fileId);
  deleteFileFromDisk(row.file_path);
  res.status(204).end();
});

// ── „Gesendet an"-Marker (Datei × Hersteller) ── PUT setzt, DELETE entfernt ──
// Eigenes Pfad-Segment „/sends/:mfrId" → kollisionsfrei mit /files/:fileId.
function ensureSendTargets(id: number, topicId: number, fileId: number, mfrId: number): boolean {
  if (!Number.isInteger(fileId) || !Number.isInteger(mfrId) || !ensureTopic(id, topicId)) return false;
  const file = db.prepare(`SELECT 1 FROM amazon_product_docs WHERE id = ? AND product_id = ? AND topic_id = ?`).get(fileId, id, topicId);
  const mfr = db.prepare(`SELECT 1 FROM amazon_manufacturers WHERE id = ? AND product_id = ?`).get(mfrId, id);
  return file !== undefined && mfr !== undefined;
}
router.put('/products/:id/docs/:topicId/files/:fileId/sends/:mfrId', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const topicId = Number(req.params.topicId);
  const fileId = Number(req.params.fileId);
  const mfrId = Number(req.params.mfrId);
  if (!ensureSendTargets(id, topicId, fileId, mfrId)) { res.status(404).json({ error: 'not found' }); return; }
  db.prepare(`INSERT OR IGNORE INTO amazon_product_doc_sends (file_id, manufacturer_id) VALUES (?, ?)`).run(fileId, mfrId);
  res.status(204).end();
});
router.delete('/products/:id/docs/:topicId/files/:fileId/sends/:mfrId', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const topicId = Number(req.params.topicId);
  const fileId = Number(req.params.fileId);
  const mfrId = Number(req.params.mfrId);
  if (!Number.isInteger(fileId) || !Number.isInteger(mfrId) || !ensureTopic(id, topicId)) { res.status(404).json({ error: 'not found' }); return; }
  db.prepare(`DELETE FROM amazon_product_doc_sends WHERE file_id = ? AND manufacturer_id = ?`).run(fileId, mfrId);
  res.status(204).end();
});

// ── POST /products/:id/docs/:topicId/reorder ── ({ order: number[] }) ──
router.post('/products/:id/docs/:topicId/reorder', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const topicId = Number(req.params.topicId);
  if (!ensureTopic(id, topicId)) { res.status(404).json({ error: 'not found' }); return; }
  const order = req.body?.order;
  if (!Array.isArray(order)) { res.status(400).json({ error: 'order fehlt' }); return; }
  const upd = db.prepare(`UPDATE amazon_product_docs SET sort_order = ? WHERE id = ? AND product_id = ? AND topic_id = ?`);
  db.transaction(() => { order.forEach((fid: number, idx: number) => upd.run(idx + 1, fid, id, topicId)); })();
  res.status(204).end();
});

// ── PUT /products/:id/docs/:topicId/notes ── ({ manufacturer_bucket, notes }) UPSERT ──
// Eine Notiz pro Topic UND Bucket (0 = Allgemein, sonst manufacturer_id).
router.put('/products/:id/docs/:topicId/notes', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const topicId = Number(req.params.topicId);
  if (!ensureTopic(id, topicId)) { res.status(404).json({ error: 'not found' }); return; }
  const body = (req.body ?? {}) as { manufacturer_bucket?: unknown; notes?: unknown };
  const notes = String(body.notes ?? '').slice(0, MAX_NOTES);
  const bucket = parseBucketToMfrId(body.manufacturer_bucket) ?? 0;
  db.prepare(`
    INSERT INTO amazon_product_doc_notes (topic_id, manufacturer_bucket, notes)
    VALUES (?, ?, ?)
    ON CONFLICT(topic_id, manufacturer_bucket) DO UPDATE SET
      notes = excluded.notes,
      updated_at = unixepoch()
  `).run(topicId, bucket, notes);
  res.json({ manufacturer_bucket: bucket, notes });
});

// ════════════════════════════════════════════════════════════════════════════
// Text-Varianten je Topic (Beileger-Formulierungs-Kandidaten etc.) — Migr. 119.
// Topic-weit, unabhaengig vom Hersteller-Bucket. Einzel-CRUD → KEIN createBackup
// noetig (CLAUDE.md-Regel).
// ════════════════════════════════════════════════════════════════════════════

// Ownership-Guard: Variante muss existieren UND zum Topic gehoeren.
function ensureTextVariant(topicId: number, variantId: number): boolean {
  if (!Number.isInteger(variantId)) return false;
  return db.prepare(
    `SELECT 1 FROM amazon_product_doc_text_variants WHERE id = ? AND topic_id = ?`,
  ).get(variantId, topicId) !== undefined;
}

// ── POST /products/:id/docs/:topicId/text-variants ── neue leere Variante ans Ende ──
router.post('/products/:id/docs/:topicId/text-variants', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const topicId = Number(req.params.topicId);
  if (!ensureTopic(id, topicId)) { res.status(404).json({ error: 'not found' }); return; }
  const maxOrder = (db.prepare(
    `SELECT COALESCE(MAX(sort_order),0) AS m FROM amazon_product_doc_text_variants WHERE topic_id = ?`,
  ).get(topicId) as { m: number }).m;
  const r = db.prepare(
    `INSERT INTO amazon_product_doc_text_variants (topic_id, text, sort_order) VALUES (?, '', ?)`,
  ).run(topicId, maxOrder + 1);
  const variant = db.prepare(`SELECT * FROM amazon_product_doc_text_variants WHERE id = ?`).get(r.lastInsertRowid) as TextVariantRow;
  res.status(201).json({ variant });
});

// ── PATCH /products/:id/docs/:topicId/text-variants/:variantId ── ({ text?, is_favorite? }) ──
// is_favorite: true MUSS exklusiv sein — alle anderen Varianten des Topics werden in
// derselben Transaktion auf 0 gesetzt.
router.patch('/products/:id/docs/:topicId/text-variants/:variantId', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const topicId = Number(req.params.topicId);
  const variantId = Number(req.params.variantId);
  if (!ensureTopic(id, topicId) || !ensureTextVariant(topicId, variantId)) { res.status(404).json({ error: 'not found' }); return; }
  const body = (req.body ?? {}) as { text?: unknown; is_favorite?: unknown };

  let text: string | undefined;
  if (body.text !== undefined) text = String(body.text).slice(0, MAX_VARIANT_TEXT);

  let isFav: 0 | 1 | undefined;
  if (body.is_favorite !== undefined) {
    const rawFav = body.is_favorite;
    if (rawFav !== true && rawFav !== false && rawFav !== 0 && rawFav !== 1) {
      res.status(400).json({ error: 'is_favorite muss 0 oder 1 sein' });
      return;
    }
    isFav = (rawFav === true || rawFav === 1) ? 1 : 0;
  }

  db.transaction(() => {
    if (isFav === 1) {
      db.prepare(`UPDATE amazon_product_doc_text_variants SET is_favorite = 0 WHERE topic_id = ?`).run(topicId);
    }
    if (text !== undefined && isFav !== undefined) {
      db.prepare(
        `UPDATE amazon_product_doc_text_variants SET text = ?, is_favorite = ?, updated_at = unixepoch() WHERE id = ?`,
      ).run(text, isFav, variantId);
    } else if (text !== undefined) {
      db.prepare(
        `UPDATE amazon_product_doc_text_variants SET text = ?, updated_at = unixepoch() WHERE id = ?`,
      ).run(text, variantId);
    } else if (isFav !== undefined) {
      db.prepare(
        `UPDATE amazon_product_doc_text_variants SET is_favorite = ?, updated_at = unixepoch() WHERE id = ?`,
      ).run(isFav, variantId);
    }
  })();

  const variant = db.prepare(`SELECT * FROM amazon_product_doc_text_variants WHERE id = ?`).get(variantId) as TextVariantRow;
  res.json({ variant });
});

// ── DELETE /products/:id/docs/:topicId/text-variants/:variantId ── ──
router.delete('/products/:id/docs/:topicId/text-variants/:variantId', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const topicId = Number(req.params.topicId);
  const variantId = Number(req.params.variantId);
  if (!ensureTopic(id, topicId) || !ensureTextVariant(topicId, variantId)) { res.status(404).json({ error: 'not found' }); return; }
  db.prepare(`DELETE FROM amazon_product_doc_text_variants WHERE id = ? AND topic_id = ?`).run(variantId, topicId);
  res.status(204).end();
});

export default router;
