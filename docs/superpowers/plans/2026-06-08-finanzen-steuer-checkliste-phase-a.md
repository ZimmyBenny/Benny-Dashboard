# Finanzen Steuer-Checkliste — Phase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Steuer-Checkliste unter Finanzen: pro Jahr Überbegriffe → abhakbare Punkte → Dokumente je Punkt (hochladen/ansehen/löschen). Struktur vom Vorjahr übernehmbar. (Phase A — ohne PDF-Export.)

**Architecture:** Neue Tabellen `steuer_categories`/`steuer_items`/`steuer_item_files`. Neue Routen-Datei `steuer.routes.ts` (gemountet `/api/steuer`). Neue Frontend-Seite `/finances/steuer-checkliste` (Nav-Untereintrag). Datei-Vorschau über das bestehende `FilePreviewModal`.

**Tech Stack:** Express 5 + better-sqlite3; React 19 + TanStack Query + Tailwind v4; Vitest + supertest.

**Spec:** `docs/superpowers/specs/2026-06-08-finanzen-steuer-checkliste-design.md`

---

### Task 1: Migration 083

- [ ] **Step 1:** `backend/src/db/migrations/083_steuer_checkliste.sql`:
```sql
CREATE TABLE steuer_categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  jahr       INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  name       TEXT    NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX steuer_categories_jahr_idx ON steuer_categories (jahr);

CREATE TABLE steuer_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES steuer_categories(id),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  title       TEXT    NOT NULL DEFAULT '',
  is_done     INTEGER NOT NULL DEFAULT 0 CHECK (is_done IN (0,1)),
  note        TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX steuer_items_category_idx ON steuer_items (category_id);

CREATE TABLE steuer_item_files (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id       INTEGER NOT NULL REFERENCES steuer_items(id),
  sort_order    INTEGER NOT NULL DEFAULT 0,
  file_path     TEXT    NOT NULL,
  original_name TEXT,
  mime          TEXT,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX steuer_item_files_item_idx ON steuer_item_files (item_id);
```
- [ ] **Step 2: Commit** `git add … && git commit -m "feat(steuer): Migration 083 — Steuer-Checkliste Tabellen"`

---

### Task 2: Backend `steuer.routes.ts` + Mount + Tests (TDD)

**Files:** Create `backend/src/routes/steuer.routes.ts`; Modify `backend/src/app.ts`; Test `backend/test/integration.steuer.test.ts`.

- [ ] **Step 1: Test-Datei** `backend/test/integration.steuer.test.ts`:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type Database from 'better-sqlite3';
import { createTestDb } from './setup';

vi.mock('../src/db/connection', () => {
  const mod: { default: Database.Database | null } = { default: null };
  return mod;
});

async function makeApp(db: Database.Database) {
  const conn = await import('../src/db/connection');
  // @ts-expect-error test injection
  conn.default = db;
  const routes = (await import('../src/routes/steuer.routes')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/steuer', routes);
  return app;
}

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

describe('Steuer-Checkliste API', () => {
  let db: Database.Database; let app: express.Express;
  beforeEach(async () => { db = createTestDb(); app = await makeApp(db); });

  it('Jahre: leer -> aktuelles Jahr; nach Kategorie 2025 erscheint 2025', async () => {
    const cur = new Date().getFullYear();
    const j0 = await request(app).get('/api/steuer/jahre');
    expect(j0.status).toBe(200);
    expect(j0.body.jahre).toContain(cur);
    await request(app).post('/api/steuer/2025/categories').send({ name: 'Privat' });
    const j1 = await request(app).get('/api/steuer/jahre');
    expect(j1.body.jahre).toContain(2025);
  });

  it('Kategorie + Punkt CRUD, is_done, GET eingebettet', async () => {
    const c = await request(app).post('/api/steuer/2025/categories').send({ name: 'DJ' });
    expect(c.status).toBe(201);
    expect(c.body.category).toMatchObject({ jahr: 2025, name: 'DJ', sort_order: 1 });
    const catId = c.body.category.id;
    const it = await request(app).post(`/api/steuer/categories/${catId}/items`).send({ title: 'Rechnungen' });
    expect(it.status).toBe(201);
    const itemId = it.body.item.id;
    const upd = await request(app).patch(`/api/steuer/items/${itemId}`).send({ is_done: 1, note: '  wichtig ' });
    expect(upd.body.item).toMatchObject({ is_done: 1, note: 'wichtig' });
    expect((await request(app).patch(`/api/steuer/items/${itemId}`).send({ is_done: 2 })).status).toBe(400);
    const get = await request(app).get('/api/steuer/2025');
    expect(get.body.categories[0].items[0]).toMatchObject({ id: itemId, is_done: 1 });
  });

  it('Datei: Upload + im GET eingebettet + Loeschen; fremder Punkt 404', async () => {
    const catId = (await request(app).post('/api/steuer/2025/categories').send({ name: 'Privat' })).body.category.id;
    const itemId = (await request(app).post(`/api/steuer/categories/${catId}/items`).send({ title: 'X' })).body.item.id;
    const up = await request(app).post(`/api/steuer/items/${itemId}/files`).attach('file', PNG, { filename: 'beleg.png', contentType: 'image/png' });
    expect(up.status).toBe(201);
    const fId = up.body.file.id;
    const get = await request(app).get('/api/steuer/2025');
    expect(get.body.categories[0].items[0].files.map((f: { id: number }) => f.id)).toEqual([fId]);
    expect((await request(app).get(`/api/steuer/items/${itemId}/files/${fId}`)).status).toBe(200);
    expect((await request(app).delete(`/api/steuer/items/${itemId}/files/${fId}`)).status).toBe(204);
    expect((await request(app).post(`/api/steuer/items/999999/files`).attach('file', PNG, { filename: 'x.png', contentType: 'image/png' })).status).toBe(404);
  });

  it('Kaskaden: Kategorie loeschen entfernt Punkte + Dateien', async () => {
    const catId = (await request(app).post('/api/steuer/2025/categories').send({ name: 'Privat' })).body.category.id;
    const itemId = (await request(app).post(`/api/steuer/categories/${catId}/items`).send({ title: 'X' })).body.item.id;
    await request(app).post(`/api/steuer/items/${itemId}/files`).attach('file', PNG, { filename: 'a.png', contentType: 'image/png' });
    expect((await request(app).delete(`/api/steuer/categories/${catId}`)).status).toBe(204);
    expect((db.prepare(`SELECT COUNT(*) AS c FROM steuer_items WHERE category_id=?`).get(catId) as { c: number }).c).toBe(0);
    expect((db.prepare(`SELECT COUNT(*) AS c FROM steuer_item_files WHERE item_id=?`).get(itemId) as { c: number }).c).toBe(0);
  });

  it('Reorder Kategorien + Punkte; fremde IDs -> 400', async () => {
    const a = (await request(app).post('/api/steuer/2025/categories').send({ name: 'A' })).body.category.id;
    const b = (await request(app).post('/api/steuer/2025/categories').send({ name: 'B' })).body.category.id;
    const ro = await request(app).patch('/api/steuer/2025/categories/reorder').send({ order: [b, a] });
    expect(ro.status).toBe(200);
    expect(ro.body.categories.map((c: { id: number }) => c.id)).toEqual([b, a]);
    expect((await request(app).patch('/api/steuer/2025/categories/reorder').send({ order: [99999] })).status).toBe(400);
  });

  it('copy-year kopiert Struktur ohne Dateien; Zieljahr nicht leer -> 400', async () => {
    const catId = (await request(app).post('/api/steuer/2025/categories').send({ name: 'Privat' })).body.category.id;
    const itemId = (await request(app).post(`/api/steuer/categories/${catId}/items`).send({ title: 'Beleg' })).body.item.id;
    await request(app).patch(`/api/steuer/items/${itemId}`).send({ is_done: 1 });
    const cp = await request(app).post('/api/steuer/copy-year').send({ from_jahr: 2025, to_jahr: 2026 });
    expect(cp.status).toBe(201);
    expect(cp.body.categories).toHaveLength(1);
    expect(cp.body.categories[0].items[0]).toMatchObject({ title: 'Beleg', is_done: 0 });
    expect((await request(app).post('/api/steuer/copy-year').send({ from_jahr: 2025, to_jahr: 2026 })).status).toBe(400);
  });
});
```

- [ ] **Step 2: Run — MUST FAIL** `cd backend && npx vitest run test/integration.steuer.test.ts`

- [ ] **Step 3: Routen-Datei** `backend/src/routes/steuer.routes.ts` mit EXAKT:
```ts
import { Router, type Request, type Response } from 'express';
import db from '../db/connection';
import multer from 'multer';
import path from 'path';
import os from 'os';
import fs from 'fs';
import crypto from 'crypto';

const router = Router();
const MAX_NAME = 300;
const MAX_NOTE = 2000;

const FILES_DIR = path.join(os.homedir(), '.local', 'share', 'benny-dashboard', 'steuer-files');
if (!fs.existsSync(FILES_DIR)) fs.mkdirSync(FILES_DIR, { recursive: true });
const fileUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, FILES_DIR),
    filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname) || ''}`),
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
});
function deleteFileFromDisk(filename: string | null | undefined) {
  if (!filename) return;
  const abs = path.resolve(FILES_DIR, filename);
  if (!abs.startsWith(path.resolve(FILES_DIR) + path.sep)) return;
  try { fs.unlinkSync(abs); } catch { /* schon weg */ }
}

interface CategoryRow { id: number; jahr: number; sort_order: number; name: string; created_at: number; updated_at: number; }
interface ItemRow { id: number; category_id: number; sort_order: number; title: string; is_done: number; note: string | null; created_at: number; updated_at: number; }
interface FileRow { id: number; item_id: number; sort_order: number; file_path: string; original_name: string | null; mime: string | null; created_at: number; }

function loadCategory(id: number): CategoryRow | undefined { return db.prepare(`SELECT * FROM steuer_categories WHERE id = ?`).get(id) as CategoryRow | undefined; }
function loadItem(id: number): ItemRow | undefined { return db.prepare(`SELECT * FROM steuer_items WHERE id = ?`).get(id) as ItemRow | undefined; }
function loadFileForItem(itemId: number, fId: number): FileRow | undefined { return db.prepare(`SELECT * FROM steuer_item_files WHERE id = ? AND item_id = ?`).get(fId, itemId) as FileRow | undefined; }
function loadFiles(itemId: number): FileRow[] { return db.prepare(`SELECT * FROM steuer_item_files WHERE item_id = ? ORDER BY sort_order, id`).all(itemId) as FileRow[]; }
function loadItemsWithFiles(catId: number) {
  const items = db.prepare(`SELECT * FROM steuer_items WHERE category_id = ? ORDER BY sort_order, id`).all(catId) as ItemRow[];
  return items.map(it => ({ ...it, files: loadFiles(it.id) }));
}
function loadCategoriesForYear(jahr: number) {
  const cats = db.prepare(`SELECT * FROM steuer_categories WHERE jahr = ? ORDER BY sort_order, id`).all(jahr) as CategoryRow[];
  return cats.map(c => ({ ...c, items: loadItemsWithFiles(c.id) }));
}
function normText(raw: unknown, max: number): { skip: true } | { skip: false; value: string | null } | { error: true } {
  if (raw === undefined) return { skip: true };
  if (raw === null) return { skip: false, value: null };
  if (typeof raw !== 'string') return { error: true };
  const t = raw.trim();
  if (t.length === 0) return { skip: false, value: null };
  if (t.length > max) return { error: true };
  return { skip: false, value: t };
}

// Jahre (literal — VOR /:jahr registrieren)
router.get('/jahre', (_req: Request, res: Response) => {
  const rows = db.prepare(`SELECT DISTINCT jahr FROM steuer_categories ORDER BY jahr DESC`).all() as Array<{ jahr: number }>;
  const set = new Set(rows.map(r => r.jahr));
  set.add(new Date().getFullYear());
  res.json({ jahre: Array.from(set).sort((a, b) => b - a) });
});

// copy-year (literal — VOR /:jahr-Familie unkritisch, eigener Pfad)
router.post('/copy-year', (req: Request, res: Response) => {
  const body = (req.body ?? {}) as { from_jahr?: unknown; to_jahr?: unknown };
  const from = Number(body.from_jahr); const to = Number(body.to_jahr);
  if (!Number.isInteger(from) || !Number.isInteger(to)) { res.status(400).json({ error: 'invalid jahr' }); return; }
  const toCount = (db.prepare(`SELECT COUNT(*) AS c FROM steuer_categories WHERE jahr = ?`).get(to) as { c: number }).c;
  if (toCount > 0) { res.status(400).json({ error: 'zieljahr nicht leer' }); return; }
  const cats = db.prepare(`SELECT * FROM steuer_categories WHERE jahr = ? ORDER BY sort_order, id`).all(from) as CategoryRow[];
  db.transaction(() => {
    for (const c of cats) {
      const r = db.prepare(`INSERT INTO steuer_categories (jahr, sort_order, name) VALUES (?, ?, ?)`).run(to, c.sort_order, c.name);
      const newCatId = Number(r.lastInsertRowid);
      const items = db.prepare(`SELECT * FROM steuer_items WHERE category_id = ? ORDER BY sort_order, id`).all(c.id) as ItemRow[];
      for (const it of items) db.prepare(`INSERT INTO steuer_items (category_id, sort_order, title, is_done, note) VALUES (?, ?, ?, 0, ?)`).run(newCatId, it.sort_order, it.title, it.note);
    }
  })();
  res.status(201).json({ categories: loadCategoriesForYear(to) });
});

// Kategorie-Reorder (literal-Segment 'reorder' — VOR /categories/:id)
router.patch('/:jahr/categories/reorder', (req: Request, res: Response) => {
  const jahr = Number(req.params.jahr);
  if (!Number.isInteger(jahr)) { res.status(400).json({ error: 'invalid jahr' }); return; }
  const order = (req.body as { order?: unknown })?.order;
  if (!Array.isArray(order) || order.some(x => !Number.isInteger(x))) { res.status(400).json({ error: 'invalid order' }); return; }
  const ownIds = new Set((db.prepare(`SELECT id FROM steuer_categories WHERE jahr = ?`).all(jahr) as Array<{ id: number }>).map(o => o.id));
  if (order.length !== ownIds.size || order.some((x: number) => !ownIds.has(x))) { res.status(400).json({ error: 'order mismatch' }); return; }
  const upd = db.prepare(`UPDATE steuer_categories SET sort_order = ? WHERE id = ?`);
  db.transaction(() => { order.forEach((cid: number, idx: number) => upd.run(idx + 1, cid)); })();
  res.json({ categories: loadCategoriesForYear(jahr) });
});

router.post('/:jahr/categories', (req: Request, res: Response) => {
  const jahr = Number(req.params.jahr);
  if (!Number.isInteger(jahr)) { res.status(400).json({ error: 'invalid jahr' }); return; }
  const nameRaw = (req.body as { name?: unknown })?.name;
  const name = typeof nameRaw === 'string' ? nameRaw.trim().slice(0, MAX_NAME) : '';
  const maxOrder = (db.prepare(`SELECT COALESCE(MAX(sort_order),0) AS m FROM steuer_categories WHERE jahr = ?`).get(jahr) as { m: number }).m;
  const r = db.prepare(`INSERT INTO steuer_categories (jahr, sort_order, name) VALUES (?, ?, ?)`).run(jahr, maxOrder + 1, name);
  const cat = loadCategory(Number(r.lastInsertRowid)) as CategoryRow;
  res.status(201).json({ category: { ...cat, items: [] } });
});

router.patch('/categories/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !loadCategory(id)) { res.status(404).json({ error: 'not found' }); return; }
  const n = normText((req.body as { name?: unknown })?.name, MAX_NAME);
  if ('error' in n) { res.status(400).json({ error: 'invalid name' }); return; }
  if (!n.skip) db.prepare(`UPDATE steuer_categories SET name = ?, updated_at = unixepoch() WHERE id = ?`).run(n.value ?? '', id);
  const cat = loadCategory(id) as CategoryRow;
  res.json({ category: { ...cat, items: loadItemsWithFiles(id) } });
});

router.delete('/categories/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !loadCategory(id)) { res.status(404).json({ error: 'not found' }); return; }
  const itemIds = (db.prepare(`SELECT id FROM steuer_items WHERE category_id = ?`).all(id) as Array<{ id: number }>).map(i => i.id);
  const fileRows = itemIds.flatMap(iid => loadFiles(iid));
  db.transaction(() => {
    if (itemIds.length) {
      db.prepare(`DELETE FROM steuer_item_files WHERE item_id IN (${itemIds.map(() => '?').join(',')})`).run(...itemIds);
      db.prepare(`DELETE FROM steuer_items WHERE category_id = ?`).run(id);
    }
    db.prepare(`DELETE FROM steuer_categories WHERE id = ?`).run(id);
  })();
  fileRows.forEach(f => deleteFileFromDisk(f.file_path));
  res.status(204).end();
});

// Punkt-Reorder (literal 'reorder' VOR /items/:id ist nicht nötig — anderer Pfad — aber sauber halten)
router.patch('/categories/:id/items/reorder', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !loadCategory(id)) { res.status(404).json({ error: 'not found' }); return; }
  const order = (req.body as { order?: unknown })?.order;
  if (!Array.isArray(order) || order.some(x => !Number.isInteger(x))) { res.status(400).json({ error: 'invalid order' }); return; }
  const own = new Set((db.prepare(`SELECT id FROM steuer_items WHERE category_id = ?`).all(id) as Array<{ id: number }>).map(o => o.id));
  if (order.length !== own.size || order.some((x: number) => !own.has(x))) { res.status(400).json({ error: 'order mismatch' }); return; }
  const upd = db.prepare(`UPDATE steuer_items SET sort_order = ? WHERE id = ?`);
  db.transaction(() => { order.forEach((iid: number, idx: number) => upd.run(idx + 1, iid)); })();
  res.json({ items: loadItemsWithFiles(id) });
});

router.post('/categories/:id/items', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !loadCategory(id)) { res.status(404).json({ error: 'not found' }); return; }
  const titleRaw = (req.body as { title?: unknown })?.title;
  const title = typeof titleRaw === 'string' ? titleRaw.trim().slice(0, MAX_NAME) : '';
  const maxOrder = (db.prepare(`SELECT COALESCE(MAX(sort_order),0) AS m FROM steuer_items WHERE category_id = ?`).get(id) as { m: number }).m;
  const r = db.prepare(`INSERT INTO steuer_items (category_id, sort_order, title) VALUES (?, ?, ?)`).run(id, maxOrder + 1, title);
  const it = loadItem(Number(r.lastInsertRowid)) as ItemRow;
  res.status(201).json({ item: { ...it, files: [] } });
});

router.patch('/items/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !loadItem(id)) { res.status(404).json({ error: 'not found' }); return; }
  const body = (req.body ?? {}) as { title?: unknown; is_done?: unknown; note?: unknown };
  const sets: string[] = []; const vals: unknown[] = [];
  if (body.title !== undefined) {
    if (typeof body.title !== 'string' || body.title.trim().length > MAX_NAME) { res.status(400).json({ error: 'invalid title' }); return; }
    sets.push('title = ?'); vals.push(body.title.trim());
  }
  if (body.is_done !== undefined) {
    if (body.is_done !== 0 && body.is_done !== 1) { res.status(400).json({ error: 'invalid is_done' }); return; }
    sets.push('is_done = ?'); vals.push(body.is_done);
  }
  if ('note' in body) {
    const n = normText(body.note, MAX_NOTE);
    if ('error' in n) { res.status(400).json({ error: 'invalid note' }); return; }
    if (!n.skip) { sets.push('note = ?'); vals.push(n.value); }
  }
  if (sets.length) { sets.push('updated_at = unixepoch()'); db.prepare(`UPDATE steuer_items SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id); }
  const it = loadItem(id) as ItemRow;
  res.json({ item: { ...it, files: loadFiles(id) } });
});

router.delete('/items/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !loadItem(id)) { res.status(404).json({ error: 'not found' }); return; }
  const files = loadFiles(id);
  db.transaction(() => {
    db.prepare(`DELETE FROM steuer_item_files WHERE item_id = ?`).run(id);
    db.prepare(`DELETE FROM steuer_items WHERE id = ?`).run(id);
  })();
  files.forEach(f => deleteFileFromDisk(f.file_path));
  res.status(204).end();
});

router.post('/items/:id/files', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !loadItem(id)) { res.status(404).json({ error: 'not found' }); return; }
  fileUpload.single('file')(req, res, (err: unknown) => {
    if (err) { res.status(400).json({ error: err instanceof Error ? err.message : 'upload failed' }); return; }
    const file = (req as Request & { file?: { filename: string; originalname: string; mimetype: string } }).file;
    if (!file) { res.status(400).json({ error: 'no file' }); return; }
    const maxOrder = (db.prepare(`SELECT COALESCE(MAX(sort_order),0) AS m FROM steuer_item_files WHERE item_id = ?`).get(id) as { m: number }).m;
    const r = db.prepare(`INSERT INTO steuer_item_files (item_id, sort_order, file_path, original_name, mime) VALUES (?, ?, ?, ?, ?)`)
      .run(id, maxOrder + 1, file.filename, file.originalname.slice(0, 300), file.mimetype.slice(0, 200));
    res.status(201).json({ file: db.prepare(`SELECT * FROM steuer_item_files WHERE id = ?`).get(r.lastInsertRowid) as FileRow });
  });
});

router.get('/items/:id/files/:fId', (req: Request, res: Response) => {
  const id = Number(req.params.id); const fId = Number(req.params.fId);
  if (!Number.isInteger(id) || !Number.isInteger(fId) || !loadItem(id)) { res.status(404).end(); return; }
  const f = loadFileForItem(id, fId);
  if (!f) { res.status(404).end(); return; }
  const abs = path.resolve(FILES_DIR, f.file_path);
  if (!abs.startsWith(path.resolve(FILES_DIR) + path.sep) || !fs.existsSync(abs)) { res.status(404).end(); return; }
  res.setHeader('Content-Type', f.mime || 'application/octet-stream');
  const ascii = (f.original_name ?? 'datei').replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
  res.setHeader('Content-Disposition', `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(f.original_name ?? 'datei')}`);
  fs.createReadStream(abs).pipe(res);
});

router.delete('/items/:id/files/:fId', (req: Request, res: Response) => {
  const id = Number(req.params.id); const fId = Number(req.params.fId);
  if (!Number.isInteger(id) || !Number.isInteger(fId) || !loadItem(id)) { res.status(404).json({ error: 'not found' }); return; }
  const f = loadFileForItem(id, fId);
  if (!f) { res.status(404).json({ error: 'not found' }); return; }
  db.prepare(`DELETE FROM steuer_item_files WHERE id = ?`).run(fId);
  deleteFileFromDisk(f.file_path);
  res.status(204).end();
});

// GET Jahr (param — NACH /jahre und allen literal-Routen registrieren)
router.get('/:jahr', (req: Request, res: Response) => {
  const jahr = Number(req.params.jahr);
  if (!Number.isInteger(jahr)) { res.status(400).json({ error: 'invalid jahr' }); return; }
  res.json({ jahr, categories: loadCategoriesForYear(jahr) });
});

export default router;
```
WICHTIG (Express-Routing-Reihenfolge): `GET /jahre` und `POST /copy-year` stehen VOR `GET /:jahr`. `PATCH /:jahr/categories/reorder` steht VOR `PATCH /categories/:id`. So wie oben angeordnet — Reihenfolge beibehalten.

- [ ] **Step 4: Mount in `backend/src/app.ts`**: Import `import steuerRoutes from './routes/steuer.routes';` (bei den anderen Imports) und Mount `app.use('/api/steuer', steuerRoutes);` (bei den anderen `app.use('/api/...')`-Zeilen, nach den Amazon-Mounts).

- [ ] **Step 5: Run — MUST PASS** `cd backend && npx vitest run test/integration.steuer.test.ts` → grün; `cd backend && npx vitest run` → alle grün.

- [ ] **Step 6: Commit**
```bash
git add backend/src/routes/steuer.routes.ts backend/src/app.ts backend/test/integration.steuer.test.ts
git commit -m "feat(steuer): Backend-Routen Steuer-Checkliste (Kategorien/Punkte/Dateien/copy-year)"
```

---

### Task 3: Frontend API + Hooks

**Files:** Create `frontend/src/api/steuer.api.ts`, `frontend/src/hooks/finanzen/useSteuer.ts`.

- [ ] **Step 1: `frontend/src/api/steuer.api.ts`**:
```ts
import apiClient from './client';

export interface SteuerFile { id: number; item_id: number; sort_order: number; file_path: string; original_name: string | null; mime: string | null; created_at: number; }
export interface SteuerItem { id: number; category_id: number; sort_order: number; title: string; is_done: number; note: string | null; created_at: number; updated_at: number; files: SteuerFile[]; }
export interface SteuerCategory { id: number; jahr: number; sort_order: number; name: string; created_at: number; updated_at: number; items: SteuerItem[]; }
export interface SteuerPayload { jahr: number; categories: SteuerCategory[]; }
export type SteuerItemPatch = Partial<{ title: string; is_done: number; note: string | null }>;

export async function fetchSteuerJahre(): Promise<number[]> {
  return ((await apiClient.get('/steuer/jahre')).data as { jahre: number[] }).jahre;
}
export async function fetchSteuer(jahr: number): Promise<SteuerPayload> {
  return (await apiClient.get(`/steuer/${jahr}`)).data as SteuerPayload;
}
export async function createSteuerCategory(jahr: number, name?: string): Promise<SteuerCategory> {
  return ((await apiClient.post(`/steuer/${jahr}/categories`, name !== undefined ? { name } : {})).data as { category: SteuerCategory }).category;
}
export async function updateSteuerCategory(id: number, name: string): Promise<SteuerCategory> {
  return ((await apiClient.patch(`/steuer/categories/${id}`, { name })).data as { category: SteuerCategory }).category;
}
export async function deleteSteuerCategory(id: number): Promise<void> { await apiClient.delete(`/steuer/categories/${id}`); }
export async function reorderSteuerCategories(jahr: number, order: number[]): Promise<void> { await apiClient.patch(`/steuer/${jahr}/categories/reorder`, { order }); }
export async function createSteuerItem(categoryId: number, title?: string): Promise<SteuerItem> {
  return ((await apiClient.post(`/steuer/categories/${categoryId}/items`, title !== undefined ? { title } : {})).data as { item: SteuerItem }).item;
}
export async function updateSteuerItem(id: number, patch: SteuerItemPatch): Promise<SteuerItem> {
  return ((await apiClient.patch(`/steuer/items/${id}`, patch)).data as { item: SteuerItem }).item;
}
export async function deleteSteuerItem(id: number): Promise<void> { await apiClient.delete(`/steuer/items/${id}`); }
export async function reorderSteuerItems(categoryId: number, order: number[]): Promise<void> { await apiClient.patch(`/steuer/categories/${categoryId}/items/reorder`, { order }); }
export async function uploadSteuerFile(itemId: number, file: File): Promise<SteuerFile> {
  const fd = new FormData(); fd.append('file', file);
  return ((await apiClient.post(`/steuer/items/${itemId}/files`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })).data as { file: SteuerFile }).file;
}
export async function getSteuerFileObjectUrl(itemId: number, fId: number): Promise<string> {
  const r = await apiClient.get(`/steuer/items/${itemId}/files/${fId}`, { responseType: 'blob' });
  return URL.createObjectURL(r.data as Blob);
}
export async function deleteSteuerFile(itemId: number, fId: number): Promise<void> { await apiClient.delete(`/steuer/items/${itemId}/files/${fId}`); }
export async function copySteuerYear(fromJahr: number, toJahr: number): Promise<SteuerCategory[]> {
  return ((await apiClient.post('/steuer/copy-year', { from_jahr: fromJahr, to_jahr: toJahr })).data as { categories: SteuerCategory[] }).categories;
}
```
(`apiClient` ist der Default-Export aus `./client`, wie in `amazon.api.ts`.)

- [ ] **Step 2: `frontend/src/hooks/finanzen/useSteuer.ts`**:
```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  type SteuerItemPatch,
  fetchSteuerJahre, fetchSteuer,
  createSteuerCategory, updateSteuerCategory, deleteSteuerCategory, reorderSteuerCategories,
  createSteuerItem, updateSteuerItem, deleteSteuerItem, reorderSteuerItems,
  uploadSteuerFile, deleteSteuerFile, copySteuerYear,
} from '../../api/steuer.api';

export const steuerJahreKey = ['steuer', 'jahre'] as const;
export const steuerKey = (jahr: number) => ['steuer', 'jahr', jahr] as const;

export function useSteuerJahre() { return useQuery({ queryKey: steuerJahreKey, queryFn: fetchSteuerJahre }); }
export function useSteuer(jahr: number) {
  return useQuery({ queryKey: steuerKey(jahr), queryFn: () => fetchSteuer(jahr), enabled: Number.isInteger(jahr) && jahr > 0 });
}
function useInval(jahr: number) {
  const qc = useQueryClient();
  return () => { qc.invalidateQueries({ queryKey: steuerKey(jahr) }); qc.invalidateQueries({ queryKey: steuerJahreKey }); };
}
export function useCreateSteuerCategory(jahr: number) { const inval = useInval(jahr); return useMutation({ mutationFn: (name?: string) => createSteuerCategory(jahr, name), onSettled: inval }); }
export function useUpdateSteuerCategory(jahr: number) { const inval = useInval(jahr); return useMutation({ mutationFn: ({ id, name }: { id: number; name: string }) => updateSteuerCategory(id, name), onSettled: inval }); }
export function useDeleteSteuerCategory(jahr: number) { const inval = useInval(jahr); return useMutation({ mutationFn: (id: number) => deleteSteuerCategory(id), onSettled: inval }); }
export function useReorderSteuerCategories(jahr: number) { const inval = useInval(jahr); return useMutation({ mutationFn: (order: number[]) => reorderSteuerCategories(jahr, order), onSettled: inval }); }
export function useCreateSteuerItem(jahr: number) { const inval = useInval(jahr); return useMutation({ mutationFn: (categoryId: number) => createSteuerItem(categoryId), onSettled: inval }); }
export function useUpdateSteuerItem(jahr: number) { const inval = useInval(jahr); return useMutation({ mutationFn: ({ id, patch }: { id: number; patch: SteuerItemPatch }) => updateSteuerItem(id, patch), onSettled: inval }); }
export function useDeleteSteuerItem(jahr: number) { const inval = useInval(jahr); return useMutation({ mutationFn: (id: number) => deleteSteuerItem(id), onSettled: inval }); }
export function useReorderSteuerItems(jahr: number) { const inval = useInval(jahr); return useMutation({ mutationFn: ({ categoryId, order }: { categoryId: number; order: number[] }) => reorderSteuerItems(categoryId, order), onSettled: inval }); }
export function useUploadSteuerFile(jahr: number) { const inval = useInval(jahr); return useMutation({ mutationFn: ({ itemId, file }: { itemId: number; file: File }) => uploadSteuerFile(itemId, file), onSettled: inval }); }
export function useDeleteSteuerFile(jahr: number) { const inval = useInval(jahr); return useMutation({ mutationFn: ({ itemId, fId }: { itemId: number; fId: number }) => deleteSteuerFile(itemId, fId), onSettled: inval }); }
export function useCopySteuerYear(jahr: number) { const inval = useInval(jahr); return useMutation({ mutationFn: ({ fromJahr, toJahr }: { fromJahr: number; toJahr: number }) => copySteuerYear(fromJahr, toJahr), onSettled: inval }); }
```

- [ ] **Step 3: Typecheck** `cd frontend && npx tsc --noEmit` → PASS.
- [ ] **Step 4: Commit** `git add frontend/src/api/steuer.api.ts frontend/src/hooks/finanzen/useSteuer.ts && git commit -m "feat(steuer): Frontend-API + Hooks"`

---

### Task 4: Frontend-Seite + Navigation

**Files:** Create `frontend/src/components/finanzen/SteuerFileRow.tsx`, `frontend/src/components/finanzen/SteuerItemRow.tsx`, `frontend/src/components/finanzen/SteuerCategoryBlock.tsx`, `frontend/src/pages/finanzen/TaxChecklistPage.tsx`; Modify `frontend/src/routes/routes.tsx`, `frontend/src/components/layout/navConfig.ts`.

**Vorlagen zum Spiegeln (vorher lesen):** `frontend/src/components/amazon/manufacturers/ManufacturerOffers.tsx` (Datei-Zeile MIT Vorschau — `OfferFileRow`), `frontend/src/components/amazon/FilePreviewModal.tsx` (`useFilePreview`/`FilePreviewModal`), `frontend/src/components/amazon/manufacturers/ManufacturersSection.tsx` (Drag-Reorder-Muster, Lade-/Fehlerzustände), `frontend/src/components/amazon/usp/UspPointRow.tsx` (Inline-Edit on blur).

- [ ] **Step 1: `SteuerFileRow.tsx`** — eine Dokument-Zeile mit Vorschau. Spiegele `OfferFileRow` aus `ManufacturerOffers.tsx` EXAKT, aber mit den Steuer-Funktionen:
  - Props: `{ itemId: number; file: SteuerFile; onDelete: () => void }`.
  - `useFilePreview()` + `<FilePreviewModal>` einbinden; Bild-Thumbnail (über `getSteuerFileObjectUrl(itemId, file.id)`) immer klickbar → `view()`; Nicht-Bilder: „Ansehen"-Auge → `view()`; Download (temp `<a>` + revoke); Löschen mit Inline-Bestätigung → `onDelete()`.

- [ ] **Step 2: `SteuerItemRow.tsx`** — ein Punkt.
  - Props: `{ jahr: number; item: SteuerItem }`.
  - Hooks: `useUpdateSteuerItem`, `useDeleteSteuerItem`, `useUploadSteuerFile`, `useDeleteSteuerFile` (alle `(jahr)`).
  - **Checkbox** (`is_done`) → `update.mutate({ id: item.id, patch: { is_done: item.is_done ? 0 : 1 } })`.
  - **Titel** Inline-Edit (lokaler State, onBlur bei Änderung → `update.mutate({ id, patch: { title } })`; Reset bei Prop-Wechsel via `useEffect`). Durchgestrichen/gedimmt wenn `is_done`.
  - **Notiz** (kleines Textfeld, optional sichtbar; onBlur → `patch: { note }`).
  - **Dokumente**: Liste der `item.files` als `<SteuerFileRow itemId={item.id} file={f} onDelete={() => delFile.mutate({ itemId: item.id, fId: f.id })} />`; „Datei hochladen" (verstecktes `<input type=file>`, max 20 MB → sonst Fehlertext, `upload.mutate({ itemId: item.id, file })`).
  - **Punkt löschen** (Bestätigung) → `delItem.mutate(item.id)`.

- [ ] **Step 3: `SteuerCategoryBlock.tsx`** — ein Überbegriff.
  - Props: `{ jahr: number; category: SteuerCategory; index: number; dragHandleProps: React.HTMLAttributes<HTMLDivElement>; onRequestDelete: (c: SteuerCategory) => void }`.
  - Drag-Griff (Nummer) via `dragHandleProps`; **Name** Inline-Edit (`useUpdateSteuerCategory(jahr)`); Löschen → `onRequestDelete`.
  - **Punkte**: Liste der `category.items` als `<SteuerItemRow>` mit Drag-Reorder (Muster aus `ManufacturersSection`/`UspPointList`; `useReorderSteuerItems(jahr).mutate({ categoryId: category.id, order }, { onSettled: () => setOrder(null) })`). „Punkt hinzufügen" → `useCreateSteuerItem(jahr).mutate(category.id)`.

- [ ] **Step 4: `TaxChecklistPage.tsx`** — Seite.
  - `PageWrapper`, Header (Icon `checklist`, Titel „Steuer-Checkliste").
  - State `jahr` (Default `new Date().getFullYear()`); `useSteuerJahre()` für die Jahresliste; `useSteuer(jahr)`.
  - **Jahr-Wähler**: `<select>` über `Array.from(new Set([...(jahreData ?? []), new Date().getFullYear(), jahr])).sort((a,b)=>b-a)`; daneben „+ Neues Jahr" → setzt `jahr` auf `(max(jahre)+1)` (oder `currentYear+1`).
  - Wenn `data.categories.length === 0` und es ein anderes Jahr mit Kategorien gibt (aus `jahreData`, das größte < jahr oder einfach das nächstkleinere vorhandene): Button „Struktur von <Vorjahr> übernehmen" → `useCopySteuerYear(jahr).mutate({ fromJahr: vorjahr, toJahr: jahr })`.
  - **Kategorien**: Liste der `data.categories` als `<SteuerCategoryBlock>` mit Drag-Reorder (`useReorderSteuerCategories(jahr)`); Lösch-Bestätigungsdialog auf Seitenebene (`pendingDelete` + Dialog wie `DeleteManufacturerDialog`) → `useDeleteSteuerCategory(jahr).mutate(id)`. „Überbegriff hinzufügen" → `useCreateSteuerCategory(jahr).mutate(undefined)`.
  - Lade-/Fehlerzustände wie in `ManufacturersSection`. Echte Umlaute; Confirm vor jedem Löschen.

- [ ] **Step 5: Navigation** — `frontend/src/components/layout/navConfig.ts`:
  - In den Finanzen-`subItems` (nach „Bewertungen") ergänzen: `{ path: '/finances/steuer-checkliste', label: 'Steuer-Checkliste', icon: 'checklist' },`
  - In `pageNames` ergänzen: `'/finances/steuer-checkliste': 'Steuer-Checkliste',`

- [ ] **Step 6: Route** — `frontend/src/routes/routes.tsx`: Import `import { TaxChecklistPage } from '../pages/finanzen/TaxChecklistPage';` und nach `{ path: '/finances', element: <FinancesPage /> },` ergänzen: `{ path: '/finances/steuer-checkliste', element: <TaxChecklistPage /> },`

- [ ] **Step 7: Typecheck + Build** `cd frontend && npx tsc --noEmit` → PASS; `cd frontend && npx vite build` → PASS.

- [ ] **Step 8: Commit**
```bash
git add frontend/src/components/finanzen/ frontend/src/pages/finanzen/ frontend/src/routes/routes.tsx frontend/src/components/layout/navConfig.ts
git commit -m "feat(steuer): Seite Steuer-Checkliste (Jahr, Kategorien, Punkte, Dokumente) + Navigation"
```

---

## Manuelles UAT (Phase A)
1. Sidebar → Finanzen → Steuer-Checkliste öffnet die Seite (Jahr = aktuelles Jahr).
2. Überbegriff „Privat" anlegen → Punkt „Lohnsteuerbescheinigung" → abhaken → Dokument hochladen → ansehen (Vorschau, ohne Download) → löschen.
3. Jahr wechseln/neues Jahr; im leeren Jahr „Struktur von <Vorjahr> übernehmen" → Kategorien/Punkte da, Häkchen leer, keine Dokumente.
4. Drag-Sortierung von Überbegriffen und Punkten; Löschen (mit Bestätigung) räumt Punkte/Dokumente weg.
