import { Router, type Request, type Response } from 'express';
import db from '../db/connection';
import multer from 'multer';
import path from 'path';
import os from 'os';
import fs from 'fs';
import crypto from 'crypto';

// ── Bild-Speicher (multer) ──
const RESEARCH_FILES_DIR = path.join(os.homedir(), '.local', 'share', 'benny-dashboard', 'amazon-research-images');
if (!fs.existsSync(RESEARCH_FILES_DIR)) fs.mkdirSync(RESEARCH_FILES_DIR, { recursive: true });
const researchImageUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, RESEARCH_FILES_DIR),
    filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname) || ''}`),
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
});
function deleteImageFromDisk(filename: string | null | undefined) {
  if (!filename) return;
  const abs = path.resolve(RESEARCH_FILES_DIR, filename);
  if (!abs.startsWith(path.resolve(RESEARCH_FILES_DIR) + path.sep)) return;
  try { fs.unlinkSync(abs); } catch { /* schon weg */ }
}

// ── Typen ──
interface TopicRow { id: number; product_id: number; sort_order: number; title: string; is_expanded: number; created_at: number; updated_at: number; }
interface CardRow { id: number; topic_id: number; sort_order: number; title: string | null; body: string; is_global: number; created_at: number; updated_at: number; }
interface LinkRow { id: number; card_id: number; sort_order: number; url: string; label: string | null; created_at: number; }
interface ImageRow { id: number; card_id: number; sort_order: number; file_path: string; original_name: string | null; mime: string | null; created_at: number; }

const router = Router();

const MAX_TITLE = 200;
const MAX_BODY = 5000;
const MAX_URL = 1000;
const MAX_LABEL = 200;

function ensureProduct(id: number): boolean {
  return db.prepare(`SELECT 1 FROM amazon_products WHERE id = ?`).get(id) !== undefined;
}
function loadTopic(productId: number, topicId: number): TopicRow | undefined {
  return db.prepare(`SELECT * FROM amazon_research_topics WHERE id = ? AND product_id = ?`).get(topicId, productId) as TopicRow | undefined;
}
function loadCardForProduct(productId: number, cardId: number): CardRow | undefined {
  return db.prepare(`
    SELECT c.* FROM amazon_research_cards c
    JOIN amazon_research_topics t ON t.id = c.topic_id
    WHERE c.id = ? AND t.product_id = ?`).get(cardId, productId) as CardRow | undefined;
}
function loadImageForProduct(productId: number, imageId: number): ImageRow | undefined {
  return db.prepare(`
    SELECT im.* FROM amazon_research_card_images im
    JOIN amazon_research_cards c ON c.id = im.card_id
    JOIN amazon_research_topics t ON t.id = c.topic_id
    WHERE im.id = ? AND t.product_id = ?`).get(imageId, productId) as ImageRow | undefined;
}

// ── GET: alle Themen verschachtelt ──
router.get('/products/:id/research/topics', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) { res.status(404).json({ error: 'not found' }); return; }
  const topics = db.prepare(`SELECT * FROM amazon_research_topics WHERE product_id = ? ORDER BY sort_order, id`).all(id) as TopicRow[];
  const cardsStmt = db.prepare(`SELECT * FROM amazon_research_cards WHERE topic_id = ? ORDER BY sort_order, id`);
  const linksStmt = db.prepare(`SELECT * FROM amazon_research_card_links WHERE card_id = ? ORDER BY sort_order, id`);
  const imagesStmt = db.prepare(`SELECT * FROM amazon_research_card_images WHERE card_id = ? ORDER BY sort_order, id`);
  const out = topics.map(t => ({
    ...t,
    cards: (cardsStmt.all(t.id) as CardRow[]).map(c => ({
      ...c,
      links: linksStmt.all(c.id) as LinkRow[],
      images: imagesStmt.all(c.id) as ImageRow[],
    })),
  }));
  res.json({ topics: out });
});

// ── Themen CRUD ──
router.post('/products/:id/research/topics', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) { res.status(404).json({ error: 'not found' }); return; }
  const title = String(req.body?.title ?? '').slice(0, MAX_TITLE);
  const maxOrder = (db.prepare(`SELECT COALESCE(MAX(sort_order),0) AS m FROM amazon_research_topics WHERE product_id = ?`).get(id) as { m: number }).m;
  const r = db.prepare(`INSERT INTO amazon_research_topics (product_id, sort_order, title) VALUES (?, ?, ?)`).run(id, maxOrder + 1, title);
  const topic = db.prepare(`SELECT * FROM amazon_research_topics WHERE id = ?`).get(r.lastInsertRowid) as TopicRow;
  res.status(201).json({ topic: { ...topic, cards: [] } });
});

router.patch('/products/:id/research/topics/:topicId', (req: Request, res: Response) => {
  const id = Number(req.params.id); const topicId = Number(req.params.topicId);
  if (![id, topicId].every(Number.isInteger) || !ensureProduct(id) || !loadTopic(id, topicId)) { res.status(404).json({ error: 'not found' }); return; }
  const sets: string[] = []; const vals: unknown[] = [];
  if (typeof req.body?.title === 'string') { sets.push('title = ?'); vals.push(req.body.title.slice(0, MAX_TITLE)); }
  if (req.body?.is_expanded === 0 || req.body?.is_expanded === 1) { sets.push('is_expanded = ?'); vals.push(req.body.is_expanded); }
  if (sets.length === 0) { res.status(400).json({ error: 'nichts zu aktualisieren' }); return; }
  sets.push('updated_at = unixepoch()');
  db.prepare(`UPDATE amazon_research_topics SET ${sets.join(', ')} WHERE id = ?`).run(...vals, topicId);
  res.json({ topic: db.prepare(`SELECT * FROM amazon_research_topics WHERE id = ?`).get(topicId) as TopicRow });
});

router.delete('/products/:id/research/topics/:topicId', (req: Request, res: Response) => {
  const id = Number(req.params.id); const topicId = Number(req.params.topicId);
  if (![id, topicId].every(Number.isInteger) || !ensureProduct(id) || !loadTopic(id, topicId)) { res.status(404).json({ error: 'not found' }); return; }
  const cards = db.prepare(`SELECT id FROM amazon_research_cards WHERE topic_id = ?`).all(topicId) as { id: number }[];
  const delTx = db.transaction(() => {
    for (const c of cards) {
      const imgs = db.prepare(`SELECT file_path FROM amazon_research_card_images WHERE card_id = ?`).all(c.id) as { file_path: string }[];
      imgs.forEach(im => deleteImageFromDisk(im.file_path));
      db.prepare(`DELETE FROM amazon_research_card_images WHERE card_id = ?`).run(c.id);
      db.prepare(`DELETE FROM amazon_research_card_links WHERE card_id = ?`).run(c.id);
    }
    db.prepare(`DELETE FROM amazon_research_cards WHERE topic_id = ?`).run(topicId);
    db.prepare(`DELETE FROM amazon_research_topics WHERE id = ?`).run(topicId);
  });
  delTx();
  res.status(204).end();
});

router.post('/products/:id/research/topics/reorder', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) { res.status(404).json({ error: 'not found' }); return; }
  const order = req.body?.order;
  if (!Array.isArray(order)) { res.status(400).json({ error: 'order fehlt' }); return; }
  const upd = db.prepare(`UPDATE amazon_research_topics SET sort_order = ? WHERE id = ? AND product_id = ?`);
  db.transaction(() => { order.forEach((tid: number, idx: number) => upd.run(idx + 1, tid, id)); })();
  res.status(204).end();
});

// ── Karten CRUD ──
router.post('/products/:id/research/topics/:topicId/cards', (req: Request, res: Response) => {
  const id = Number(req.params.id); const topicId = Number(req.params.topicId);
  if (![id, topicId].every(Number.isInteger) || !ensureProduct(id) || !loadTopic(id, topicId)) { res.status(404).json({ error: 'not found' }); return; }
  const maxOrder = (db.prepare(`SELECT COALESCE(MAX(sort_order),0) AS m FROM amazon_research_cards WHERE topic_id = ?`).get(topicId) as { m: number }).m;
  const r = db.prepare(`INSERT INTO amazon_research_cards (topic_id, sort_order, body) VALUES (?, ?, '')`).run(topicId, maxOrder + 1);
  const card = db.prepare(`SELECT * FROM amazon_research_cards WHERE id = ?`).get(r.lastInsertRowid) as CardRow;
  res.status(201).json({ card: { ...card, links: [], images: [] } });
});

router.patch('/products/:id/research/cards/:cardId', (req: Request, res: Response) => {
  const id = Number(req.params.id); const cardId = Number(req.params.cardId);
  if (![id, cardId].every(Number.isInteger) || !ensureProduct(id) || !loadCardForProduct(id, cardId)) { res.status(404).json({ error: 'not found' }); return; }
  const sets: string[] = []; const vals: unknown[] = [];
  if ('title' in (req.body ?? {})) { const t = req.body.title; sets.push('title = ?'); vals.push(t == null ? null : String(t).slice(0, MAX_TITLE)); }
  if (typeof req.body?.body === 'string') { sets.push('body = ?'); vals.push(req.body.body.slice(0, MAX_BODY)); }
  if (req.body?.is_global === 0 || req.body?.is_global === 1) { sets.push('is_global = ?'); vals.push(req.body.is_global); }
  if (sets.length === 0) { res.status(400).json({ error: 'nichts zu aktualisieren' }); return; }
  sets.push('updated_at = unixepoch()');
  db.prepare(`UPDATE amazon_research_cards SET ${sets.join(', ')} WHERE id = ?`).run(...vals, cardId);
  res.json({ card: db.prepare(`SELECT * FROM amazon_research_cards WHERE id = ?`).get(cardId) as CardRow });
});

router.delete('/products/:id/research/cards/:cardId', (req: Request, res: Response) => {
  const id = Number(req.params.id); const cardId = Number(req.params.cardId);
  if (![id, cardId].every(Number.isInteger) || !ensureProduct(id) || !loadCardForProduct(id, cardId)) { res.status(404).json({ error: 'not found' }); return; }
  const imgs = db.prepare(`SELECT file_path FROM amazon_research_card_images WHERE card_id = ?`).all(cardId) as { file_path: string }[];
  db.transaction(() => {
    imgs.forEach(im => deleteImageFromDisk(im.file_path));
    db.prepare(`DELETE FROM amazon_research_card_images WHERE card_id = ?`).run(cardId);
    db.prepare(`DELETE FROM amazon_research_card_links WHERE card_id = ?`).run(cardId);
    db.prepare(`DELETE FROM amazon_research_cards WHERE id = ?`).run(cardId);
  })();
  res.status(204).end();
});

router.post('/products/:id/research/topics/:topicId/cards/reorder', (req: Request, res: Response) => {
  const id = Number(req.params.id); const topicId = Number(req.params.topicId);
  if (![id, topicId].every(Number.isInteger) || !ensureProduct(id) || !loadTopic(id, topicId)) { res.status(404).json({ error: 'not found' }); return; }
  const order = req.body?.order;
  if (!Array.isArray(order)) { res.status(400).json({ error: 'order fehlt' }); return; }
  const upd = db.prepare(`UPDATE amazon_research_cards SET sort_order = ? WHERE id = ? AND topic_id = ?`);
  db.transaction(() => { order.forEach((cid: number, idx: number) => upd.run(idx + 1, cid, topicId)); })();
  res.status(204).end();
});

// ── Links ──
router.post('/products/:id/research/cards/:cardId/links', (req: Request, res: Response) => {
  const id = Number(req.params.id); const cardId = Number(req.params.cardId);
  if (![id, cardId].every(Number.isInteger) || !ensureProduct(id) || !loadCardForProduct(id, cardId)) { res.status(404).json({ error: 'not found' }); return; }
  const url = String(req.body?.url ?? '').slice(0, MAX_URL);
  if (!url) { res.status(400).json({ error: 'url fehlt' }); return; }
  const label = req.body?.label == null ? null : String(req.body.label).slice(0, MAX_LABEL);
  const maxOrder = (db.prepare(`SELECT COALESCE(MAX(sort_order),0) AS m FROM amazon_research_card_links WHERE card_id = ?`).get(cardId) as { m: number }).m;
  const r = db.prepare(`INSERT INTO amazon_research_card_links (card_id, sort_order, url, label) VALUES (?, ?, ?, ?)`).run(cardId, maxOrder + 1, url, label);
  res.status(201).json({ link: db.prepare(`SELECT * FROM amazon_research_card_links WHERE id = ?`).get(r.lastInsertRowid) as LinkRow });
});

router.delete('/products/:id/research/links/:linkId', (req: Request, res: Response) => {
  const id = Number(req.params.id); const linkId = Number(req.params.linkId);
  if (![id, linkId].every(Number.isInteger) || !ensureProduct(id)) { res.status(404).json({ error: 'not found' }); return; }
  const link = db.prepare(`
    SELECT lk.* FROM amazon_research_card_links lk
    JOIN amazon_research_cards c ON c.id = lk.card_id
    JOIN amazon_research_topics t ON t.id = c.topic_id
    WHERE lk.id = ? AND t.product_id = ?`).get(linkId, id) as LinkRow | undefined;
  if (!link) { res.status(404).json({ error: 'not found' }); return; }
  db.prepare(`DELETE FROM amazon_research_card_links WHERE id = ?`).run(linkId);
  res.status(204).end();
});

// ── Karten-Bilder ──
router.post('/products/:id/research/cards/:cardId/images', (req: Request, res: Response) => {
  const id = Number(req.params.id); const cardId = Number(req.params.cardId);
  if (![id, cardId].every(Number.isInteger) || !ensureProduct(id) || !loadCardForProduct(id, cardId)) { res.status(404).json({ error: 'not found' }); return; }
  researchImageUpload.single('file')(req, res, (err: unknown) => {
    if (err) { res.status(400).json({ error: err instanceof Error ? err.message : 'upload failed' }); return; }
    const file = (req as Request & { file?: { filename: string; originalname: string; mimetype: string } }).file;
    if (!file) { res.status(400).json({ error: 'no file' }); return; }
    const maxOrder = (db.prepare(`SELECT COALESCE(MAX(sort_order),0) AS m FROM amazon_research_card_images WHERE card_id = ?`).get(cardId) as { m: number }).m;
    const r = db.prepare(`INSERT INTO amazon_research_card_images (card_id, sort_order, file_path, original_name, mime) VALUES (?, ?, ?, ?, ?)`)
      .run(cardId, maxOrder + 1, file.filename, Buffer.from(file.originalname, 'latin1').toString('utf8').slice(0, 300), file.mimetype.slice(0, 200));
    res.status(201).json({ image: db.prepare(`SELECT * FROM amazon_research_card_images WHERE id = ?`).get(r.lastInsertRowid) as ImageRow });
  });
});

router.get('/products/:id/research/images/:imageId', (req: Request, res: Response) => {
  const id = Number(req.params.id); const imageId = Number(req.params.imageId);
  if (![id, imageId].every(Number.isInteger) || !ensureProduct(id)) { res.status(404).end(); return; }
  const im = loadImageForProduct(id, imageId);
  if (!im) { res.status(404).end(); return; }
  const abs = path.resolve(RESEARCH_FILES_DIR, im.file_path);
  if (!abs.startsWith(path.resolve(RESEARCH_FILES_DIR) + path.sep) || !fs.existsSync(abs)) { res.status(404).end(); return; }
  res.setHeader('Content-Type', im.mime || 'application/octet-stream');
  const ascii = (im.original_name ?? 'bild').replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
  res.setHeader('Content-Disposition', `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(im.original_name ?? 'bild')}`);
  fs.createReadStream(abs).pipe(res);
});

router.delete('/products/:id/research/images/:imageId', (req: Request, res: Response) => {
  const id = Number(req.params.id); const imageId = Number(req.params.imageId);
  if (![id, imageId].every(Number.isInteger) || !ensureProduct(id)) { res.status(404).json({ error: 'not found' }); return; }
  const im = loadImageForProduct(id, imageId);
  if (!im) { res.status(404).json({ error: 'not found' }); return; }
  db.prepare(`DELETE FROM amazon_research_card_images WHERE id = ?`).run(imageId);
  deleteImageFromDisk(im.file_path);
  res.status(204).end();
});

router.post('/products/:id/research/cards/:cardId/images/reorder', (req: Request, res: Response) => {
  const id = Number(req.params.id); const cardId = Number(req.params.cardId);
  if (![id, cardId].every(Number.isInteger) || !ensureProduct(id) || !loadCardForProduct(id, cardId)) { res.status(404).json({ error: 'not found' }); return; }
  const order = req.body?.order;
  if (!Array.isArray(order)) { res.status(400).json({ error: 'order fehlt' }); return; }
  const upd = db.prepare(`UPDATE amazon_research_card_images SET sort_order = ? WHERE id = ? AND card_id = ?`);
  db.transaction(() => { order.forEach((iid: number, idx: number) => upd.run(idx + 1, iid, cardId)); })();
  res.status(204).end();
});

// ── GET: alle global markierten Karten produktuebergreifend ──
// Ergibt /api/amazon/research/global (Router unter /api/amazon gemountet).
// Rein lesend — kein Backup noetig.
interface GlobalCardRow extends CardRow { product_id: number; product_name: string; topic_title: string; }
router.get('/research/global', (_req: Request, res: Response) => {
  const cards = db.prepare(`
    SELECT c.*, p.id AS product_id, p.name AS product_name, t.title AS topic_title
    FROM amazon_research_cards c
    JOIN amazon_research_topics t ON t.id = c.topic_id
    JOIN amazon_products p ON p.id = t.product_id
    WHERE c.is_global = 1
    ORDER BY p.name COLLATE NOCASE, t.sort_order, t.id, c.sort_order, c.id`).all() as GlobalCardRow[];
  const linksStmt = db.prepare(`SELECT * FROM amazon_research_card_links WHERE card_id = ? ORDER BY sort_order, id`);
  const imagesStmt = db.prepare(`SELECT * FROM amazon_research_card_images WHERE card_id = ? ORDER BY sort_order, id`);
  const out = cards.map(c => ({
    ...c,
    links: linksStmt.all(c.id) as LinkRow[],
    images: imagesStmt.all(c.id) as ImageRow[],
  }));
  res.json({ cards: out });
});

export default router;
