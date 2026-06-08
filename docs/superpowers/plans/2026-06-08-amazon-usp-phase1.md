# Amazon USP Phase 1 (mit Hersteller-Vergleich) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** USP-Sektion auf der Amazon-Produktseite mit kanonischer Anforderungsliste (Punkte: Titel/Text/Bilder), Hersteller-Verwaltung, Vergleichs-Matrix (Punkt × Hersteller: umsetzbar/teilweise/nicht/offen + Notiz), Übersicht und PDF-Export pro Hersteller.

**Architecture:** 5 neue Tabellen (Migration 065): Produkt-Meta, produkt-skopierte Punkte, Punkt-Bilder, Hersteller, Feasibility-Matrix. Neue Express-Routen `amazon.usp.routes.ts` (Lazy-Init Meta + Default-Hersteller, CRUD/Reorder, Multer-Upload, Feasibility-Upsert). Frontend: TanStack-Query-Hooks, Akkordeon-Sektion mit Punkte-Editor, Hersteller-Leiste, Matrix, Übersicht, jsPDF-Export. Rein additiv.

**Tech Stack:** Express 5, better-sqlite3, multer, SQLite Migration; React 19, TanStack Query 5, jsPDF, Tailwind v4. Vitest+supertest.

---

## Datensicherheit
Nur neue Tabellen → Auto-Backup der Migration genügt; kein `createBackup`, kein `PRAGMA foreign_keys` in der Migration. Laufzeit-Cascades funktionieren (foreign_keys ist zur Laufzeit ON; in Tests setzt `createTestDb` ON).

## Vorbedingung — Branch (Orchestrator, vor Task 1)
```bash
cd "/Users/benny/Library/Mobile Documents/com~apple~CloudDocs/B E N N Y 👨🏽‍💻/09 - Benny Dashboard"
git checkout main && git checkout -b feat/amazon-usp-phase1
```

## Pfade / Befehle
- Repo `<repo>` = `/Users/benny/Library/Mobile Documents/com~apple~CloudDocs/B E N N Y 👨🏽‍💻/09 - Benny Dashboard`
- Backend-Tests: `cd "<repo>/backend" && npx vitest run …` · Typecheck: `npx tsc --noEmit`
- Frontend: `cd "<repo>/frontend" && npx tsc --noEmit && npx vite build`

## File Structure
- Create `backend/src/db/migrations/065_amazon_usp.sql`
- Create `backend/src/routes/amazon.usp.routes.ts` (aufgebaut über Task 2–4)
- Modify `backend/src/app.ts` (mount)
- Create `backend/test/integration.amazon_usp.test.ts` (erweitert über Task 2–4)
- Modify `frontend/src/api/amazon.api.ts`
- Create `frontend/src/hooks/amazon/useUsp.ts`
- Create `frontend/src/components/amazon/usp/`: `UspSection.tsx`, `UspMetaForm.tsx`, `UspPointList.tsx`, `UspPointRow.tsx`, `UspPointImages.tsx`, `UspManufacturers.tsx`, `UspMatrix.tsx`, `UspOverview.tsx`, `DeleteUspPointDialog.tsx`, `DeleteUspManufacturerDialog.tsx`
- Create `frontend/src/lib/amazon/exportUspPdf.ts`
- Modify `frontend/src/hooks/amazon/useDetailSectionOrder.ts`, `frontend/src/pages/amazon/AmazonProductDetailPage.tsx`

---

### Task 1: Migration 065 — fünf USP-Tabellen

**Files:** Create `backend/src/db/migrations/065_amazon_usp.sql`

- [ ] **Step 1: Migration schreiben** (echte Umlaute in Kommentaren erlaubt; keine in Identifiern)

```sql
-- Migration 065: Amazon USP — Meta, Punkte, Bilder, Hersteller, Machbarkeit (2026-06-08)
-- WICHTIG: Kein FK-Pragma setzen — migrate.ts steuert foreign_keys zentral. Rein additiv.

CREATE TABLE amazon_usp (
  product_id  INTEGER PRIMARY KEY REFERENCES amazon_products(id) ON DELETE CASCADE,
  marke       TEXT,
  hauptfokus  TEXT,
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE amazon_usp_points (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL REFERENCES amazon_products(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  title       TEXT    NOT NULL DEFAULT '',
  body        TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX amazon_usp_points_product_idx ON amazon_usp_points (product_id, sort_order, id);

CREATE TABLE amazon_usp_point_images (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  point_id    INTEGER NOT NULL REFERENCES amazon_usp_points(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  file_path   TEXT    NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX amazon_usp_point_images_point_idx ON amazon_usp_point_images (point_id, sort_order, id);

CREATE TABLE amazon_usp_manufacturers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL REFERENCES amazon_products(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  name        TEXT    NOT NULL DEFAULT '',
  datum       TEXT,
  notes       TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX amazon_usp_manufacturers_product_idx ON amazon_usp_manufacturers (product_id, sort_order, id);

CREATE TABLE amazon_usp_feasibility (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  point_id        INTEGER NOT NULL REFERENCES amazon_usp_points(id) ON DELETE CASCADE,
  manufacturer_id INTEGER NOT NULL REFERENCES amazon_usp_manufacturers(id) ON DELETE CASCADE,
  status          TEXT    NOT NULL DEFAULT 'offen' CHECK (status IN ('offen','umsetzbar','teilweise','nicht')),
  note            TEXT,
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (point_id, manufacturer_id)
);
CREATE INDEX amazon_usp_feasibility_point_idx ON amazon_usp_feasibility (point_id);
CREATE INDEX amazon_usp_feasibility_manufacturer_idx ON amazon_usp_feasibility (manufacturer_id);
```

- [ ] **Step 2: Smoke — Test-DB baut ohne SQL-Fehler**

Run: `cd "<repo>/backend" && npx vitest run test/integration.amazon_checklist.test.ts 2>&1 | tail -5`
Expected: kein `SQLITE_ERROR` beim Setup; bestehende Tests grün.

- [ ] **Step 3: Commit**
```bash
git add "backend/src/db/migrations/065_amazon_usp.sql"
git commit -m "feat(amazon-usp): Migration 065 — USP-Tabellen inkl. Hersteller + Machbarkeit" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Backend — Meta + Punkte (CRUD/Reorder) + Mount + Tests

**Files:** Create `backend/src/routes/amazon.usp.routes.ts`; Modify `backend/src/app.ts`; Create `backend/test/integration.amazon_usp.test.ts`

- [ ] **Step 1: Testdatei (Meta + Punkte) schreiben**

Create `backend/test/integration.amazon_usp.test.ts`:

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
  const routes = (await import('../src/routes/amazon.usp.routes')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/amazon', routes);
  return app;
}

function makeProduct(db: Database.Database, name = 'P'): number {
  db.prepare(`INSERT INTO amazon_products (name) VALUES (?)`).run(name);
  return Number((db.prepare(`SELECT last_insert_rowid() AS id`).get() as { id: number }).id);
}

describe('USP API — Meta + Punkte', () => {
  let db: Database.Database;
  let app: express.Express;
  beforeEach(async () => { db = createTestDb(); app = await makeApp(db); });

  it('GET legt Meta + Default-Hersteller lazy an', async () => {
    const pid = makeProduct(db);
    const r = await request(app).get(`/api/amazon/products/${pid}/usp`);
    expect(r.status).toBe(200);
    expect(r.body.meta).toMatchObject({ product_id: pid });
    expect(r.body.points).toEqual([]);
    expect(r.body.manufacturers).toHaveLength(1);
    expect(r.body.feasibility).toEqual([]);
  });

  it('GET zweimal dupliziert weder Meta noch Hersteller', async () => {
    const pid = makeProduct(db);
    await request(app).get(`/api/amazon/products/${pid}/usp`);
    await request(app).get(`/api/amazon/products/${pid}/usp`);
    expect((db.prepare(`SELECT COUNT(*) AS c FROM amazon_usp WHERE product_id=?`).get(pid) as { c: number }).c).toBe(1);
    expect((db.prepare(`SELECT COUNT(*) AS c FROM amazon_usp_manufacturers WHERE product_id=?`).get(pid) as { c: number }).c).toBe(1);
  });

  it('GET 404 unbekanntes Produkt', async () => {
    expect((await request(app).get('/api/amazon/products/9999/usp')).status).toBe(404);
  });

  it('PATCH Meta setzt marke/hauptfokus (Trim, Leer->null); hauptfokus>2000 -> 400', async () => {
    const pid = makeProduct(db);
    await request(app).get(`/api/amazon/products/${pid}/usp`);
    const ok = await request(app).patch(`/api/amazon/products/${pid}/usp`).send({ marke: '  Ruhekind ', hauptfokus: 'Boxspring' });
    expect(ok.status).toBe(200);
    expect(ok.body.meta).toMatchObject({ marke: 'Ruhekind', hauptfokus: 'Boxspring' });
    const bad = await request(app).patch(`/api/amazon/products/${pid}/usp`).send({ hauptfokus: 'x'.repeat(2001) });
    expect(bad.status).toBe(400);
  });

  it('POST/PATCH/DELETE Punkt + Reorder', async () => {
    const pid = makeProduct(db);
    await request(app).get(`/api/amazon/products/${pid}/usp`);
    const a = await request(app).post(`/api/amazon/products/${pid}/usp/points`).send({ title: 'A' });
    expect(a.status).toBe(201);
    expect(a.body.point).toMatchObject({ title: 'A', sort_order: 1, product_id: pid });
    expect(a.body.point.images).toEqual([]);
    const b = await request(app).post(`/api/amazon/products/${pid}/usp/points`).send({ title: 'B' });
    expect(b.body.point.sort_order).toBe(2);
    const patch = await request(app).patch(`/api/amazon/products/${pid}/usp/points/${a.body.point.id}`).send({ body: 'X' });
    expect(patch.body.point.body).toBe('X');
    const bad = await request(app).patch(`/api/amazon/products/${pid}/usp/points/${a.body.point.id}`).send({ body: 'x'.repeat(5001) });
    expect(bad.status).toBe(400);
    const ro = await request(app).patch(`/api/amazon/products/${pid}/usp/points/reorder`).send({ order: [b.body.point.id, a.body.point.id] });
    expect(ro.status).toBe(200);
    const list = await request(app).get(`/api/amazon/products/${pid}/usp`);
    expect(list.body.points.map((p: { title: string }) => p.title)).toEqual(['B', 'A']);
    const del = await request(app).delete(`/api/amazon/products/${pid}/usp/points/${a.body.point.id}`);
    expect(del.status).toBe(204);
  });

  it('Punkt Cross-Produkt -> 404; fremde Reorder-ID -> 400', async () => {
    const pA = makeProduct(db, 'A'); const pB = makeProduct(db, 'B');
    await request(app).get(`/api/amazon/products/${pA}/usp`);
    await request(app).get(`/api/amazon/products/${pB}/usp`);
    const a = await request(app).post(`/api/amazon/products/${pA}/usp/points`).send({});
    expect((await request(app).delete(`/api/amazon/products/${pB}/usp/points/${a.body.point.id}`)).status).toBe(404);
    expect((await request(app).patch(`/api/amazon/products/${pA}/usp/points/reorder`).send({ order: [99999] })).status).toBe(400);
  });

  it('Cascade: Produkt loeschen entfernt Meta + Punkte', async () => {
    const pid = makeProduct(db);
    await request(app).get(`/api/amazon/products/${pid}/usp`);
    await request(app).post(`/api/amazon/products/${pid}/usp/points`).send({});
    db.prepare(`DELETE FROM amazon_products WHERE id=?`).run(pid);
    expect((db.prepare(`SELECT COUNT(*) AS c FROM amazon_usp WHERE product_id=?`).get(pid) as { c: number }).c).toBe(0);
    expect((db.prepare(`SELECT COUNT(*) AS c FROM amazon_usp_points WHERE product_id=?`).get(pid) as { c: number }).c).toBe(0);
  });
});
```

- [ ] **Step 2: Tests laufen — FAIL (Modul fehlt)**

Run: `cd "<repo>/backend" && npx vitest run test/integration.amazon_usp.test.ts 2>&1 | tail -10`
Expected: `Cannot find module '../src/routes/amazon.usp.routes'`.

- [ ] **Step 3: Routen-Datei (Meta + Punkte) schreiben**

Create `backend/src/routes/amazon.usp.routes.ts`:

```ts
import { Router, type Request, type Response } from 'express';
import db from '../db/connection';

const router = Router();

const MAX_MARKE = 200, MAX_HAUPTFOKUS = 2000, MAX_TITLE = 200, MAX_BODY = 5000;
const MAX_MNAME = 200, MAX_DATUM = 50, MAX_MNOTES = 2000, MAX_FNOTE = 1000;
const VALID_STATUS = new Set(['offen', 'umsetzbar', 'teilweise', 'nicht']);

interface MetaRow { product_id: number; marke: string | null; hauptfokus: string | null; updated_at: number; }
interface PointRow { id: number; product_id: number; sort_order: number; title: string; body: string | null; created_at: number; updated_at: number; }
interface ImageRow { id: number; point_id: number; sort_order: number; file_path: string; created_at: number; }
interface ManufacturerRow { id: number; product_id: number; sort_order: number; name: string; datum: string | null; notes: string | null; created_at: number; updated_at: number; }
interface FeasibilityRow { id: number; point_id: number; manufacturer_id: number; status: string; note: string | null; updated_at: number; }

function requireText(raw: unknown, max: number): { ok: true; value: string } | { ok: false } {
  if (typeof raw !== 'string') return { ok: false };
  const t = raw.trim();
  if (t.length < 1 || t.length > max) return { ok: false };
  return { ok: true, value: t };
}
function normalizeText(raw: unknown, max: number): { ok: true; value: string | null } | { ok: false } {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: false };
  const t = raw.trim();
  if (t.length === 0) return { ok: true, value: null };
  if (t.length > max) return { ok: false };
  return { ok: true, value: t };
}
function ensureProduct(id: number): boolean {
  return db.prepare(`SELECT 1 FROM amazon_products WHERE id = ?`).get(id) !== undefined;
}
function getOrCreateMeta(productId: number): MetaRow {
  const existing = db.prepare(`SELECT * FROM amazon_usp WHERE product_id = ?`).get(productId) as MetaRow | undefined;
  if (existing) return existing;
  db.prepare(`INSERT INTO amazon_usp (product_id) VALUES (?)`).run(productId);
  return db.prepare(`SELECT * FROM amazon_usp WHERE product_id = ?`).get(productId) as MetaRow;
}
function ensureDefaultManufacturer(productId: number): void {
  const c = (db.prepare(`SELECT COUNT(*) AS c FROM amazon_usp_manufacturers WHERE product_id = ?`).get(productId) as { c: number }).c;
  if (c === 0) db.prepare(`INSERT INTO amazon_usp_manufacturers (product_id, sort_order, name) VALUES (?, 1, '')`).run(productId);
}
function loadImages(pointId: number): ImageRow[] {
  return db.prepare(`SELECT * FROM amazon_usp_point_images WHERE point_id = ? ORDER BY sort_order, id`).all(pointId) as ImageRow[];
}
function loadPoints(productId: number): Array<PointRow & { images: ImageRow[] }> {
  const pts = db.prepare(`SELECT * FROM amazon_usp_points WHERE product_id = ? ORDER BY sort_order, id`).all(productId) as PointRow[];
  return pts.map(p => ({ ...p, images: loadImages(p.id) }));
}
function loadManufacturers(productId: number): ManufacturerRow[] {
  return db.prepare(`SELECT * FROM amazon_usp_manufacturers WHERE product_id = ? ORDER BY sort_order, id`).all(productId) as ManufacturerRow[];
}
function loadFeasibility(productId: number): FeasibilityRow[] {
  return db.prepare(
    `SELECT f.* FROM amazon_usp_feasibility f
     JOIN amazon_usp_points p ON p.id = f.point_id
     WHERE p.product_id = ?`
  ).all(productId) as FeasibilityRow[];
}
function loadPointForProduct(productId: number, pointId: number): PointRow | undefined {
  return db.prepare(`SELECT * FROM amazon_usp_points WHERE id = ? AND product_id = ?`).get(pointId, productId) as PointRow | undefined;
}
function loadManufacturerForProduct(productId: number, mId: number): ManufacturerRow | undefined {
  return db.prepare(`SELECT * FROM amazon_usp_manufacturers WHERE id = ? AND product_id = ?`).get(mId, productId) as ManufacturerRow | undefined;
}

// GET
router.get('/products/:id/usp', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) { res.status(404).json({ error: 'product not found' }); return; }
  const meta = getOrCreateMeta(id);
  ensureDefaultManufacturer(id);
  res.json({ meta, points: loadPoints(id), manufacturers: loadManufacturers(id), feasibility: loadFeasibility(id) });
});

// PATCH Meta
router.patch('/products/:id/usp', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) { res.status(404).json({ error: 'product not found' }); return; }
  getOrCreateMeta(id);
  const body = (req.body as Record<string, unknown>) ?? {};
  const updates: string[] = []; const params: unknown[] = [];
  for (const [col, max] of [['marke', MAX_MARKE], ['hauptfokus', MAX_HAUPTFOKUS]] as const) {
    if (body[col] !== undefined) {
      const v = normalizeText(body[col], max);
      if (!v.ok) { res.status(400).json({ error: `invalid ${col}` }); return; }
      updates.push(`${col} = ?`); params.push(v.value);
    }
  }
  if (updates.length > 0) {
    updates.push('updated_at = unixepoch()'); params.push(id);
    db.prepare(`UPDATE amazon_usp SET ${updates.join(', ')} WHERE product_id = ?`).run(...params);
  }
  res.json({ meta: db.prepare(`SELECT * FROM amazon_usp WHERE product_id = ?`).get(id) as MetaRow });
});

// POST Punkt
router.post('/products/:id/usp/points', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) { res.status(404).json({ error: 'product not found' }); return; }
  const titleRaw = (req.body as { title?: unknown })?.title;
  let title = '';
  if (titleRaw !== undefined && titleRaw !== null) {
    if (typeof titleRaw !== 'string' || titleRaw.trim().length > MAX_TITLE) { res.status(400).json({ error: 'invalid title' }); return; }
    title = titleRaw.trim();
  }
  const maxOrder = (db.prepare(`SELECT COALESCE(MAX(sort_order),0) AS m FROM amazon_usp_points WHERE product_id = ?`).get(id) as { m: number }).m;
  const r = db.prepare(`INSERT INTO amazon_usp_points (product_id, sort_order, title) VALUES (?, ?, ?)`).run(id, maxOrder + 1, title);
  const row = db.prepare(`SELECT * FROM amazon_usp_points WHERE id = ?`).get(r.lastInsertRowid) as PointRow;
  res.status(201).json({ point: { ...row, images: [] } });
});

// PATCH Punkt
router.patch('/products/:id/usp/points/:pointId', (req: Request, res: Response) => {
  const id = Number(req.params.id); const pointId = Number(req.params.pointId);
  if (!Number.isInteger(id) || !Number.isInteger(pointId)) { res.status(404).json({ error: 'not found' }); return; }
  if (!ensureProduct(id) || !loadPointForProduct(id, pointId)) { res.status(404).json({ error: 'not found' }); return; }
  const body = (req.body as Record<string, unknown>) ?? {};
  const updates: string[] = []; const params: unknown[] = [];
  if (body.title !== undefined) {
    if (typeof body.title !== 'string' || body.title.trim().length > MAX_TITLE) { res.status(400).json({ error: 'invalid title' }); return; }
    updates.push('title = ?'); params.push(body.title.trim());
  }
  if (body.body !== undefined) {
    const v = normalizeText(body.body, MAX_BODY);
    if (!v.ok) { res.status(400).json({ error: 'invalid body' }); return; }
    updates.push('body = ?'); params.push(v.value);
  }
  if (updates.length > 0) {
    updates.push('updated_at = unixepoch()'); params.push(pointId);
    db.prepare(`UPDATE amazon_usp_points SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }
  const row = db.prepare(`SELECT * FROM amazon_usp_points WHERE id = ?`).get(pointId) as PointRow;
  res.json({ point: { ...row, images: loadImages(pointId) } });
});

// PATCH Reorder Punkte
router.patch('/products/:id/usp/points/reorder', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) { res.status(404).json({ error: 'product not found' }); return; }
  const order = (req.body as { order?: unknown })?.order;
  if (!Array.isArray(order) || order.some(x => !Number.isInteger(x))) { res.status(400).json({ error: 'invalid order' }); return; }
  const own = db.prepare(`SELECT id FROM amazon_usp_points WHERE product_id = ?`).all(id) as Array<{ id: number }>;
  const ownIds = new Set(own.map(o => o.id));
  if (order.length !== ownIds.size || order.some((x: number) => !ownIds.has(x))) { res.status(400).json({ error: 'order mismatch' }); return; }
  const upd = db.prepare(`UPDATE amazon_usp_points SET sort_order = ?, updated_at = unixepoch() WHERE id = ?`);
  db.transaction(() => { order.forEach((pid: number, idx: number) => upd.run(idx + 1, pid)); })();
  res.json({ points: loadPoints(id) });
});

// DELETE Punkt (Bild-Dateien werden in Task 3 ergaenzt; Cascade entfernt Bild-/Feasibility-Zeilen)
router.delete('/products/:id/usp/points/:pointId', (req: Request, res: Response) => {
  const id = Number(req.params.id); const pointId = Number(req.params.pointId);
  if (!Number.isInteger(id) || !Number.isInteger(pointId)) { res.status(404).json({ error: 'not found' }); return; }
  if (!ensureProduct(id) || !loadPointForProduct(id, pointId)) { res.status(404).json({ error: 'not found' }); return; }
  db.prepare(`DELETE FROM amazon_usp_points WHERE id = ?`).run(pointId);
  res.status(204).end();
});

export default router;
```

- [ ] **Step 4: Mount in `app.ts`**

In `backend/src/app.ts` nach `import amazonChecklistRoutes …` ergänzen:
```ts
import amazonUspRoutes from './routes/amazon.usp.routes';
```
und nach `app.use('/api/amazon', amazonChecklistRoutes);`:
```ts
  app.use('/api/amazon', amazonUspRoutes);
```

- [ ] **Step 5: Tests grün + Typecheck**

Run: `cd "<repo>/backend" && npx vitest run test/integration.amazon_usp.test.ts && npx tsc --noEmit`
Expected: alle Meta/Punkt-Tests PASS, tsc PASS.

- [ ] **Step 6: Commit**
```bash
git add "backend/src/routes/amazon.usp.routes.ts" "backend/src/app.ts" "backend/test/integration.amazon_usp.test.ts"
git commit -m "feat(amazon-usp): Backend Meta + Punkte (CRUD/Reorder) + Mount + Tests" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Backend — Punkt-Bilder (Upload/Serve/Reorder/Delete)

**Files:** Modify `backend/src/routes/amazon.usp.routes.ts`, `backend/test/integration.amazon_usp.test.ts`

- [ ] **Step 1: Bild-Tests ergänzen** (neue describe-Suite am Dateiende)

```ts
describe('USP API — Punkt-Bilder', () => {
  let db: Database.Database; let app: express.Express;
  beforeEach(async () => { db = createTestDb(); app = await makeApp(db); });
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  async function makePoint(pid: number): Promise<number> {
    const a = await request(app).post(`/api/amazon/products/${pid}/usp/points`).send({});
    return a.body.point.id;
  }
  it('Upload + GET Datei', async () => {
    const pid = makeProduct(db); await request(app).get(`/api/amazon/products/${pid}/usp`);
    const point = await makePoint(pid);
    const up = await request(app).post(`/api/amazon/products/${pid}/usp/points/${point}/images`).attach('file', PNG, { filename: 'a.png', contentType: 'image/png' });
    expect(up.status).toBe(201);
    expect(up.body.image).toMatchObject({ point_id: point, sort_order: 1 });
    const get = await request(app).get(`/api/amazon/products/${pid}/usp/images/${up.body.image.id}`);
    expect(get.status).toBe(200);
    expect(get.headers['content-type']).toContain('image/png');
  });
  it('Reorder + Delete + Cascade', async () => {
    const pid = makeProduct(db); await request(app).get(`/api/amazon/products/${pid}/usp`);
    const point = await makePoint(pid);
    const a = await request(app).post(`/api/amazon/products/${pid}/usp/points/${point}/images`).attach('file', PNG, { filename: 'a.png', contentType: 'image/png' });
    const b = await request(app).post(`/api/amazon/products/${pid}/usp/points/${point}/images`).attach('file', PNG, { filename: 'b.png', contentType: 'image/png' });
    const ro = await request(app).patch(`/api/amazon/products/${pid}/usp/points/${point}/images/reorder`).send({ order: [b.body.image.id, a.body.image.id] });
    expect(ro.status).toBe(200);
    const list = await request(app).get(`/api/amazon/products/${pid}/usp`);
    expect(list.body.points[0].images.map((i: { id: number }) => i.id)).toEqual([b.body.image.id, a.body.image.id]);
    const del = await request(app).delete(`/api/amazon/products/${pid}/usp/points/${point}/images/${a.body.image.id}`);
    expect(del.status).toBe(204);
    await request(app).delete(`/api/amazon/products/${pid}/usp/points/${point}`);
    expect((db.prepare(`SELECT COUNT(*) AS c FROM amazon_usp_point_images WHERE id=?`).get(b.body.image.id) as { c: number }).c).toBe(0);
  });
});
```

- [ ] **Step 2: Tests laufen — Bild-Routen fehlen → FAIL**

Run: `cd "<repo>/backend" && npx vitest run test/integration.amazon_usp.test.ts 2>&1 | tail -15`
Expected: Bild-Tests FAIL, Meta/Punkt-Tests grün.

- [ ] **Step 3: Bild-Logik in `amazon.usp.routes.ts` ergänzen**

Imports oben ergänzen:
```ts
import multer from 'multer';
import path from 'path';
import os from 'os';
import fs from 'fs';
import crypto from 'crypto';
```
Nach den Imports (vor `const router`):
```ts
const UPLOAD_DIR = path.join(os.homedir(), '.local', 'share', 'benny-dashboard', 'amazon-usp');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const EXT_BY_MIME: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
const CONTENT_BY_EXT: Record<string, string> = { '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = EXT_BY_MIME[file.mimetype];
      if (!ext) return cb(new Error('mime not allowed'), '');
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => { if (!ALLOWED_MIME.has(file.mimetype)) return cb(new Error('mime not allowed')); cb(null, true); },
});
function deleteUspImageFile(filename: string | null | undefined) {
  if (!filename) return;
  const abs = path.resolve(UPLOAD_DIR, filename);
  if (!abs.startsWith(path.resolve(UPLOAD_DIR) + path.sep)) return;
  try { fs.unlinkSync(abs); } catch { /* schon weg */ }
}
function loadImageForProduct(productId: number, pointId: number, imageId: number): ImageRow | undefined {
  return db.prepare(
    `SELECT i.* FROM amazon_usp_point_images i
     JOIN amazon_usp_points p ON p.id = i.point_id
     WHERE i.id = ? AND i.point_id = ? AND p.product_id = ?`
  ).get(imageId, pointId, productId) as ImageRow | undefined;
}
```

Den DELETE-Punkt-Handler so ersetzen, dass Bild-Dateien mitentfernt werden — ersetze seinen Body ab `if (!ensureProduct…`:
```ts
  if (!ensureProduct(id) || !loadPointForProduct(id, pointId)) { res.status(404).json({ error: 'not found' }); return; }
  const imgs = loadImages(pointId);
  db.prepare(`DELETE FROM amazon_usp_points WHERE id = ?`).run(pointId);
  for (const img of imgs) deleteUspImageFile(img.file_path);
  res.status(204).end();
```

Vor `export default router;` einfügen:
```ts
router.post('/products/:id/usp/points/:pointId/images', (req: Request, res: Response) => {
  const id = Number(req.params.id); const pointId = Number(req.params.pointId);
  if (!Number.isInteger(id) || !Number.isInteger(pointId)) { res.status(404).json({ error: 'not found' }); return; }
  if (!ensureProduct(id) || !loadPointForProduct(id, pointId)) { res.status(404).json({ error: 'not found' }); return; }
  upload.single('file')(req, res, (err: unknown) => {
    if (err) { res.status(400).json({ error: err instanceof Error ? err.message : 'upload failed' }); return; }
    const file = (req as Request & { file?: { filename: string } }).file;
    if (!file) { res.status(400).json({ error: 'no file' }); return; }
    const maxOrder = (db.prepare(`SELECT COALESCE(MAX(sort_order),0) AS m FROM amazon_usp_point_images WHERE point_id = ?`).get(pointId) as { m: number }).m;
    const r = db.prepare(`INSERT INTO amazon_usp_point_images (point_id, sort_order, file_path) VALUES (?, ?, ?)`).run(pointId, maxOrder + 1, file.filename);
    res.status(201).json({ image: db.prepare(`SELECT * FROM amazon_usp_point_images WHERE id = ?`).get(r.lastInsertRowid) as ImageRow });
  });
});

router.patch('/products/:id/usp/points/:pointId/images/reorder', (req: Request, res: Response) => {
  const id = Number(req.params.id); const pointId = Number(req.params.pointId);
  if (!Number.isInteger(id) || !Number.isInteger(pointId)) { res.status(404).json({ error: 'not found' }); return; }
  if (!ensureProduct(id) || !loadPointForProduct(id, pointId)) { res.status(404).json({ error: 'not found' }); return; }
  const order = (req.body as { order?: unknown })?.order;
  if (!Array.isArray(order) || order.some(x => !Number.isInteger(x))) { res.status(400).json({ error: 'invalid order' }); return; }
  const own = db.prepare(`SELECT id FROM amazon_usp_point_images WHERE point_id = ?`).all(pointId) as Array<{ id: number }>;
  const ownIds = new Set(own.map(o => o.id));
  if (order.length !== ownIds.size || order.some((x: number) => !ownIds.has(x))) { res.status(400).json({ error: 'order mismatch' }); return; }
  const upd = db.prepare(`UPDATE amazon_usp_point_images SET sort_order = ? WHERE id = ?`);
  db.transaction(() => { order.forEach((iid: number, idx: number) => upd.run(idx + 1, iid)); })();
  res.json({ images: loadImages(pointId) });
});

router.delete('/products/:id/usp/points/:pointId/images/:imageId', (req: Request, res: Response) => {
  const id = Number(req.params.id); const pointId = Number(req.params.pointId); const imageId = Number(req.params.imageId);
  if (![id, pointId, imageId].every(Number.isInteger) || !ensureProduct(id)) { res.status(404).json({ error: 'not found' }); return; }
  const img = loadImageForProduct(id, pointId, imageId);
  if (!img) { res.status(404).json({ error: 'not found' }); return; }
  db.prepare(`DELETE FROM amazon_usp_point_images WHERE id = ?`).run(imageId);
  deleteUspImageFile(img.file_path);
  res.status(204).end();
});

router.get('/products/:id/usp/images/:imageId', (req: Request, res: Response) => {
  const id = Number(req.params.id); const imageId = Number(req.params.imageId);
  if (!Number.isInteger(id) || !Number.isInteger(imageId) || !ensureProduct(id)) { res.status(404).end(); return; }
  const img = db.prepare(
    `SELECT i.* FROM amazon_usp_point_images i
     JOIN amazon_usp_points p ON p.id = i.point_id
     WHERE i.id = ? AND p.product_id = ?`
  ).get(imageId, id) as ImageRow | undefined;
  if (!img) { res.status(404).end(); return; }
  const abs = path.resolve(UPLOAD_DIR, img.file_path);
  if (!abs.startsWith(path.resolve(UPLOAD_DIR) + path.sep) || !fs.existsSync(abs)) { res.status(404).end(); return; }
  res.setHeader('Content-Type', CONTENT_BY_EXT[path.extname(abs).toLowerCase()] ?? 'application/octet-stream');
  fs.createReadStream(abs).pipe(res);
});
```

- [ ] **Step 4: Tests grün + Typecheck + Commit**

Run: `cd "<repo>/backend" && npx vitest run test/integration.amazon_usp.test.ts && npx tsc --noEmit`
Expected: PASS.
```bash
git add "backend/src/routes/amazon.usp.routes.ts" "backend/test/integration.amazon_usp.test.ts"
git commit -m "feat(amazon-usp): Backend Punkt-Bilder (Upload/Serve/Reorder/Delete) + Tests" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Backend — Hersteller + Feasibility-Matrix

**Files:** Modify `backend/src/routes/amazon.usp.routes.ts`, `backend/test/integration.amazon_usp.test.ts`

- [ ] **Step 1: Tests ergänzen** (neue describe-Suite am Dateiende)

```ts
describe('USP API — Hersteller + Feasibility', () => {
  let db: Database.Database; let app: express.Express;
  beforeEach(async () => { db = createTestDb(); app = await makeApp(db); });

  it('Hersteller CRUD + Reorder', async () => {
    const pid = makeProduct(db);
    await request(app).get(`/api/amazon/products/${pid}/usp`); // default-Hersteller existiert (1)
    const a = await request(app).post(`/api/amazon/products/${pid}/usp/manufacturers`).send({ name: 'Alpha' });
    expect(a.status).toBe(201);
    expect(a.body.manufacturer).toMatchObject({ name: 'Alpha' });
    const p = await request(app).patch(`/api/amazon/products/${pid}/usp/manufacturers/${a.body.manufacturer.id}`).send({ name: 'Alpha2', datum: '2026-06-08', notes: 'X' });
    expect(p.body.manufacturer).toMatchObject({ name: 'Alpha2', datum: '2026-06-08', notes: 'X' });
    const all = await request(app).get(`/api/amazon/products/${pid}/usp`);
    const ids = all.body.manufacturers.map((m: { id: number }) => m.id);
    const ro = await request(app).patch(`/api/amazon/products/${pid}/usp/manufacturers/reorder`).send({ order: [...ids].reverse() });
    expect(ro.status).toBe(200);
    const del = await request(app).delete(`/api/amazon/products/${pid}/usp/manufacturers/${a.body.manufacturer.id}`);
    expect(del.status).toBe(204);
  });

  it('Feasibility Upsert: zweimal selbe Kombi -> eine Zeile, Status aktualisiert', async () => {
    const pid = makeProduct(db);
    await request(app).get(`/api/amazon/products/${pid}/usp`);
    const pt = await request(app).post(`/api/amazon/products/${pid}/usp/points`).send({ title: 'P' });
    const m = await request(app).post(`/api/amazon/products/${pid}/usp/manufacturers`).send({ name: 'M' });
    const f1 = await request(app).put(`/api/amazon/products/${pid}/usp/feasibility`).send({ point_id: pt.body.point.id, manufacturer_id: m.body.manufacturer.id, status: 'umsetzbar', note: 'ok' });
    expect(f1.status).toBe(200);
    expect(f1.body.feasibility).toMatchObject({ status: 'umsetzbar', note: 'ok' });
    const f2 = await request(app).put(`/api/amazon/products/${pid}/usp/feasibility`).send({ point_id: pt.body.point.id, manufacturer_id: m.body.manufacturer.id, status: 'teilweise' });
    expect(f2.body.feasibility.status).toBe('teilweise');
    const c = (db.prepare(`SELECT COUNT(*) AS c FROM amazon_usp_feasibility WHERE point_id=? AND manufacturer_id=?`).get(pt.body.point.id, m.body.manufacturer.id) as { c: number }).c;
    expect(c).toBe(1);
  });

  it('Feasibility: ungueltiger Status -> 400; fremder Punkt/Hersteller -> 404; note>1000 -> 400', async () => {
    const pid = makeProduct(db); const other = makeProduct(db, 'O');
    await request(app).get(`/api/amazon/products/${pid}/usp`);
    await request(app).get(`/api/amazon/products/${other}/usp`);
    const pt = await request(app).post(`/api/amazon/products/${pid}/usp/points`).send({});
    const m = await request(app).post(`/api/amazon/products/${pid}/usp/manufacturers`).send({ name: 'M' });
    const otherPt = await request(app).post(`/api/amazon/products/${other}/usp/points`).send({});
    expect((await request(app).put(`/api/amazon/products/${pid}/usp/feasibility`).send({ point_id: pt.body.point.id, manufacturer_id: m.body.manufacturer.id, status: 'kaputt' })).status).toBe(400);
    expect((await request(app).put(`/api/amazon/products/${pid}/usp/feasibility`).send({ point_id: otherPt.body.point.id, manufacturer_id: m.body.manufacturer.id, status: 'umsetzbar' })).status).toBe(404);
    expect((await request(app).put(`/api/amazon/products/${pid}/usp/feasibility`).send({ point_id: pt.body.point.id, manufacturer_id: m.body.manufacturer.id, note: 'x'.repeat(1001) })).status).toBe(400);
  });

  it('Cascade: Hersteller loeschen entfernt seine Feasibility; Punkt loeschen ebenso', async () => {
    const pid = makeProduct(db);
    await request(app).get(`/api/amazon/products/${pid}/usp`);
    const pt = await request(app).post(`/api/amazon/products/${pid}/usp/points`).send({});
    const m = await request(app).post(`/api/amazon/products/${pid}/usp/manufacturers`).send({ name: 'M' });
    await request(app).put(`/api/amazon/products/${pid}/usp/feasibility`).send({ point_id: pt.body.point.id, manufacturer_id: m.body.manufacturer.id, status: 'umsetzbar' });
    await request(app).delete(`/api/amazon/products/${pid}/usp/manufacturers/${m.body.manufacturer.id}`);
    expect((db.prepare(`SELECT COUNT(*) AS c FROM amazon_usp_feasibility WHERE manufacturer_id=?`).get(m.body.manufacturer.id) as { c: number }).c).toBe(0);
  });

  it('GET liefert feasibility-Liste', async () => {
    const pid = makeProduct(db);
    await request(app).get(`/api/amazon/products/${pid}/usp`);
    const pt = await request(app).post(`/api/amazon/products/${pid}/usp/points`).send({});
    const m = await request(app).post(`/api/amazon/products/${pid}/usp/manufacturers`).send({ name: 'M' });
    await request(app).put(`/api/amazon/products/${pid}/usp/feasibility`).send({ point_id: pt.body.point.id, manufacturer_id: m.body.manufacturer.id, status: 'nicht' });
    const r = await request(app).get(`/api/amazon/products/${pid}/usp`);
    expect(r.body.feasibility).toEqual([expect.objectContaining({ point_id: pt.body.point.id, manufacturer_id: m.body.manufacturer.id, status: 'nicht' })]);
  });
});
```

- [ ] **Step 2: Tests laufen — Hersteller/Feasibility-Routen fehlen → FAIL**

Run: `cd "<repo>/backend" && npx vitest run test/integration.amazon_usp.test.ts 2>&1 | tail -15`
Expected: neue Tests FAIL.

- [ ] **Step 3: Hersteller- + Feasibility-Routen ergänzen** (vor `export default router;`)

```ts
// ── Hersteller ──
router.post('/products/:id/usp/manufacturers', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) { res.status(404).json({ error: 'product not found' }); return; }
  const nameRaw = (req.body as { name?: unknown })?.name;
  let name = '';
  if (nameRaw !== undefined && nameRaw !== null) {
    if (typeof nameRaw !== 'string' || nameRaw.trim().length > MAX_MNAME) { res.status(400).json({ error: 'invalid name' }); return; }
    name = nameRaw.trim();
  }
  const maxOrder = (db.prepare(`SELECT COALESCE(MAX(sort_order),0) AS m FROM amazon_usp_manufacturers WHERE product_id = ?`).get(id) as { m: number }).m;
  const r = db.prepare(`INSERT INTO amazon_usp_manufacturers (product_id, sort_order, name) VALUES (?, ?, ?)`).run(id, maxOrder + 1, name);
  res.status(201).json({ manufacturer: db.prepare(`SELECT * FROM amazon_usp_manufacturers WHERE id = ?`).get(r.lastInsertRowid) as ManufacturerRow });
});

router.patch('/products/:id/usp/manufacturers/:mId', (req: Request, res: Response) => {
  const id = Number(req.params.id); const mId = Number(req.params.mId);
  if (!Number.isInteger(id) || !Number.isInteger(mId)) { res.status(404).json({ error: 'not found' }); return; }
  if (!ensureProduct(id) || !loadManufacturerForProduct(id, mId)) { res.status(404).json({ error: 'not found' }); return; }
  const body = (req.body as Record<string, unknown>) ?? {};
  const updates: string[] = []; const params: unknown[] = [];
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim().length > MAX_MNAME) { res.status(400).json({ error: 'invalid name' }); return; }
    updates.push('name = ?'); params.push(body.name.trim());
  }
  if (body.datum !== undefined) {
    const v = normalizeText(body.datum, MAX_DATUM);
    if (!v.ok) { res.status(400).json({ error: 'invalid datum' }); return; }
    updates.push('datum = ?'); params.push(v.value);
  }
  if (body.notes !== undefined) {
    const v = normalizeText(body.notes, MAX_MNOTES);
    if (!v.ok) { res.status(400).json({ error: 'invalid notes' }); return; }
    updates.push('notes = ?'); params.push(v.value);
  }
  if (updates.length > 0) {
    updates.push('updated_at = unixepoch()'); params.push(mId);
    db.prepare(`UPDATE amazon_usp_manufacturers SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }
  res.json({ manufacturer: db.prepare(`SELECT * FROM amazon_usp_manufacturers WHERE id = ?`).get(mId) as ManufacturerRow });
});

router.patch('/products/:id/usp/manufacturers/reorder', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) { res.status(404).json({ error: 'product not found' }); return; }
  const order = (req.body as { order?: unknown })?.order;
  if (!Array.isArray(order) || order.some(x => !Number.isInteger(x))) { res.status(400).json({ error: 'invalid order' }); return; }
  const own = db.prepare(`SELECT id FROM amazon_usp_manufacturers WHERE product_id = ?`).all(id) as Array<{ id: number }>;
  const ownIds = new Set(own.map(o => o.id));
  if (order.length !== ownIds.size || order.some((x: number) => !ownIds.has(x))) { res.status(400).json({ error: 'order mismatch' }); return; }
  const upd = db.prepare(`UPDATE amazon_usp_manufacturers SET sort_order = ?, updated_at = unixepoch() WHERE id = ?`);
  db.transaction(() => { order.forEach((mid: number, idx: number) => upd.run(idx + 1, mid)); })();
  res.json({ manufacturers: loadManufacturers(id) });
});

router.delete('/products/:id/usp/manufacturers/:mId', (req: Request, res: Response) => {
  const id = Number(req.params.id); const mId = Number(req.params.mId);
  if (!Number.isInteger(id) || !Number.isInteger(mId)) { res.status(404).json({ error: 'not found' }); return; }
  if (!ensureProduct(id) || !loadManufacturerForProduct(id, mId)) { res.status(404).json({ error: 'not found' }); return; }
  db.prepare(`DELETE FROM amazon_usp_manufacturers WHERE id = ?`).run(mId);
  res.status(204).end();
});

// ── Feasibility (Upsert) ──
router.put('/products/:id/usp/feasibility', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) { res.status(404).json({ error: 'product not found' }); return; }
  const body = (req.body as Record<string, unknown>) ?? {};
  const pointId = Number(body.point_id); const mId = Number(body.manufacturer_id);
  if (!Number.isInteger(pointId) || !Number.isInteger(mId)) { res.status(400).json({ error: 'invalid ids' }); return; }
  if (!loadPointForProduct(id, pointId) || !loadManufacturerForProduct(id, mId)) { res.status(404).json({ error: 'not found' }); return; }
  if (body.status !== undefined && (typeof body.status !== 'string' || !VALID_STATUS.has(body.status))) { res.status(400).json({ error: 'invalid status' }); return; }
  let note: string | null | undefined;
  if (body.note !== undefined) {
    const v = normalizeText(body.note, MAX_FNOTE);
    if (!v.ok) { res.status(400).json({ error: 'invalid note' }); return; }
    note = v.value;
  }
  db.prepare(`INSERT OR IGNORE INTO amazon_usp_feasibility (point_id, manufacturer_id) VALUES (?, ?)`).run(pointId, mId);
  const updates: string[] = []; const params: unknown[] = [];
  if (body.status !== undefined) { updates.push('status = ?'); params.push(body.status); }
  if (note !== undefined) { updates.push('note = ?'); params.push(note); }
  if (updates.length > 0) {
    updates.push('updated_at = unixepoch()'); params.push(pointId, mId);
    db.prepare(`UPDATE amazon_usp_feasibility SET ${updates.join(', ')} WHERE point_id = ? AND manufacturer_id = ?`).run(...params);
  }
  res.json({ feasibility: db.prepare(`SELECT * FROM amazon_usp_feasibility WHERE point_id = ? AND manufacturer_id = ?`).get(pointId, mId) as FeasibilityRow });
});
```

- [ ] **Step 4: Tests grün + volle Suite + Commit**

Run: `cd "<repo>/backend" && npx vitest run test/integration.amazon_usp.test.ts && npx vitest run && npx tsc --noEmit`
Expected: alle USP-Tests + volle Suite PASS, tsc PASS.
```bash
git add "backend/src/routes/amazon.usp.routes.ts" "backend/test/integration.amazon_usp.test.ts"
git commit -m "feat(amazon-usp): Backend Hersteller + Feasibility-Matrix + Tests" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Frontend-API — Typen + Funktionen

**Files:** Modify `frontend/src/api/amazon.api.ts`

- [ ] **Step 1: Ans Dateiende anfügen** (Axios-Client-Bezeichner oben in der Datei prüfen — `apiClient` wie `uploadAmazonProductImage`; falls anders, anpassen)

```ts
// ── USP (Phase 1) ─────────────────────────────────────────────────────────────
export interface UspMeta { product_id: number; marke: string | null; hauptfokus: string | null; updated_at: number; }
export interface UspPointImage { id: number; point_id: number; sort_order: number; file_path: string; created_at: number; }
export interface UspPoint { id: number; product_id: number; sort_order: number; title: string; body: string | null; created_at: number; updated_at: number; images: UspPointImage[]; }
export interface UspManufacturer { id: number; product_id: number; sort_order: number; name: string; datum: string | null; notes: string | null; created_at: number; updated_at: number; }
export type UspFeasibilityStatus = 'offen' | 'umsetzbar' | 'teilweise' | 'nicht';
export interface UspFeasibility { id: number; point_id: number; manufacturer_id: number; status: UspFeasibilityStatus; note: string | null; updated_at: number; }
export interface UspPayload { meta: UspMeta; points: UspPoint[]; manufacturers: UspManufacturer[]; feasibility: UspFeasibility[]; }
export type UspMetaPatch = Partial<Pick<UspMeta, 'marke' | 'hauptfokus'>>;
export type UspPointPatch = Partial<Pick<UspPoint, 'title' | 'body'>>;
export type UspManufacturerPatch = Partial<Pick<UspManufacturer, 'name' | 'datum' | 'notes'>>;

export async function fetchUsp(productId: number): Promise<UspPayload> {
  return (await apiClient.get(`/amazon/products/${productId}/usp`)).data as UspPayload;
}
export async function updateUspMeta(productId: number, patch: UspMetaPatch): Promise<UspMeta> {
  return ((await apiClient.patch(`/amazon/products/${productId}/usp`, patch)).data as { meta: UspMeta }).meta;
}
export async function createUspPoint(productId: number, title?: string): Promise<UspPoint> {
  return ((await apiClient.post(`/amazon/products/${productId}/usp/points`, title !== undefined ? { title } : {})).data as { point: UspPoint }).point;
}
export async function updateUspPoint(productId: number, pointId: number, patch: UspPointPatch): Promise<UspPoint> {
  return ((await apiClient.patch(`/amazon/products/${productId}/usp/points/${pointId}`, patch)).data as { point: UspPoint }).point;
}
export async function deleteUspPoint(productId: number, pointId: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${productId}/usp/points/${pointId}`);
}
export async function reorderUspPoints(productId: number, order: number[]): Promise<void> {
  await apiClient.patch(`/amazon/products/${productId}/usp/points/reorder`, { order });
}
export async function uploadUspPointImage(productId: number, pointId: number, file: File): Promise<UspPointImage> {
  const fd = new FormData(); fd.append('file', file);
  return ((await apiClient.post(`/amazon/products/${productId}/usp/points/${pointId}/images`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })).data as { image: UspPointImage }).image;
}
export async function reorderUspPointImages(productId: number, pointId: number, order: number[]): Promise<void> {
  await apiClient.patch(`/amazon/products/${productId}/usp/points/${pointId}/images/reorder`, { order });
}
export async function deleteUspPointImage(productId: number, pointId: number, imageId: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${productId}/usp/points/${pointId}/images/${imageId}`);
}
export async function getUspImageObjectUrl(productId: number, imageId: number): Promise<string> {
  const r = await apiClient.get(`/amazon/products/${productId}/usp/images/${imageId}`, { responseType: 'blob' });
  return URL.createObjectURL(r.data as Blob);
}
export async function createUspManufacturer(productId: number, name?: string): Promise<UspManufacturer> {
  return ((await apiClient.post(`/amazon/products/${productId}/usp/manufacturers`, name !== undefined ? { name } : {})).data as { manufacturer: UspManufacturer }).manufacturer;
}
export async function updateUspManufacturer(productId: number, mId: number, patch: UspManufacturerPatch): Promise<UspManufacturer> {
  return ((await apiClient.patch(`/amazon/products/${productId}/usp/manufacturers/${mId}`, patch)).data as { manufacturer: UspManufacturer }).manufacturer;
}
export async function deleteUspManufacturer(productId: number, mId: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${productId}/usp/manufacturers/${mId}`);
}
export async function reorderUspManufacturers(productId: number, order: number[]): Promise<void> {
  await apiClient.patch(`/amazon/products/${productId}/usp/manufacturers/reorder`, { order });
}
export async function setUspFeasibility(
  productId: number,
  input: { point_id: number; manufacturer_id: number; status?: UspFeasibilityStatus; note?: string | null },
): Promise<UspFeasibility> {
  return ((await apiClient.put(`/amazon/products/${productId}/usp/feasibility`, input)).data as { feasibility: UspFeasibility }).feasibility;
}
```

- [ ] **Step 2: Typecheck + Commit**

Run: `cd "<repo>/frontend" && npx tsc --noEmit`
Expected: PASS.
```bash
git add "frontend/src/api/amazon.api.ts"
git commit -m "feat(amazon-usp): Frontend-API Typen + Funktionen (inkl. Hersteller/Feasibility)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Frontend-Hooks — `useUsp.ts`

**Files:** Create `frontend/src/hooks/amazon/useUsp.ts`

- [ ] **Step 1: Hooks schreiben**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  fetchUsp, updateUspMeta, createUspPoint, updateUspPoint, deleteUspPoint, reorderUspPoints,
  uploadUspPointImage, deleteUspPointImage, reorderUspPointImages,
  createUspManufacturer, updateUspManufacturer, deleteUspManufacturer, reorderUspManufacturers,
  setUspFeasibility,
  type UspMetaPatch, type UspPointPatch, type UspManufacturerPatch, type UspFeasibilityStatus,
} from '../../api/amazon.api';

function key(productId: number) { return ['amazon', 'products', productId, 'usp'] as const; }

export function useUsp(productId: number) {
  return useQuery({ queryKey: key(productId), queryFn: () => fetchUsp(productId) });
}
function inval(productId: number, qc: ReturnType<typeof useQueryClient>) {
  return () => qc.invalidateQueries({ queryKey: key(productId) });
}

export function useUpdateUspMeta(productId: number) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (patch: UspMetaPatch) => updateUspMeta(productId, patch), onSettled: inval(productId, qc) });
}
export function useCreateUspPoint(productId: number) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (title?: string) => createUspPoint(productId, title), onSettled: inval(productId, qc) });
}
export function useUpdateUspPoint(productId: number) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ pointId, patch }: { pointId: number; patch: UspPointPatch }) => updateUspPoint(productId, pointId, patch), onSettled: inval(productId, qc) });
}
export function useDeleteUspPoint(productId: number) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (pointId: number) => deleteUspPoint(productId, pointId), onSettled: inval(productId, qc) });
}
export function useReorderUspPoints(productId: number) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (order: number[]) => reorderUspPoints(productId, order), onSettled: inval(productId, qc) });
}
export function useUploadUspPointImage(productId: number) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ pointId, file }: { pointId: number; file: File }) => uploadUspPointImage(productId, pointId, file), onSettled: inval(productId, qc) });
}
export function useDeleteUspPointImage(productId: number) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ pointId, imageId }: { pointId: number; imageId: number }) => deleteUspPointImage(productId, pointId, imageId), onSettled: inval(productId, qc) });
}
export function useReorderUspPointImages(productId: number) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ pointId, order }: { pointId: number; order: number[] }) => reorderUspPointImages(productId, pointId, order), onSettled: inval(productId, qc) });
}
export function useCreateUspManufacturer(productId: number) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (name?: string) => createUspManufacturer(productId, name), onSettled: inval(productId, qc) });
}
export function useUpdateUspManufacturer(productId: number) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ mId, patch }: { mId: number; patch: UspManufacturerPatch }) => updateUspManufacturer(productId, mId, patch), onSettled: inval(productId, qc) });
}
export function useDeleteUspManufacturer(productId: number) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (mId: number) => deleteUspManufacturer(productId, mId), onSettled: inval(productId, qc) });
}
export function useReorderUspManufacturers(productId: number) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (order: number[]) => reorderUspManufacturers(productId, order), onSettled: inval(productId, qc) });
}
export function useSetUspFeasibility(productId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { point_id: number; manufacturer_id: number; status?: UspFeasibilityStatus; note?: string | null }) => setUspFeasibility(productId, input),
    onSettled: inval(productId, qc),
  });
}
```

- [ ] **Step 2: Typecheck + Commit**

Run: `cd "<repo>/frontend" && npx tsc --noEmit`
Expected: PASS.
```bash
git add "frontend/src/hooks/amazon/useUsp.ts"
git commit -m "feat(amazon-usp): TanStack-Query Hooks (Meta/Punkte/Bilder/Hersteller/Feasibility)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Frontend — Bilder, Lösch-Dialoge

**Files:** Create `frontend/src/components/amazon/usp/UspPointImages.tsx`, `DeleteUspPointDialog.tsx`, `DeleteUspManufacturerDialog.tsx`

**Kontext:** Vorbild Object-URL: `ProductImageLarge` in `AmazonProductDetailPage.tsx`. Vorbild Confirm-Dialog: `DeleteBrandNameDialog.tsx`.

- [ ] **Step 1: `UspPointImages.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { getUspImageObjectUrl, type UspPointImage } from '../../../api/amazon.api';
import { useDeleteUspPointImage } from '../../../hooks/amazon/useUsp';

function Thumb({ productId, image, onDelete }: { productId: number; image: UspPointImage; onDelete: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let revoked = false; let url: string | null = null;
    getUspImageObjectUrl(productId, image.id).then(u => { if (revoked) { URL.revokeObjectURL(u); return; } url = u; setSrc(u); }).catch(() => setSrc(null));
    return () => { revoked = true; if (url) URL.revokeObjectURL(url); };
  }, [productId, image.id]);
  return (
    <div className="relative group" style={{ width: 88, height: 88 }}>
      {src ? <img src={src} alt="" className="w-full h-full object-cover rounded-md" />
           : <div className="w-full h-full rounded-md" style={{ background: 'var(--color-surface-container-low)' }} />}
      <button type="button" onClick={onDelete}
        className="absolute top-1 right-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity px-1"
        style={{ background: 'rgba(0,0,0,0.6)', color: '#fca5a5' }} aria-label="Bild entfernen">
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
      </button>
    </div>
  );
}

export function UspPointImages({ productId, pointId, images }: { productId: number; pointId: number; images: UspPointImage[] }) {
  const del = useDeleteUspPointImage(productId);
  if (images.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {images.map(img => <Thumb key={img.id} productId={productId} image={img} onDelete={() => del.mutate({ pointId, imageId: img.id })} />)}
    </div>
  );
}
```

- [ ] **Step 2: `DeleteUspPointDialog.tsx`**

```tsx
interface Props { pointTitle: string; onConfirm: () => void; onClose: () => void; }
export function DeleteUspPointDialog({ pointTitle, onConfirm, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="rounded-xl p-5 w-[90%] max-w-sm" style={{ background: 'var(--color-surface-container-high)', border: '1px solid rgba(255,255,255,0.08)' }} onClick={(e) => e.stopPropagation()}>
        <p className="mb-4" style={{ color: 'var(--color-on-surface)' }}>„{pointTitle || 'Punkt'}" wird dauerhaft entfernt.</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-md text-sm" style={{ background: 'var(--color-surface-container)', color: 'var(--color-on-surface)' }}>Abbrechen</button>
          <button type="button" onClick={() => { onConfirm(); onClose(); }} className="px-3 py-1.5 rounded-md text-sm" style={{ background: '#7f1d1d', color: '#fecaca' }}>Löschen</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `DeleteUspManufacturerDialog.tsx`** (gleiche Struktur, anderer Text)

```tsx
interface Props { manufacturerName: string; onConfirm: () => void; onClose: () => void; }
export function DeleteUspManufacturerDialog({ manufacturerName, onConfirm, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="rounded-xl p-5 w-[90%] max-w-sm" style={{ background: 'var(--color-surface-container-high)', border: '1px solid rgba(255,255,255,0.08)' }} onClick={(e) => e.stopPropagation()}>
        <p className="mb-4" style={{ color: 'var(--color-on-surface)' }}>Hersteller „{manufacturerName || 'ohne Namen'}" und seine Bewertungen werden entfernt.</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-md text-sm" style={{ background: 'var(--color-surface-container)', color: 'var(--color-on-surface)' }}>Abbrechen</button>
          <button type="button" onClick={() => { onConfirm(); onClose(); }} className="px-3 py-1.5 rounded-md text-sm" style={{ background: '#7f1d1d', color: '#fecaca' }}>Löschen</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck + Commit**

Run: `cd "<repo>/frontend" && npx tsc --noEmit`
Expected: PASS.
```bash
git add "frontend/src/components/amazon/usp/UspPointImages.tsx" "frontend/src/components/amazon/usp/DeleteUspPointDialog.tsx" "frontend/src/components/amazon/usp/DeleteUspManufacturerDialog.tsx"
git commit -m "feat(amazon-usp): Bild-Thumbnails + Loesch-Dialoge" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Frontend — Punkte-Editor (`UspPointRow` + `UspPointList`)

**Files:** Create `frontend/src/components/amazon/usp/UspPointRow.tsx`, `UspPointList.tsx`

**Kontext:** Drag-Reorder native pointer events + `setPointerCapture` (Buttons/Inputs als Ausnahme). Bild-Validierung wie `handlePickFile` in `AmazonProductDetailPage.tsx`.

- [ ] **Step 1: `UspPointRow.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react';
import { type UspPoint } from '../../../api/amazon.api';
import { useUpdateUspPoint, useUploadUspPointImage } from '../../../hooks/amazon/useUsp';
import { UspPointImages } from './UspPointImages';

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

interface Props {
  productId: number; index: number; point: UspPoint;
  onRequestDelete: (p: UspPoint) => void;
  dragHandleProps: React.HTMLAttributes<HTMLDivElement>;
}
export function UspPointRow({ productId, index, point, onRequestDelete, dragHandleProps }: Props) {
  const update = useUpdateUspPoint(productId);
  const uploadImg = useUploadUspPointImage(productId);
  const [title, setTitle] = useState(point.title);
  const [body, setBody] = useState(point.body ?? '');
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  useEffect(() => { setTitle(point.title); }, [point.title]);
  useEffect(() => { setBody(point.body ?? ''); }, [point.body]);
  function pick(file: File | undefined | null) {
    if (!file) return;
    if (!ALLOWED.includes(file.type)) { setError('Nur JPG, PNG oder WEBP.'); return; }
    if (file.size > MAX_BYTES) { setError('Bild ist größer als 5 MB.'); return; }
    setError(null); uploadImg.mutate({ pointId: point.id, file });
  }
  return (
    <div className="rounded-lg p-3" style={{ background: 'var(--color-surface-container)', border: '1px solid rgba(255,255,255,0.06)' }}
      onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files?.[0]); }}>
      <div className="flex items-center gap-2 mb-2">
        <div {...dragHandleProps} className="flex items-center justify-center rounded-md cursor-grab select-none"
          style={{ width: 26, height: 26, background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface-variant)' }} title="Zum Sortieren ziehen">
          <span style={{ fontSize: 12, fontWeight: 700 }}>{index + 1}</span>
        </div>
        <input value={title} onChange={(e) => setTitle(e.target.value)}
          onBlur={() => { if (title !== point.title) update.mutate({ pointId: point.id, patch: { title } }); }}
          placeholder="Titel (z. B. Design & Farbe)" className="flex-1 px-2 py-1.5 rounded-md text-sm"
          style={{ background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }} />
        <button type="button" onClick={() => onRequestDelete(point)} className="p-1.5 rounded-md" style={{ color: '#fca5a5' }} aria-label="Punkt löschen">
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
        </button>
      </div>
      <textarea value={body} onChange={(e) => setBody(e.target.value)}
        onBlur={() => { if (body !== (point.body ?? '')) update.mutate({ pointId: point.id, patch: { body } }); }}
        placeholder="Beschreibung / Anforderungen …" rows={3} className="w-full px-2 py-1.5 rounded-md text-sm"
        style={{ background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)', resize: 'vertical' }} />
      <UspPointImages productId={productId} pointId={point.id} images={point.images} />
      <div className="mt-2">
        <button type="button" onClick={() => fileInput.current?.click()} className="px-2.5 py-1 rounded-md text-xs flex items-center gap-1.5"
          style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add_photo_alternate</span>Bild hinzufügen
        </button>
        <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
          onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
        {error && <p className="text-xs mt-1" style={{ color: '#fca5a5' }}>{error}</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `UspPointList.tsx`** (Drag-Reorder)

```tsx
import { useRef, useState } from 'react';
import { type UspPoint } from '../../../api/amazon.api';
import { useReorderUspPoints } from '../../../hooks/amazon/useUsp';
import { UspPointRow } from './UspPointRow';

export function UspPointList({ productId, points, onRequestDelete }: { productId: number; points: UspPoint[]; onRequestDelete: (p: UspPoint) => void; }) {
  const reorder = useReorderUspPoints(productId);
  const [order, setOrder] = useState<number[] | null>(null);
  const dragIndex = useRef<number | null>(null);
  const ids = order ?? points.map(p => p.id);
  const byId = new Map(points.map(p => [p.id, p]));
  const ordered = ids.map(id => byId.get(id)).filter(Boolean) as UspPoint[];
  function down(idx: number, e: React.PointerEvent<HTMLDivElement>) {
    dragIndex.current = idx; (e.target as HTMLElement).setPointerCapture(e.pointerId);
    if (!order) setOrder(points.map(p => p.id));
  }
  function enter(idx: number) {
    if (dragIndex.current === null || dragIndex.current === idx) return;
    setOrder(prev => {
      const arr = [...(prev ?? points.map(p => p.id))];
      const [m] = arr.splice(dragIndex.current as number, 1); arr.splice(idx, 0, m);
      dragIndex.current = idx; return arr;
    });
  }
  function up() { if (dragIndex.current !== null && order) reorder.mutate(order); dragIndex.current = null; }
  return (
    <div className="flex flex-col gap-2">
      {ordered.map((p, idx) => (
        <UspPointRow key={p.id} productId={productId} index={idx} point={p} onRequestDelete={onRequestDelete}
          dragHandleProps={{ onPointerDown: (e) => down(idx, e), onPointerEnter: () => enter(idx), onPointerUp: up }} />
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + Commit**

Run: `cd "<repo>/frontend" && npx tsc --noEmit`
Expected: PASS.
```bash
git add "frontend/src/components/amazon/usp/UspPointRow.tsx" "frontend/src/components/amazon/usp/UspPointList.tsx"
git commit -m "feat(amazon-usp): Punkte-Editor mit Drag-Reorder" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Frontend — Meta-Formular + Hersteller-Leiste

**Files:** Create `frontend/src/components/amazon/usp/UspMetaForm.tsx`, `UspManufacturers.tsx`

- [ ] **Step 1: `UspMetaForm.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { type UspMeta } from '../../../api/amazon.api';
import { useUpdateUspMeta } from '../../../hooks/amazon/useUsp';

function Field({ label, value, onSave, textarea }: { label: string; value: string; onSave: (v: string) => void; textarea?: boolean }) {
  const [v, setV] = useState(value);
  useEffect(() => { setV(value); }, [value]);
  const common = {
    value: v,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV(e.target.value),
    onBlur: () => { if (v !== value) onSave(v); },
    className: 'w-full px-2 py-1.5 rounded-md text-sm',
    style: { background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' },
  };
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>{label}</span>
      {textarea ? <textarea rows={2} {...common} /> : <input {...common} />}
    </label>
  );
}

export function UspMetaForm({ productId, meta }: { productId: number; meta: UspMeta }) {
  const update = useUpdateUspMeta(productId);
  return (
    <div className="flex flex-col gap-3 mb-4">
      <Field label="Marke" value={meta.marke ?? ''} onSave={(marke) => update.mutate({ marke })} />
      <Field label="Hauptfokus" value={meta.hauptfokus ?? ''} onSave={(hauptfokus) => update.mutate({ hauptfokus })} textarea />
    </div>
  );
}
```

- [ ] **Step 2: `UspManufacturers.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { type UspManufacturer } from '../../../api/amazon.api';
import { useCreateUspManufacturer, useUpdateUspManufacturer, useDeleteUspManufacturer } from '../../../hooks/amazon/useUsp';
import { DeleteUspManufacturerDialog } from './DeleteUspManufacturerDialog';

function ManufacturerCard({ productId, m }: { productId: number; m: UspManufacturer }) {
  const update = useUpdateUspManufacturer(productId);
  const del = useDeleteUspManufacturer(productId);
  const [name, setName] = useState(m.name);
  const [datum, setDatum] = useState(m.datum ?? '');
  const [pendingDelete, setPendingDelete] = useState(false);
  useEffect(() => { setName(m.name); }, [m.name]);
  useEffect(() => { setDatum(m.datum ?? ''); }, [m.datum]);
  return (
    <div className="rounded-lg p-2 flex flex-col gap-1.5" style={{ minWidth: 160, background: 'var(--color-surface-container)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center gap-1">
        <input value={name} onChange={(e) => setName(e.target.value)}
          onBlur={() => { if (name !== m.name) update.mutate({ mId: m.id, patch: { name } }); }}
          placeholder="Hersteller" className="flex-1 px-2 py-1 rounded-md text-sm"
          style={{ background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }} />
        <button type="button" onClick={() => setPendingDelete(true)} className="p-1 rounded-md" style={{ color: '#fca5a5' }} aria-label="Hersteller löschen">
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
        </button>
      </div>
      <input value={datum} onChange={(e) => setDatum(e.target.value)}
        onBlur={() => { if (datum !== (m.datum ?? '')) update.mutate({ mId: m.id, patch: { datum } }); }}
        placeholder="Datum" className="px-2 py-1 rounded-md text-xs"
        style={{ background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface-variant)', border: '1px solid rgba(255,255,255,0.08)' }} />
      {pendingDelete && (
        <DeleteUspManufacturerDialog manufacturerName={m.name} onConfirm={() => del.mutate(m.id)} onClose={() => setPendingDelete(false)} />
      )}
    </div>
  );
}

export function UspManufacturers({ productId, manufacturers }: { productId: number; manufacturers: UspManufacturer[] }) {
  const create = useCreateUspManufacturer(productId);
  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-on-surface-variant)' }}>Hersteller</span>
        <button type="button" onClick={() => create.mutate(undefined)} className="px-2.5 py-1 rounded-md text-xs flex items-center gap-1"
          style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>Hersteller
        </button>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {manufacturers.map(m => <ManufacturerCard key={m.id} productId={productId} m={m} />)}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + Commit**

Run: `cd "<repo>/frontend" && npx tsc --noEmit`
Expected: PASS.
```bash
git add "frontend/src/components/amazon/usp/UspMetaForm.tsx" "frontend/src/components/amazon/usp/UspManufacturers.tsx"
git commit -m "feat(amazon-usp): Meta-Formular + Hersteller-Leiste" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Frontend — Vergleichs-Matrix + Übersicht

**Files:** Create `frontend/src/components/amazon/usp/UspMatrix.tsx`, `UspOverview.tsx`

- [ ] **Step 1: `UspMatrix.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { type UspPoint, type UspManufacturer, type UspFeasibility, type UspFeasibilityStatus } from '../../../api/amazon.api';
import { useSetUspFeasibility } from '../../../hooks/amazon/useUsp';

const STATUSES: { value: Exclude<UspFeasibilityStatus, 'offen'>; label: string; color: string }[] = [
  { value: 'umsetzbar', label: '✓', color: '#34d399' },
  { value: 'teilweise', label: '~', color: '#fdba74' },
  { value: 'nicht', label: '✗', color: '#fca5a5' },
];

function key(pointId: number, mId: number) { return `${pointId}:${mId}`; }

function Cell({ productId, pointId, mId, current, note }: { productId: number; pointId: number; mId: number; current: UspFeasibilityStatus; note: string }) {
  const set = useSetUspFeasibility(productId);
  const [n, setN] = useState(note);
  useEffect(() => { setN(note); }, [note]);
  return (
    <div className="flex flex-col gap-1 p-1" style={{ minWidth: 120 }}>
      <div className="flex gap-1">
        {STATUSES.map(s => {
          const active = current === s.value;
          return (
            <button key={s.value} type="button"
              onClick={() => set.mutate({ point_id: pointId, manufacturer_id: mId, status: active ? 'offen' : s.value })}
              className="flex-1 rounded text-xs py-0.5"
              style={{ background: active ? s.color : 'var(--color-surface-container-low)', color: active ? '#08131f' : 'var(--color-on-surface-variant)', border: '1px solid rgba(255,255,255,0.08)', fontWeight: 700 }}>
              {s.label}
            </button>
          );
        })}
      </div>
      <input value={n} onChange={(e) => setN(e.target.value)}
        onBlur={() => { if (n !== note) set.mutate({ point_id: pointId, manufacturer_id: mId, note: n }); }}
        placeholder="Notiz" className="px-1.5 py-0.5 rounded text-xs"
        style={{ background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface-variant)', border: '1px solid rgba(255,255,255,0.06)' }} />
    </div>
  );
}

export function UspMatrix({ productId, points, manufacturers, feasibility }: {
  productId: number; points: UspPoint[]; manufacturers: UspManufacturer[]; feasibility: UspFeasibility[];
}) {
  if (points.length === 0 || manufacturers.length === 0) return null;
  const map = new Map<string, UspFeasibility>();
  for (const f of feasibility) map.set(key(f.point_id, f.manufacturer_id), f);
  return (
    <div className="mb-4">
      <span className="text-xs uppercase tracking-wide block mb-2" style={{ color: 'var(--color-on-surface-variant)' }}>Vergleich</span>
      <div className="overflow-x-auto">
        <table style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th className="text-left px-2 py-1 text-xs" style={{ color: 'var(--color-on-surface-variant)', position: 'sticky', left: 0, background: 'var(--color-surface-container-low)' }}>Punkt</th>
              {manufacturers.map(m => (
                <th key={m.id} className="px-2 py-1 text-xs" style={{ color: 'var(--color-on-surface)' }}>{m.name || 'Hersteller'}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {points.map((p, idx) => (
              <tr key={p.id} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <td className="px-2 py-1 text-sm" style={{ color: 'var(--color-on-surface)', position: 'sticky', left: 0, background: 'var(--color-surface-container-low)', maxWidth: 200 }}>
                  {idx + 1}. {p.title || '—'}
                </td>
                {manufacturers.map(m => {
                  const f = map.get(key(p.id, m.id));
                  return (
                    <td key={m.id} style={{ verticalAlign: 'top' }}>
                      <Cell productId={productId} pointId={p.id} mId={m.id} current={f?.status ?? 'offen'} note={f?.note ?? ''} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `UspOverview.tsx`**

```tsx
import { type UspPoint, type UspManufacturer, type UspFeasibility } from '../../../api/amazon.api';

function key(pointId: number, mId: number) { return `${pointId}:${mId}`; }

export function UspOverview({ points, manufacturers, feasibility }: {
  points: UspPoint[]; manufacturers: UspManufacturer[]; feasibility: UspFeasibility[];
}) {
  if (points.length === 0 || manufacturers.length === 0) return null;
  const map = new Map<string, string>();
  for (const f of feasibility) map.set(key(f.point_id, f.manufacturer_id), f.status);
  const total = points.length;
  const rows = manufacturers.map(m => {
    let umsetzbar = 0, teilweise = 0, nicht = 0;
    for (const p of points) {
      const s = map.get(key(p.id, m.id)) ?? 'offen';
      if (s === 'umsetzbar') umsetzbar++; else if (s === 'teilweise') teilweise++; else if (s === 'nicht') nicht++;
    }
    return { m, umsetzbar, teilweise, nicht, offen: total - umsetzbar - teilweise - nicht, canAll: umsetzbar === total };
  }).sort((a, b) => b.umsetzbar - a.umsetzbar);

  return (
    <div className="mb-4">
      <span className="text-xs uppercase tracking-wide block mb-2" style={{ color: 'var(--color-on-surface-variant)' }}>Übersicht</span>
      <div className="flex flex-col gap-1">
        {rows.map(r => (
          <div key={r.m.id} className="flex items-center gap-3 rounded-md px-2 py-1 text-sm"
            style={{ background: 'var(--color-surface-container)', border: r.canAll ? '1px solid #34d399' : '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ color: 'var(--color-on-surface)', minWidth: 120 }}>{r.m.name || 'Hersteller'}</span>
            <span style={{ color: '#34d399' }}>{r.umsetzbar} umsetzbar</span>
            <span style={{ color: '#fdba74' }}>{r.teilweise} teilweise</span>
            <span style={{ color: '#fca5a5' }}>{r.nicht} nicht</span>
            <span style={{ color: 'var(--color-on-surface-variant)' }}>{r.offen} offen</span>
            <span style={{ color: 'var(--color-on-surface-variant)', marginLeft: 'auto' }}>von {total}</span>
            {r.canAll && <span style={{ color: '#34d399', fontWeight: 700 }}>kann alles</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + Commit**

Run: `cd "<repo>/frontend" && npx tsc --noEmit`
Expected: PASS.
```bash
git add "frontend/src/components/amazon/usp/UspMatrix.tsx" "frontend/src/components/amazon/usp/UspOverview.tsx"
git commit -m "feat(amazon-usp): Vergleichs-Matrix + Uebersicht" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Frontend — PDF-Export + `UspSection`

**Files:** Create `frontend/src/lib/amazon/exportUspPdf.ts`, `frontend/src/components/amazon/usp/UspSection.tsx`

**Kontext:** Vorbild PDF `exportBrandPdf.ts`; Sektion/Akkordeon `BrandNameSection.tsx`; `SectionHeader`-Props (`icon/title/accent/expanded/onToggleExpand`) gegen die echte Datei prüfen.

- [ ] **Step 1: `exportUspPdf.ts`**

```ts
import jsPDF from 'jspdf';
import { getUspImageObjectUrl, type UspMeta, type UspPoint, type UspManufacturer } from '../../api/amazon.api';

function slug(s: string, max = 40): string {
  return s.normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, max) || 'x';
}
async function loadImage(url: string): Promise<{ dataUrl: string; w: number; h: number }> {
  const blob = await (await fetch(url)).blob();
  const dataUrl: string = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result as string); fr.onerror = rej; fr.readAsDataURL(blob); });
  const dims: { w: number; h: number } = await new Promise((res) => { const im = new Image(); im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight }); im.onerror = () => res({ w: 0, h: 0 }); im.src = dataUrl; });
  return { dataUrl, ...dims };
}

export async function exportUspPdf(
  productId: number, productName: string,
  meta: UspMeta, points: UspPoint[], manufacturer: UspManufacturer,
): Promise<void> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const mX = 40; const contentW = pageW - mX * 2; let y = 50;
  const ensure = (need: number) => { if (y + need > pageH - 50) { doc.addPage(); y = 50; } };

  doc.setFontSize(20); doc.text('PRODUKTANFRAGE', mX, y); y += 22;
  doc.setFontSize(13); doc.setTextColor(60); doc.text(productName, mX, y); y += 20;
  doc.setTextColor(0); doc.setFontSize(10);
  doc.text(`Marke: ${meta.marke ?? '-'}`, mX, y); y += 14;
  doc.text(`Hersteller: ${manufacturer.name || '-'}`, mX, y); y += 14;
  doc.text(`Datum: ${manufacturer.datum ?? '-'}`, mX, y); y += 18;
  if (meta.hauptfokus) {
    doc.setFontSize(12); doc.text('Hauptfokus', mX, y); y += 14; doc.setFontSize(10);
    for (const l of doc.splitTextToSize(meta.hauptfokus, contentW)) { ensure(14); doc.text(l, mX, y); y += 14; }
    y += 6;
  }
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    ensure(20); doc.setFontSize(13); doc.setTextColor(30, 64, 130);
    doc.text(`Punkt ${i + 1} - ${p.title || ''}`, mX, y); y += 16;
    doc.setTextColor(0); doc.setFontSize(10);
    if (p.body) for (const l of doc.splitTextToSize(p.body, contentW)) { ensure(14); doc.text(l, mX, y); y += 14; }
    for (const img of p.images) {
      try {
        const url = await getUspImageObjectUrl(productId, img.id);
        const { dataUrl, w, h } = await loadImage(url); URL.revokeObjectURL(url);
        if (!w || !h) continue;
        const drawW = Math.min(contentW, 320); const drawH = (h / w) * drawW;
        ensure(drawH + 8);
        const fmt = dataUrl.includes('image/png') ? 'PNG' : dataUrl.includes('image/webp') ? 'WEBP' : 'JPEG';
        doc.addImage(dataUrl, fmt, mX, y, drawW, drawH); y += drawH + 8;
      } catch { /* Bild ueberspringen */ }
    }
    y += 8;
  }
  doc.save(`Produktanfrage_${slug(productName)}_${slug(manufacturer.name || 'Hersteller')}_${new Date().toLocaleDateString('en-CA')}.pdf`);
}
```

- [ ] **Step 2: `UspSection.tsx`**

```tsx
import { useState } from 'react';
import { type UspPoint } from '../../../api/amazon.api';
import { useUsp, useCreateUspPoint, useDeleteUspPoint } from '../../../hooks/amazon/useUsp';
import { SectionHeader } from '../SectionHeader';
import { UspMetaForm } from './UspMetaForm';
import { UspPointList } from './UspPointList';
import { UspManufacturers } from './UspManufacturers';
import { UspMatrix } from './UspMatrix';
import { UspOverview } from './UspOverview';
import { DeleteUspPointDialog } from './DeleteUspPointDialog';
import { exportUspPdf } from '../../../lib/amazon/exportUspPdf';

const ACCENT = '#60a5fa';
function expandKey(p: number) { return `amazon.usp.expanded.${p}`; }
function readExpanded(p: number): boolean { try { const v = localStorage.getItem(expandKey(p)); return v === null ? true : v === '1'; } catch { return true; } }

export function UspSection({ productId, productName }: { productId: number; productName: string }) {
  const { data, isLoading, isError, refetch } = useUsp(productId);
  const createPoint = useCreateUspPoint(productId);
  const deletePoint = useDeleteUspPoint(productId);
  const [expanded, setExpanded] = useState(() => readExpanded(productId));
  const [pendingDelete, setPendingDelete] = useState<UspPoint | null>(null);
  const [exportMId, setExportMId] = useState<number | null>(null);

  function toggle() {
    setExpanded(prev => { const next = !prev; try { localStorage.setItem(expandKey(productId), next ? '1' : '0'); } catch { /* ignore */ } return next; });
  }
  async function handleExport() {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    await new Promise(r => setTimeout(r, 350));
    const fresh = await refetch();
    if (!fresh.data) return;
    const m = fresh.data.manufacturers.find(x => x.id === exportMId) ?? fresh.data.manufacturers[0];
    if (!m) return;
    await exportUspPdf(productId, productName, fresh.data.meta, fresh.data.points, m);
  }

  return (
    <section className="rounded-xl" style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <SectionHeader icon="lightbulb" title="USP" accent={ACCENT} expanded={expanded} onToggleExpand={toggle} />
      {expanded && (
        <div className="p-4 pt-0">
          {isLoading && <p style={{ color: 'var(--color-on-surface-variant)' }}>Lade USP …</p>}
          {isError && (
            <div className="flex items-center gap-2">
              <p style={{ color: 'var(--color-on-surface)' }}>USP konnte nicht geladen werden.</p>
              <button type="button" onClick={() => refetch()} className="px-3 py-1.5 rounded-md text-sm" style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)' }}>Erneut laden</button>
            </div>
          )}
          {data && (
            <>
              <UspMetaForm productId={productId} meta={data.meta} />
              <UspPointList productId={productId} points={data.points} onRequestDelete={setPendingDelete} />
              <div className="mt-2 mb-4">
                <button type="button" onClick={() => createPoint.mutate(undefined)} className="px-3 py-1.5 rounded-md text-sm flex items-center gap-1.5"
                  style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>Punkt
                </button>
              </div>
              <UspManufacturers productId={productId} manufacturers={data.manufacturers} />
              <UspMatrix productId={productId} points={data.points} manufacturers={data.manufacturers} feasibility={data.feasibility} />
              <UspOverview points={data.points} manufacturers={data.manufacturers} feasibility={data.feasibility} />
              <div className="flex items-center gap-2">
                <select value={exportMId ?? (data.manufacturers[0]?.id ?? '')} onChange={(e) => setExportMId(Number(e.target.value))}
                  className="px-2 py-1.5 rounded-md text-sm" style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  {data.manufacturers.map(m => <option key={m.id} value={m.id}>{m.name || 'Hersteller'}</option>)}
                </select>
                <button type="button" onClick={handleExport} className="px-3 py-1.5 rounded-md text-sm flex items-center gap-1.5" style={{ background: ACCENT, color: '#08131f' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>picture_as_pdf</span>PDF exportieren
                </button>
              </div>
            </>
          )}
          {pendingDelete && (
            <DeleteUspPointDialog pointTitle={pendingDelete.title} onConfirm={() => deletePoint.mutate(pendingDelete.id)} onClose={() => setPendingDelete(null)} />
          )}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 3: `SectionHeader`-Props prüfen + Typecheck**

Lies `frontend/src/components/amazon/SectionHeader.tsx`; passe `UspSection`-Props an die echte Signatur an, falls nötig.
Run: `cd "<repo>/frontend" && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**
```bash
git add "frontend/src/lib/amazon/exportUspPdf.ts" "frontend/src/components/amazon/usp/UspSection.tsx"
git commit -m "feat(amazon-usp): PDF-Export pro Hersteller + USP-Sektion" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Einbindung + Build

**Files:** Modify `frontend/src/hooks/amazon/useDetailSectionOrder.ts`, `frontend/src/pages/amazon/AmazonProductDetailPage.tsx`

- [ ] **Step 1: `DEFAULT_ORDER` erweitern**

In `frontend/src/hooks/amazon/useDetailSectionOrder.ts` ersetze
```ts
const DEFAULT_ORDER = ['sourcing', 'checklist'] as const;
```
durch
```ts
const DEFAULT_ORDER = ['sourcing', 'checklist', 'usp'] as const;
```

- [ ] **Step 2: USP-Sektion rendern**

In `frontend/src/pages/amazon/AmazonProductDetailPage.tsx` Import ergänzen:
```tsx
import { UspSection } from '../../components/amazon/usp/UspSection';
```
und im `DraggableSectionList`-`render` (vor `return <ChecklistSection …`):
```tsx
              if (id === 'usp') return <UspSection productId={product.id} productName={product.name} />;
```

- [ ] **Step 3: Typecheck + Build**

Run: `cd "<repo>/frontend" && npx tsc --noEmit && npx vite build`
Expected: PASS + Build erfolgreich.

- [ ] **Step 4: Commit**
```bash
git add "frontend/src/hooks/amazon/useDetailSectionOrder.ts" "frontend/src/pages/amazon/AmazonProductDetailPage.tsx"
git commit -m "feat(amazon-usp): USP-Sektion in Produkt-Detailseite einbinden" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Verifikation (UAT)

- [ ] **Step 1:** Backend neu starten (Migration 065 + Auto-Backup im Log). Stale Backend: `lsof -i :3001`, `pkill -f "tsx watch"`, neu starten.
- [ ] **Step 2:** USP-Sektion auf Produktseite (neben Sourcing/Checkliste), sortierbar.
- [ ] **Step 3:** Marke/Hauptfokus → Autosave (bleibt nach Reload).
- [ ] **Step 4:** „+ Punkt", Titel/Text, Bild hochladen (Button + Drag&Drop) → Thumbnail bleibt nach Reload; Punkte per Drag tauschen → bleibt.
- [ ] **Step 5:** 2. Hersteller anlegen + umbenennen.
- [ ] **Step 6:** In der Matrix Status (umsetzbar/teilweise/nicht) + Notiz setzen → bleibt nach Reload.
- [ ] **Step 7:** Übersicht zeigt korrekte Zählung je Hersteller; „kann alles" wenn alle Punkte umsetzbar.
- [ ] **Step 8:** Hersteller löschen → Spalte + dessen Bewertungen weg; Punkte/anderer Hersteller unberührt.
- [ ] **Step 9:** Hersteller im Dropdown wählen → „PDF exportieren" → „Produktanfrage_…pdf" mit Kopf + nummerierten Punkten + Bildern; **keine** Machbarkeit im PDF.
- [ ] **Step 10:** Abschluss; bei Abweichung → systematic-debugging.

---

## Self-Review

**Spec coverage:** Migration 5 Tabellen → T1 ✅ · Meta+Punkte+Reorder → T2 ✅ · Bilder → T3 ✅ · Hersteller+Feasibility → T4 ✅ · API → T5 ✅ · Hooks → T6 ✅ · Bilder/Dialoge → T7 ✅ · Punkte-Editor → T8 ✅ · Meta-Form+Hersteller-Leiste → T9 ✅ · Matrix+Übersicht → T10 ✅ · PDF+Sektion → T11 ✅ · Einbindung → T12 ✅ · UAT → T13 ✅. Datensicherheit (additiv, Auto-Backup) → T1.

**Placeholder scan:** keine TBD/TODO; jeder Code-Schritt vollständig. Bild-Reorder per Drag in Phase 1 bewusst weggelassen (Anzeige folgt Backend-`sort_order`) — als bewusste Entscheidung markiert, nicht als Lücke.

**Type consistency:** `UspMeta/UspPoint/UspPointImage/UspManufacturer/UspFeasibility/UspPayload` einheitlich über API (T5), Hooks (T6), Komponenten (T7–11). Endpunkt-Pfade identisch Backend (T2–4) ↔ API (T5). Feasibility-Status-Enum `offen|umsetzbar|teilweise|nicht` konsistent (Backend CHECK, FE-Typ, Matrix-Buttons, Übersicht-Zählung). `SectionHeader`- und `apiClient`-Bezeichner werden in T11/T5 gegen echten Code verifiziert.
