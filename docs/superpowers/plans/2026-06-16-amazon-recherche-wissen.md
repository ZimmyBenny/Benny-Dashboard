# Amazon „Recherche & Wissen" — Implementierungs-Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein einklappbarer Bereich „Recherche & Wissen" pro Amazon-Produkt, in dem Benny frei anlegbare Themen-Blöcke führt; jedes Thema enthält Kombi-Karten (Titel optional, Text/Bullets, mehrere Links mit Label, mehrere Screenshots).

**Architecture:** Spiegelt die bestehenden Amazon-Module. Backend: 4 SQLite-Tabellen + ein Express-Router (`amazon.research.routes.ts`) gemountet unter `/api/amazon`, Bild-Upload via multer wie bei USP/Hersteller. Frontend: neuer Ordner `components/amazon/research/` (Section → TopicBlock → Card → Links/Images), TanStack-Query-Hooks mit optimistic Updates, als neue Section in `useDetailSectionOrder` + `AmazonProductDetailPage` verdrahtet.

**Tech Stack:** Express 5, better-sqlite3, multer, React 19, TanStack Query, native Pointer-Events Drag-and-drop (Projekt-Konvention).

**Branch:** `feature/amazon-recherche-wissen` (bereits aktiv). Migration-Nummer: **084** (letzte ist 083).

---

## Dateien-Übersicht

**Backend (neu):**
- `backend/src/db/migrations/084_amazon_research.sql` — 4 Tabellen
- `backend/src/routes/amazon.research.routes.ts` — Topics/Cards/Links/Images-Routen
- `backend/test/integration.amazon_research.test.ts` — Integrationstests

**Backend (geändert):**
- `backend/src/app.ts` — Router importieren + mounten

**Frontend (neu):**
- `frontend/src/components/amazon/research/ResearchSection.tsx`
- `frontend/src/components/amazon/research/ResearchTopicBlock.tsx`
- `frontend/src/components/amazon/research/ResearchCard.tsx`
- `frontend/src/components/amazon/research/ResearchCardLinks.tsx`
- `frontend/src/components/amazon/research/ResearchCardImages.tsx`
- `frontend/src/hooks/amazon/useResearch.ts`

**Frontend (geändert):**
- `frontend/src/api/amazon.api.ts` — Typen + API-Funktionen
- `frontend/src/hooks/amazon/useDetailSectionOrder.ts` — `'research'` ergänzen
- `frontend/src/pages/amazon/AmazonProductDetailPage.tsx` — `<ResearchSection>` einbinden

---

## Task 1: Migration 084 — Tabellen

**Files:**
- Create: `backend/src/db/migrations/084_amazon_research.sql`

- [ ] **Step 1: Migration schreiben**

```sql
-- Recherche & Wissen: Themen-Blöcke pro Produkt mit Kombi-Karten
CREATE TABLE amazon_research_topics (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL REFERENCES amazon_products(id),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  title       TEXT    NOT NULL DEFAULT '',
  is_expanded INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE amazon_research_cards (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id    INTEGER NOT NULL REFERENCES amazon_research_topics(id),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  title       TEXT,
  body        TEXT    NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE amazon_research_card_links (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id     INTEGER NOT NULL REFERENCES amazon_research_cards(id),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  url         TEXT    NOT NULL,
  label       TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE amazon_research_card_images (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id       INTEGER NOT NULL REFERENCES amazon_research_cards(id),
  sort_order    INTEGER NOT NULL DEFAULT 0,
  file_path     TEXT    NOT NULL,
  original_name TEXT,
  mime          TEXT,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_research_topics_product ON amazon_research_topics(product_id);
CREATE INDEX idx_research_cards_topic ON amazon_research_cards(topic_id);
CREATE INDEX idx_research_card_links_card ON amazon_research_card_links(card_id);
CREATE INDEX idx_research_card_images_card ON amazon_research_card_images(card_id);
```

Hinweis: KEIN `PRAGMA foreign_keys` setzen (wird zentral in `migrate.ts` gesteuert). Backup vor Migrationen läuft automatisch.

- [ ] **Step 2: Migration anwenden + verifizieren**

Run: `npm --prefix backend run dev` kurz starten (migrate läuft beim Boot), dann:
`sqlite3 ~/.local/share/benny-dashboard/dashboard.db "SELECT name FROM sqlite_master WHERE name LIKE 'amazon_research%' ORDER BY name;"`
Expected: 4 Tabellen + Indizes gelistet (`amazon_research_card_images`, `amazon_research_card_links`, `amazon_research_cards`, `amazon_research_topics`).

- [ ] **Step 3: Commit**

```bash
git add backend/src/db/migrations/084_amazon_research.sql
git commit -m "feat(amazon-research): Migration 084 — Themen/Karten/Links/Bilder"
```

---

## Task 2: Backend-Router — Topics, Cards, Links

**Files:**
- Create: `backend/src/routes/amazon.research.routes.ts`
- Test: `backend/test/integration.amazon_research.test.ts`

Muster gespiegelt von `amazon.manufacturers.routes.ts` (Owner-Check via `ensureProduct`, prepared statements, `db.transaction` für reorder).

- [ ] **Step 1: Failing-Test schreiben** (`integration.amazon_research.test.ts`)

Orientiere dich an `backend/test/integration.amazon_usp.test.ts` (Setup/Teardown, supertest-Client, Auth-Token). Test deckt den Topic+Card+Link-Happy-Path ab:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { makeAuthToken, seedProduct } from './helpers'; // vorhandene Helper analog usp-Test verwenden

describe('amazon research', () => {
  let token: string; let productId: number;
  beforeAll(() => { token = makeAuthToken(); productId = seedProduct(); });

  it('legt Thema, Karte und Link an und liest sie verschachtelt', async () => {
    const auth = { Authorization: `Bearer ${token}` };

    const t = await request(app).post(`/api/amazon/products/${productId}/research/topics`)
      .set(auth).send({ title: 'Patente' });
    expect(t.status).toBe(201);
    const topicId = t.body.topic.id;

    const c = await request(app).post(`/api/amazon/products/${productId}/research/topics/${topicId}/cards`)
      .set(auth).send({});
    expect(c.status).toBe(201);
    const cardId = c.body.card.id;

    await request(app).patch(`/api/amazon/products/${productId}/research/cards/${cardId}`)
      .set(auth).send({ title: 'Konkurrent X', body: 'Designschutz seit 2022' }).expect(200);

    const l = await request(app).post(`/api/amazon/products/${productId}/research/cards/${cardId}/links`)
      .set(auth).send({ url: 'https://dpma.de/12345', label: 'DPMA' });
    expect(l.status).toBe(201);

    const list = await request(app).get(`/api/amazon/products/${productId}/research/topics`).set(auth);
    expect(list.status).toBe(200);
    expect(list.body.topics[0].title).toBe('Patente');
    expect(list.body.topics[0].cards[0].title).toBe('Konkurrent X');
    expect(list.body.topics[0].cards[0].links[0].label).toBe('DPMA');
  });
});
```

- [ ] **Step 2: Test laufen lassen (rot)**

Run: `npm --prefix backend test -- integration.amazon_research`
Expected: FAIL (Route 404 — Router existiert noch nicht).

- [ ] **Step 3: Router implementieren** (`amazon.research.routes.ts`)

```ts
import { Router, type Request, type Response } from 'express';
import { db } from '../db';
import { requireAuth } from '../middleware/auth'; // wie in den anderen amazon.*.routes.ts

const router = Router();
router.use(requireAuth); // Auth wie bei den übrigen Amazon-Routen

const MAX_TITLE = 200;
const MAX_BODY = 5000;
const MAX_URL = 1000;
const MAX_LABEL = 200;

interface TopicRow { id: number; product_id: number; sort_order: number; title: string; is_expanded: number; }
interface CardRow { id: number; topic_id: number; sort_order: number; title: string | null; body: string; }
interface LinkRow { id: number; card_id: number; sort_order: number; url: string; label: string | null; }
interface ImageRow { id: number; card_id: number; sort_order: number; file_path: string; original_name: string | null; mime: string | null; }

function ensureProduct(id: number): boolean {
  return db.prepare(`SELECT 1 FROM amazon_products WHERE id = ?`).get(id) !== undefined;
}
function loadTopic(productId: number, topicId: number): TopicRow | undefined {
  return db.prepare(`SELECT * FROM amazon_research_topics WHERE id = ? AND product_id = ?`).get(topicId, productId) as TopicRow | undefined;
}
function loadCard(topicId: number, cardId: number): CardRow | undefined {
  return db.prepare(`SELECT * FROM amazon_research_cards WHERE id = ? AND topic_id = ?`).get(cardId, topicId) as CardRow | undefined;
}
// Karte über Produkt auflösen (für Card-Routen ohne topicId im Pfad)
function loadCardForProduct(productId: number, cardId: number): CardRow | undefined {
  return db.prepare(`
    SELECT c.* FROM amazon_research_cards c
    JOIN amazon_research_topics t ON t.id = c.topic_id
    WHERE c.id = ? AND t.product_id = ?`).get(cardId, productId) as CardRow | undefined;
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
  // zugehörige Karten/Links/Bilder mit aufräumen (inkl. Bilddateien — siehe Task 3 deleteImageFromDisk)
  const cards = db.prepare(`SELECT id FROM amazon_research_cards WHERE topic_id = ?`).all(topicId) as { id: number }[];
  const delTx = db.transaction(() => {
    for (const c of cards) {
      const imgs = db.prepare(`SELECT file_path FROM amazon_research_card_images WHERE card_id = ?`).all(c.id) as { file_path: string }[];
      imgs.forEach(im => deleteImageFromDisk(im.file_path)); // aus Task 3 importiert/geteilt
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

// ── Links CRUD ──
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

export default router;
```

Hinweis: `deleteImageFromDisk` und die Bild-Routen kommen in Task 3 in dieselbe Datei (oben deklariert, vor den Routen). Beim Implementieren Task 3 zuerst die multer/disk-Helfer oben in die Datei setzen, dann referenzieren die Delete-Transaktionen sie korrekt.

- [ ] **Step 4: Router in app.ts registrieren** (siehe Task 4 — kann jetzt schon erfolgen, damit der Test grün wird)

- [ ] **Step 5: Test laufen lassen (grün)**

Run: `npm --prefix backend test -- integration.amazon_research`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/amazon.research.routes.ts backend/test/integration.amazon_research.test.ts
git commit -m "feat(amazon-research): Backend-Routen Themen/Karten/Links + Tests"
```

---

## Task 3: Backend — Karten-Bilder (Upload/Anzeige/Löschen/Reorder)

**Files:**
- Modify: `backend/src/routes/amazon.research.routes.ts`

Muster 1:1 von `amazon.manufacturers.routes.ts` (multer-Setup, Pfad-Traversal-Schutz, UTF-8-Dateiname).

- [ ] **Step 1: multer-Setup + disk-Helfer oben in der Datei ergänzen**

```ts
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import crypto from 'node:crypto';
import multer from 'multer';

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
function loadImageForProduct(productId: number, imageId: number): ImageRow | undefined {
  return db.prepare(`
    SELECT im.* FROM amazon_research_card_images im
    JOIN amazon_research_cards c ON c.id = im.card_id
    JOIN amazon_research_topics t ON t.id = c.topic_id
    WHERE im.id = ? AND t.product_id = ?`).get(imageId, productId) as ImageRow | undefined;
}
```

- [ ] **Step 2: Bild-Routen ergänzen**

```ts
// POST Upload
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

// GET Blob/Preview
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

// DELETE
router.delete('/products/:id/research/images/:imageId', (req: Request, res: Response) => {
  const id = Number(req.params.id); const imageId = Number(req.params.imageId);
  if (![id, imageId].every(Number.isInteger) || !ensureProduct(id)) { res.status(404).json({ error: 'not found' }); return; }
  const im = loadImageForProduct(id, imageId);
  if (!im) { res.status(404).json({ error: 'not found' }); return; }
  db.prepare(`DELETE FROM amazon_research_card_images WHERE id = ?`).run(imageId);
  deleteImageFromDisk(im.file_path);
  res.status(204).end();
});

// Reorder
router.post('/products/:id/research/cards/:cardId/images/reorder', (req: Request, res: Response) => {
  const id = Number(req.params.id); const cardId = Number(req.params.cardId);
  if (![id, cardId].every(Number.isInteger) || !ensureProduct(id) || !loadCardForProduct(id, cardId)) { res.status(404).json({ error: 'not found' }); return; }
  const order = req.body?.order;
  if (!Array.isArray(order)) { res.status(400).json({ error: 'order fehlt' }); return; }
  const upd = db.prepare(`UPDATE amazon_research_card_images SET sort_order = ? WHERE id = ? AND card_id = ?`);
  db.transaction(() => { order.forEach((iid: number, idx: number) => upd.run(idx + 1, iid, cardId)); })();
  res.status(204).end();
});
```

- [ ] **Step 3: Test ergänzen** (Bild-Upload mit `.attach`)

```ts
it('lädt ein Bild zu einer Karte hoch und liefert es aus', async () => {
  const auth = { Authorization: `Bearer ${token}` };
  const t = await request(app).post(`/api/amazon/products/${productId}/research/topics`).set(auth).send({ title: 'Zertifikate' });
  const topicId = t.body.topic.id;
  const c = await request(app).post(`/api/amazon/products/${productId}/research/topics/${topicId}/cards`).set(auth).send({});
  const cardId = c.body.card.id;
  const up = await request(app).post(`/api/amazon/products/${productId}/research/cards/${cardId}/images`)
    .set(auth).attach('file', Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'test.png');
  expect(up.status).toBe(201);
  const get = await request(app).get(`/api/amazon/products/${productId}/research/images/${up.body.image.id}`).set(auth);
  expect(get.status).toBe(200);
});
```

- [ ] **Step 4: Test laufen lassen (grün)**

Run: `npm --prefix backend test -- integration.amazon_research`
Expected: PASS (beide Tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/amazon.research.routes.ts backend/test/integration.amazon_research.test.ts
git commit -m "feat(amazon-research): Karten-Bilder Upload/Anzeige/Löschen/Reorder"
```

---

## Task 4: Router in app.ts registrieren

**Files:**
- Modify: `backend/src/app.ts` (Import bei den anderen amazon-Imports ~Zeile 28, Mount bei den anderen ~Zeile 78)

- [ ] **Step 1: Import + Mount ergänzen**

Import (nach `import amazonManufacturersRoutes ...`):
```ts
import amazonResearchRoutes from './routes/amazon.research.routes';
```
Mount (nach `app.use('/api/amazon', amazonManufacturersRoutes);`):
```ts
  app.use('/api/amazon', amazonResearchRoutes);
```

- [ ] **Step 2: Typecheck**

Run: `npm --prefix backend run typecheck`
Expected: Exit 0.

- [ ] **Step 3: Commit**

```bash
git add backend/src/app.ts
git commit -m "feat(amazon-research): Router in app.ts mounten"
```

---

## Task 5: Frontend-API — Typen + Funktionen

**Files:**
- Modify: `frontend/src/api/amazon.api.ts` (am Ende ergänzen, Muster wie `updateSample`/`uploadUspPointImage`)

- [ ] **Step 1: Typen + Funktionen ergänzen**

```ts
// ── Recherche & Wissen ──
export interface ResearchLink { id: number; card_id: number; sort_order: number; url: string; label: string | null; }
export interface ResearchImage { id: number; card_id: number; sort_order: number; file_path: string; original_name: string | null; mime: string | null; }
export interface ResearchCard { id: number; topic_id: number; sort_order: number; title: string | null; body: string; links: ResearchLink[]; images: ResearchImage[]; }
export interface ResearchTopic { id: number; product_id: number; sort_order: number; title: string; is_expanded: number; cards: ResearchCard[]; }

export async function fetchResearchTopics(productId: number): Promise<ResearchTopic[]> {
  const r = await apiClient.get<{ topics: ResearchTopic[] }>(`/amazon/products/${productId}/research/topics`);
  return r.data.topics;
}
export async function createResearchTopic(productId: number, title: string): Promise<ResearchTopic> {
  const r = await apiClient.post<{ topic: ResearchTopic }>(`/amazon/products/${productId}/research/topics`, { title });
  return r.data.topic;
}
export async function updateResearchTopic(productId: number, topicId: number, patch: Partial<{ title: string; is_expanded: 0 | 1 }>): Promise<ResearchTopic> {
  const r = await apiClient.patch<{ topic: ResearchTopic }>(`/amazon/products/${productId}/research/topics/${topicId}`, patch);
  return r.data.topic;
}
export async function deleteResearchTopic(productId: number, topicId: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${productId}/research/topics/${topicId}`);
}
export async function reorderResearchTopics(productId: number, order: number[]): Promise<void> {
  await apiClient.post(`/amazon/products/${productId}/research/topics/reorder`, { order });
}

export async function createResearchCard(productId: number, topicId: number): Promise<ResearchCard> {
  const r = await apiClient.post<{ card: ResearchCard }>(`/amazon/products/${productId}/research/topics/${topicId}/cards`, {});
  return r.data.card;
}
export async function updateResearchCard(productId: number, cardId: number, patch: Partial<{ title: string | null; body: string }>): Promise<ResearchCard> {
  const r = await apiClient.patch<{ card: ResearchCard }>(`/amazon/products/${productId}/research/cards/${cardId}`, patch);
  return r.data.card;
}
export async function deleteResearchCard(productId: number, cardId: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${productId}/research/cards/${cardId}`);
}
export async function reorderResearchCards(productId: number, topicId: number, order: number[]): Promise<void> {
  await apiClient.post(`/amazon/products/${productId}/research/topics/${topicId}/cards/reorder`, { order });
}

export async function createResearchLink(productId: number, cardId: number, url: string, label: string | null): Promise<ResearchLink> {
  const r = await apiClient.post<{ link: ResearchLink }>(`/amazon/products/${productId}/research/cards/${cardId}/links`, { url, label });
  return r.data.link;
}
export async function deleteResearchLink(productId: number, linkId: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${productId}/research/links/${linkId}`);
}

export async function uploadResearchImage(productId: number, cardId: number, file: File): Promise<ResearchImage> {
  const fd = new FormData(); fd.append('file', file);
  return ((await apiClient.post(`/amazon/products/${productId}/research/cards/${cardId}/images`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })).data as { image: ResearchImage }).image;
}
export async function deleteResearchImage(productId: number, imageId: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${productId}/research/images/${imageId}`);
}
export async function getResearchImageObjectUrl(productId: number, imageId: number): Promise<string> {
  const r = await apiClient.get(`/amazon/products/${productId}/research/images/${imageId}`, { responseType: 'blob' });
  return URL.createObjectURL(r.data as Blob);
}
```

- [ ] **Step 2: Typecheck**

Run: `npm --prefix frontend run typecheck`
Expected: Exit 0.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/amazon.api.ts
git commit -m "feat(amazon-research): Frontend-API + Typen"
```

---

## Task 6: Query-Hooks

**Files:**
- Create: `frontend/src/hooks/amazon/useResearch.ts`

Muster: ein Query (`useResearchTopics`) als Single-Source; Mutationen invalidieren diesen Key (einfacher als optimistic; UI ist verschachtelt). Orientierung: `useSourcing`/`useUpdateSourcing`.

- [ ] **Step 1: Hooks schreiben**

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchResearchTopics, createResearchTopic, updateResearchTopic, deleteResearchTopic, reorderResearchTopics,
  createResearchCard, updateResearchCard, deleteResearchCard, reorderResearchCards,
  createResearchLink, deleteResearchLink, uploadResearchImage, deleteResearchImage,
} from '../../api/amazon.api';

export const researchKey = (productId: number) => ['amazon', 'products', productId, 'research'] as const;

export function useResearchTopics(productId: number) {
  return useQuery({
    queryKey: researchKey(productId),
    queryFn: () => fetchResearchTopics(productId),
    enabled: Number.isInteger(productId) && productId > 0,
  });
}

function useInvalidate(productId: number) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: researchKey(productId) });
}

export function useCreateTopic(productId: number) {
  const inv = useInvalidate(productId);
  return useMutation({ mutationFn: (title: string) => createResearchTopic(productId, title), onSettled: inv });
}
export function useUpdateTopic(productId: number) {
  const inv = useInvalidate(productId);
  return useMutation({ mutationFn: (v: { topicId: number; patch: Partial<{ title: string; is_expanded: 0 | 1 }> }) => updateResearchTopic(productId, v.topicId, v.patch), onSettled: inv });
}
export function useDeleteTopic(productId: number) {
  const inv = useInvalidate(productId);
  return useMutation({ mutationFn: (topicId: number) => deleteResearchTopic(productId, topicId), onSettled: inv });
}
export function useReorderTopics(productId: number) {
  const inv = useInvalidate(productId);
  return useMutation({ mutationFn: (order: number[]) => reorderResearchTopics(productId, order), onSettled: inv });
}

export function useCreateCard(productId: number) {
  const inv = useInvalidate(productId);
  return useMutation({ mutationFn: (topicId: number) => createResearchCard(productId, topicId), onSettled: inv });
}
export function useUpdateCard(productId: number) {
  const inv = useInvalidate(productId);
  return useMutation({ mutationFn: (v: { cardId: number; patch: Partial<{ title: string | null; body: string }> }) => updateResearchCard(productId, v.cardId, v.patch), onSettled: inv });
}
export function useDeleteCard(productId: number) {
  const inv = useInvalidate(productId);
  return useMutation({ mutationFn: (cardId: number) => deleteResearchCard(productId, cardId), onSettled: inv });
}
export function useReorderCards(productId: number) {
  const inv = useInvalidate(productId);
  return useMutation({ mutationFn: (v: { topicId: number; order: number[] }) => reorderResearchCards(productId, v.topicId, v.order), onSettled: inv });
}

export function useCreateLink(productId: number) {
  const inv = useInvalidate(productId);
  return useMutation({ mutationFn: (v: { cardId: number; url: string; label: string | null }) => createResearchLink(productId, v.cardId, v.url, v.label), onSettled: inv });
}
export function useDeleteLink(productId: number) {
  const inv = useInvalidate(productId);
  return useMutation({ mutationFn: (linkId: number) => deleteResearchLink(productId, linkId), onSettled: inv });
}
export function useUploadImage(productId: number) {
  const inv = useInvalidate(productId);
  return useMutation({ mutationFn: (v: { cardId: number; file: File }) => uploadResearchImage(productId, v.cardId, v.file), onSettled: inv });
}
export function useDeleteImage(productId: number) {
  const inv = useInvalidate(productId);
  return useMutation({ mutationFn: (imageId: number) => deleteResearchImage(productId, imageId), onSettled: inv });
}
```

- [ ] **Step 2: Typecheck + Commit**

Run: `npm --prefix frontend run typecheck` → Exit 0.
```bash
git add frontend/src/hooks/amazon/useResearch.ts
git commit -m "feat(amazon-research): Query-Hooks"
```

---

## Task 7: ResearchCardImages-Komponente

**Files:**
- Create: `frontend/src/components/amazon/research/ResearchCardImages.tsx`

Muster: `UspPointImages.tsx` (Thumb mit ObjectUrl-Cleanup). Zusätzlich Upload-Zone mit Klick/Drag-and-drop/Paste.

- [ ] **Step 1: Komponente schreiben**

```tsx
import { useEffect, useRef, useState } from 'react';
import { getResearchImageObjectUrl, type ResearchImage } from '../../../api/amazon.api';
import { useUploadImage, useDeleteImage } from '../../../hooks/amazon/useResearch';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

function Thumb({ productId, image, onDelete }: { productId: number; image: ResearchImage; onDelete: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let revoked = false; let url: string | null = null;
    getResearchImageObjectUrl(productId, image.id).then(u => { if (revoked) { URL.revokeObjectURL(u); return; } url = u; setSrc(u); }).catch(() => setSrc(null));
    return () => { revoked = true; if (url) URL.revokeObjectURL(url); };
  }, [productId, image.id]);
  return (
    <div className="relative group" style={{ width: 88, height: 88 }}>
      {src
        ? <a href={src} target="_blank" rel="noopener noreferrer"><img src={src} alt="" className="w-full h-full object-cover rounded-md" /></a>
        : <div className="w-full h-full rounded-md" style={{ background: 'var(--color-surface-container-low)' }} />}
      <button type="button" onClick={onDelete}
        className="absolute top-1 right-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity px-1"
        style={{ background: 'rgba(0,0,0,0.6)', color: '#fca5a5' }} aria-label="Bild entfernen">
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
      </button>
    </div>
  );
}

export function ResearchCardImages({ productId, cardId, images }: { productId: number; cardId: number; images: ResearchImage[] }) {
  const upload = useUploadImage(productId);
  const del = useDeleteImage(productId);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [err, setErr] = useState<string | null>(null);

  function pick(f: File | undefined | null) {
    if (!f) return;
    if (!ALLOWED.includes(f.type)) { setErr('Nur JPG, PNG oder WEBP.'); return; }
    if (f.size > MAX_BYTES) { setErr('Bild größer als 5 MB.'); return; }
    setErr(null);
    upload.mutate({ cardId, file: f });
  }

  return (
    <div className="mt-2">
      <div className="flex flex-wrap gap-2 items-center">
        {images.map(img => <Thumb key={img.id} productId={productId} image={img} onDelete={() => del.mutate(img.id)} />)}
        <button type="button" onClick={() => fileInput.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files?.[0]); }}
          onPaste={(e) => { for (const it of e.clipboardData.items) if (it.kind === 'file') { pick(it.getAsFile()); break; } }}
          className="flex items-center justify-center rounded-md"
          style={{ width: 88, height: 88, border: '1px dashed rgba(255,255,255,0.2)', color: 'var(--color-on-surface-variant)' }}
          aria-label="Screenshot hinzufügen" title="Klick, Drag&Drop oder Cmd+V">
          <span className="material-symbols-outlined">add_photo_alternate</span>
        </button>
      </div>
      <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
        onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
      {err && <p className="text-xs mt-1" style={{ color: '#fca5a5' }}>{err}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + Commit**

```bash
git add frontend/src/components/amazon/research/ResearchCardImages.tsx
git commit -m "feat(amazon-research): Karten-Bilder-Komponente (Upload/Paste/Thumbs)"
```

---

## Task 8: ResearchCardLinks-Komponente

**Files:**
- Create: `frontend/src/components/amazon/research/ResearchCardLinks.tsx`

- [ ] **Step 1: Komponente schreiben**

```tsx
import { useState } from 'react';
import { type ResearchLink } from '../../../api/amazon.api';
import { useCreateLink, useDeleteLink } from '../../../hooks/amazon/useResearch';

const INPUT_STYLE: React.CSSProperties = {
  background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)',
};

export function ResearchCardLinks({ productId, cardId, links }: { productId: number; cardId: number; links: ResearchLink[] }) {
  const create = useCreateLink(productId);
  const del = useDeleteLink(productId);
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');

  function add() {
    const u = url.trim();
    if (!u) return;
    create.mutate({ cardId, url: u, label: label.trim() || null }, { onSuccess: () => { setUrl(''); setLabel(''); } });
  }

  return (
    <div className="mt-2 flex flex-col gap-1.5">
      {links.map(l => (
        <div key={l.id} className="flex items-center gap-2 text-sm group">
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--color-on-surface-variant)' }}>link</span>
          <a href={l.url} target="_blank" rel="noopener noreferrer" className="truncate"
            style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}>
            {l.label || l.url}
          </a>
          <button type="button" onClick={() => del.mutate(l.id)} aria-label="Link entfernen"
            className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: '#fca5a5' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
          </button>
        </div>
      ))}
      <div className="flex items-center gap-2">
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…"
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
          className="flex-1 px-2 py-1 rounded text-sm" style={INPUT_STYLE} autoComplete="off" />
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Beschriftung (optional)"
          onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
          className="px-2 py-1 rounded text-sm" style={{ ...INPUT_STYLE, width: 180 }} autoComplete="off" />
        <button type="button" onClick={add} className="px-2 py-1 rounded text-sm"
          style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}>
          + Link
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + Commit**

```bash
git add frontend/src/components/amazon/research/ResearchCardLinks.tsx
git commit -m "feat(amazon-research): Karten-Links-Komponente"
```

---

## Task 9: ResearchCard-Komponente

**Files:**
- Create: `frontend/src/components/amazon/research/ResearchCard.tsx`

Autosave on blur (Muster `ChecklistItemRow`). Titel optional, Body als Textarea.

- [ ] **Step 1: Komponente schreiben**

```tsx
import { useEffect, useState } from 'react';
import { type ResearchCard as Card } from '../../../api/amazon.api';
import { useUpdateCard, useDeleteCard } from '../../../hooks/amazon/useResearch';
import { ResearchCardLinks } from './ResearchCardLinks';
import { ResearchCardImages } from './ResearchCardImages';

const INPUT_STYLE: React.CSSProperties = {
  background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)',
};

export function ResearchCard({ productId, card, dragHandleProps }: {
  productId: number; card: Card; dragHandleProps?: React.HTMLAttributes<HTMLDivElement>;
}) {
  const update = useUpdateCard(productId);
  const del = useDeleteCard(productId);
  const [title, setTitle] = useState(card.title ?? '');
  const [body, setBody] = useState(card.body);
  useEffect(() => { setTitle(card.title ?? ''); }, [card.title]);
  useEffect(() => { setBody(card.body); }, [card.body]);

  function saveTitle() {
    const t = title.trim();
    if (t === (card.title ?? '')) return;
    update.mutate({ cardId: card.id, patch: { title: t.length ? t : null } });
  }
  function saveBody() {
    if (body === card.body) return;
    update.mutate({ cardId: card.id, patch: { body } });
  }

  return (
    <div className="rounded-lg p-3" style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-start gap-2">
        <div {...dragHandleProps} className="cursor-grab pt-1" title="Karte verschieben" style={{ color: 'var(--color-on-surface-variant)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>drag_indicator</span>
        </div>
        <div className="flex-1 min-w-0">
          <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle}
            placeholder="Titel (optional)" autoComplete="off"
            className="w-full px-2 py-1 rounded text-sm font-semibold mb-1.5" style={INPUT_STYLE} />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} onBlur={saveBody}
            placeholder={'Notiz, Bulletpoints, Keywords …\n• …'} rows={3}
            className="w-full px-2 py-1 rounded text-sm resize-y" style={INPUT_STYLE} />
          <ResearchCardLinks productId={productId} cardId={card.id} links={card.links} />
          <ResearchCardImages productId={productId} cardId={card.id} images={card.images} />
        </div>
        <button type="button" onClick={() => { if (confirm('Diese Karte wirklich löschen?')) del.mutate(card.id); }}
          aria-label="Karte löschen" className="p-1 rounded hover:bg-white/5" style={{ color: '#fca5a5' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + Commit**

```bash
git add frontend/src/components/amazon/research/ResearchCard.tsx
git commit -m "feat(amazon-research): Karten-Komponente (Titel/Body/Links/Bilder)"
```

---

## Task 10: ResearchTopicBlock-Komponente

**Files:**
- Create: `frontend/src/components/amazon/research/ResearchTopicBlock.tsx`

Einklappbar (Titel inline editierbar, Karten-Anzahl), „+ Karte", Karten-Drag-and-drop via setPointerCapture-Muster (`UspPointList`).

- [ ] **Step 1: Komponente schreiben**

```tsx
import { useRef, useState } from 'react';
import { type ResearchTopic } from '../../../api/amazon.api';
import { useUpdateTopic, useDeleteTopic, useCreateCard, useReorderCards } from '../../../hooks/amazon/useResearch';
import { ResearchCard } from './ResearchCard';

const INPUT_STYLE: React.CSSProperties = {
  background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)',
};

export function ResearchTopicBlock({ productId, topic }: { productId: number; topic: ResearchTopic }) {
  const update = useUpdateTopic(productId);
  const del = useDeleteTopic(productId);
  const createCard = useCreateCard(productId);
  const reorder = useReorderCards(productId);
  const [title, setTitle] = useState(topic.title);
  const expanded = topic.is_expanded === 1;

  // Karten-Drag-and-drop (setPointerCapture-Muster wie UspPointList)
  const [order, setOrder] = useState<number[] | null>(null);
  const dragIndex = useRef<number | null>(null);
  const ids = order ?? topic.cards.map(c => c.id);
  const byId = new Map(topic.cards.map(c => [c.id, c]));
  const ordered = ids.map(id => byId.get(id)).filter(Boolean) as ResearchTopic['cards'];

  function down(idx: number, e: React.PointerEvent<HTMLDivElement>) {
    dragIndex.current = idx; (e.target as HTMLElement).setPointerCapture(e.pointerId);
    if (!order) setOrder(topic.cards.map(c => c.id));
  }
  function enter(idx: number) {
    if (dragIndex.current === null || dragIndex.current === idx) return;
    setOrder(prev => {
      const arr = [...(prev ?? topic.cards.map(c => c.id))];
      const [m] = arr.splice(dragIndex.current as number, 1); arr.splice(idx, 0, m);
      dragIndex.current = idx; return arr;
    });
  }
  function up() {
    if (dragIndex.current !== null && order) reorder.mutate({ topicId: topic.id, order }, { onSettled: () => setOrder(null) });
    dragIndex.current = null;
  }

  function saveTitle() {
    const t = title.trim();
    if (!t || t === topic.title) { setTitle(topic.title); return; }
    update.mutate({ topicId: topic.id, patch: { title: t } });
  }

  return (
    <div className="rounded-lg" style={{ background: 'var(--color-surface-container)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center gap-2 p-3">
        <button type="button" onClick={() => update.mutate({ topicId: topic.id, patch: { is_expanded: expanded ? 0 : 1 } })}
          aria-label={expanded ? 'Zuklappen' : 'Aufklappen'} style={{ color: 'var(--color-on-surface-variant)' }}>
          <span className="material-symbols-outlined">{expanded ? 'expand_less' : 'expand_more'}</span>
        </button>
        <input value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle}
          placeholder="Thema benennen …" autoComplete="off"
          className="flex-1 px-2 py-1 rounded text-sm font-semibold" style={INPUT_STYLE} />
        <span className="text-xs tabular-nums px-2 py-0.5 rounded-full"
          style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface-variant)' }}>
          {topic.cards.length}
        </span>
        <button type="button" onClick={() => { if (confirm(`Thema „${topic.title || 'ohne Titel'}" mit ${topic.cards.length} Karten wirklich löschen?`)) del.mutate(topic.id); }}
          aria-label="Thema löschen" className="p-1 rounded hover:bg-white/5" style={{ color: '#fca5a5' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
        </button>
      </div>

      {expanded && (
        <div className="px-3 pb-3 flex flex-col gap-2">
          {ordered.map((c, idx) => (
            <ResearchCard key={c.id} productId={productId} card={c}
              dragHandleProps={{ onPointerDown: (e) => down(idx, e), onPointerEnter: () => enter(idx), onPointerUp: up }} />
          ))}
          <button type="button" onClick={() => createCard.mutate(topic.id)}
            className="self-start px-3 py-1.5 rounded-md text-sm flex items-center gap-1.5"
            style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span> Karte
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + Commit**

```bash
git add frontend/src/components/amazon/research/ResearchTopicBlock.tsx
git commit -m "feat(amazon-research): Themen-Block (einklappbar, Karten-DnD)"
```

---

## Task 11: ResearchSection-Komponente

**Files:**
- Create: `frontend/src/components/amazon/research/ResearchSection.tsx`

Top-Section-Muster wie `BrandNameSection` (mit `SectionHeader`). Lädt Themen, „+ Thema".

- [ ] **Step 1: Komponente schreiben**

```tsx
import { useState } from 'react';
import { useResearchTopics, useCreateTopic } from '../../../hooks/amazon/useResearch';
import { ResearchTopicBlock } from './ResearchTopicBlock';
import { SectionHeader } from '../SectionHeader';

const ACCENT = '#38bdf8'; // sky — eigene Akzentfarbe für Recherche

export function ResearchSection({ productId }: { productId: number }) {
  const { data: topics, isLoading, isError, refetch } = useResearchTopics(productId);
  const createTopic = useCreateTopic(productId);
  const [expanded, setExpanded] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  function addTopic() {
    const t = newTitle.trim();
    if (!t) return;
    createTopic.mutate(t, { onSuccess: () => setNewTitle('') });
  }

  return (
    <section className="rounded-xl" style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <SectionHeader
        icon="lightbulb"
        title="Recherche & Wissen"
        accent={ACCENT}
        expanded={expanded}
        onToggleExpand={() => setExpanded(v => !v)}
        rightSlot={
          <span className="text-xs tabular-nums px-2 py-0.5 rounded-full"
            style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface-variant)' }}>
            {topics?.length ?? 0}
          </span>
        }
      />
      {expanded && (
        <div className="p-4 pt-0 flex flex-col gap-3">
          {isLoading && <p style={{ color: 'var(--color-on-surface-variant)' }}>Lade …</p>}
          {isError && (
            <button type="button" onClick={() => refetch()} className="self-start px-3 py-1.5 rounded-md text-sm"
              style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)' }}>Erneut laden</button>
          )}
          {topics?.map(t => <ResearchTopicBlock key={t.id} productId={productId} topic={t} />)}
          <div className="flex items-center gap-2">
            <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Neues Thema (z.B. Patente, Zertifikate, Keywords) …"
              onKeyDown={(e) => { if (e.key === 'Enter') addTopic(); }} autoComplete="off"
              className="flex-1 px-3 py-2 rounded-md text-sm"
              style={{ background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }} />
            <button type="button" onClick={addTopic} className="px-3 py-2 rounded-md text-sm flex items-center gap-1.5"
              style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span> Thema
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
```

Hinweis vor dem Schreiben: kurz `SectionHeader`-Props prüfen (`icon`, `title`, `accent`, `expanded`, `onToggleExpand`, `rightSlot`) — exakt wie in `BrandNameSection` genutzt. Falls Signatur abweicht, dort spickeln.

- [ ] **Step 2: Typecheck + Commit**

```bash
git add frontend/src/components/amazon/research/ResearchSection.tsx
git commit -m "feat(amazon-research): Top-Section Recherche & Wissen"
```

---

## Task 12: Einbinden in die Entwicklungs-Seite

**Files:**
- Modify: `frontend/src/hooks/amazon/useDetailSectionOrder.ts`
- Modify: `frontend/src/pages/amazon/AmazonProductDetailPage.tsx`

- [ ] **Step 1: `'research'` in der Section-Reihenfolge ergänzen**

In `useDetailSectionOrder.ts` Zeile 4 die DEFAULT_ORDER erweitern (ans Ende, damit bestehende localStorage-Stände `research` automatisch anhängen — vgl. readOrder-Logik):
```ts
const DEFAULT_ORDER = ['sourcing', 'checklist', 'usp', 'manufacturers', 'research'] as const;
```

- [ ] **Step 2: Render-Branch in `AmazonProductDetailPage.tsx` ergänzen**

Import (bei den anderen Section-Imports ~Zeile 21):
```tsx
import { ResearchSection } from '../../components/amazon/research/ResearchSection';
```
Im `DraggableSectionList`-render (nach der `manufacturers`-Zeile, vor dem `return <ChecklistSection ...>`):
```tsx
              if (id === 'research') return <ResearchSection productId={product.id} />;
```

- [ ] **Step 3: Typecheck**

Run: `npm --prefix frontend run typecheck` → Exit 0.

- [ ] **Step 4: Manuelle Verifikation im Browser** (Backend + Frontend laufen, hart neu laden)

Durchgehen: Bereich „Recherche & Wissen" erscheint als 5. Section → aufklappen → Thema „Patente" anlegen → Karte hinzufügen → Titel + Bullet-Text tippen (Tab/Blur speichert) → Link mit Label hinzufügen (öffnet neuen Tab) → Screenshot per Klick + per Cmd+V hochladen (Thumbnail) → Karte per Drag-Handle umsortieren → Thema zuklappen (zeigt Anzahl) → Reload zeigt alles gespeichert.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/amazon/useDetailSectionOrder.ts frontend/src/pages/amazon/AmazonProductDetailPage.tsx
git commit -m "feat(amazon-research): Section in Entwicklungs-Seite einbinden"
```

---

## Abschluss

- [ ] **Voller Typecheck + Tests:** `npm --prefix backend test` und `npm --prefix frontend run typecheck` → grün.
- [ ] **UAT mit Benny** anhand der Testkriterien aus der Spec (`docs/superpowers/specs/2026-06-15-amazon-recherche-wissen-design.md`).
- [ ] **Merge** nach Freigabe: `git merge --no-ff feature/amazon-recherche-wissen` (enthält auch das bereits abgenommene Bemerkung-Feature).

## Self-Review-Notizen (gegen Spec geprüft)
- Themen anlegen/umbenennen/einklappen/umsortieren/löschen ✓ (Task 2, 10, 11)
- Karten mit Titel optional, Bullet-Body, mehrere Links, mehrere Bilder, DnD ✓ (Task 9, 10)
- Screenshots Klick/Drag/Paste, Thumbnails, Vollansicht, löschen ✓ (Task 7)
- Pro Produkt getrennt, Auto-Save, echte Umlaute, Lösch-Bestätigung ✓ (durchgehend)
- Backup-Regel: keine Bulk-Deletes über Nutzer-CRUD hinaus; Migration-Backup automatisch ✓
- Offen/YAGNI (keine globale Sammlung, keine Volltextsuche) bewusst ausgelassen ✓
