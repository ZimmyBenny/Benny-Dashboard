# Amazon ECO-Dashboard — Implementation Plan (Schritt 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Übersichts-Seite für Produktentwicklung im Amazon-Reiter mit Kanban-artigen Status-Spalten (Interessant / Aktiv / Bestehend / Verworfen), Anlegen via Dialog (Name + optionales Bild), Status-Wechsel per Dropdown auf der Karte, hartes Löschen mit Confirm.

**Architecture:** Neue SQLite-Tabelle `amazon_products` in der bestehenden `dashboard.db`. Backend-Route-Datei `amazon.products.routes.ts` unter `/api/amazon` mit JWT-Schutz. Bilder via `multer` Disk-Storage in `~/.local/share/benny-dashboard/amazon-products/` (außerhalb iCloud) und auth-geschütztem Streaming-Endpoint. Frontend ersetzt den bisherigen Placeholder unter `/amazon` durch eine TanStack-Query-getriebene Übersichts-Seite mit fokussierten Komponenten.

**Tech Stack:** better-sqlite3 11.x, Express 5.x, multer 2.x, vitest 2.x (Backend) — React 19, TanStack Query 5.x, axios, Tailwind v4 mit Electric-Noir-Tokens, react-dropzone, material-symbols (Frontend).

**Spec:** `docs/superpowers/specs/2026-06-01-amazon-eco-dashboard-design.md`

---

## Datei-Übersicht

| Pfad | Zweck |
|------|-------|
| `backend/src/db/migrations/057_amazon_products.sql` | Tabelle + Index |
| `backend/test/schema.amazon_products.test.ts` | Schema-Test der Migration |
| `backend/src/routes/amazon.products.routes.ts` | CRUD + Image-Endpoints |
| `backend/test/integration.amazon_products.test.ts` | Integrationstest der Routes |
| `backend/src/app.ts` | Routen-Mount unter `/api/amazon` |
| `frontend/src/api/amazon.api.ts` | typisierter axios-Wrapper |
| `frontend/src/hooks/amazon/useAmazonProducts.ts` | TanStack-Query-Hook |
| `frontend/src/pages/amazon/AmazonOverviewPage.tsx` | Page-Container, UI-State |
| `frontend/src/components/amazon/ProductBoard.tsx` | 3- bzw. 4-Spalten-Layout |
| `frontend/src/components/amazon/ProductColumn.tsx` | Spalten-Header + Karten-Liste |
| `frontend/src/components/amazon/ProductCard.tsx` | Einzelne Karte |
| `frontend/src/components/amazon/ProductStatusBadge.tsx` | Klickbares Badge mit Dropdown |
| `frontend/src/components/amazon/NewProductDialog.tsx` | Anlege-Modal |
| `frontend/src/components/amazon/DiscardedToggleButton.tsx` | "Verworfene einblenden"-Pille |
| `frontend/src/components/amazon/DeleteProductDialog.tsx` | Confirm-Modal vor Hard-Delete |
| `frontend/src/routes/routes.tsx` | Route `/amazon` weiterhin, Page-Import austauschen |
| `frontend/src/pages/AmazonPage.tsx` | Wird durch `AmazonOverviewPage` ersetzt — alte Datei wird gelöscht |

---

## Task 1: Migration — Tabelle `amazon_products`

**Files:**
- Create: `backend/src/db/migrations/057_amazon_products.sql`
- Create: `backend/test/schema.amazon_products.test.ts`

- [ ] **Step 1: Schema-Test schreiben (RED)**

Datei `backend/test/schema.amazon_products.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from './setup';

interface SqliteMaster { name: string; type: string; }
interface ColumnInfo { name: string; type: string; notnull: number; dflt_value: string | null; pk: number; }
interface IndexInfo { name: string; }

describe('Migration 057 — amazon_products', () => {
  let db: Database.Database;
  beforeEach(() => { db = createTestDb(); });

  it('erstellt Tabelle amazon_products', () => {
    const row = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='amazon_products'`
    ).get() as SqliteMaster | undefined;
    expect(row).toBeDefined();
  });

  it('hat alle Pflichtspalten in korrekten Typen', () => {
    const cols = db.prepare(`PRAGMA table_info(amazon_products)`).all() as ColumnInfo[];
    const byName = Object.fromEntries(cols.map(c => [c.name, c]));

    expect(byName.id?.pk).toBe(1);
    expect(byName.name?.notnull).toBe(1);
    expect(byName.status?.notnull).toBe(1);
    expect(byName.status?.dflt_value).toContain("'interessant'");
    expect(byName.image_path?.notnull).toBe(0);
    expect(byName.created_at?.type.toUpperCase()).toBe('INTEGER');
    expect(byName.updated_at?.type.toUpperCase()).toBe('INTEGER');
  });

  it('Status-CHECK weist ungueltige Werte ab', () => {
    const insert = db.prepare(`INSERT INTO amazon_products (name, status) VALUES (?, ?)`);
    expect(() => insert.run('Test', 'kaputt')).toThrow();
    expect(() => insert.run('Test', 'interessant')).not.toThrow();
    expect(() => insert.run('Test', 'aktiv')).not.toThrow();
    expect(() => insert.run('Test', 'bestehend')).not.toThrow();
    expect(() => insert.run('Test', 'verworfen')).not.toThrow();
  });

  it('hat Index amazon_products_status_idx', () => {
    const row = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='index' AND name='amazon_products_status_idx'`
    ).get() as IndexInfo | undefined;
    expect(row).toBeDefined();
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fail bestaetigen**

```bash
cd backend && npm test -- schema.amazon_products
```
Erwartet: alle 4 Tests **FAIL** (Tabelle existiert nicht).

- [ ] **Step 3: Migration schreiben (GREEN)**

Datei `backend/src/db/migrations/057_amazon_products.sql`:

```sql
-- Migration 057: Amazon ECO-Dashboard — Produkt-Tabelle (2026-06-01)
-- WICHTIG: Kein FK-Pragma setzen — wird zentral in migrate.ts gesteuert
-- WICHTIG: Auto-Backup laeuft via migrate.ts vor Anwendung

CREATE TABLE amazon_products (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT    NOT NULL,
  status       TEXT    NOT NULL DEFAULT 'interessant'
                       CHECK (status IN ('interessant','aktiv','bestehend','verworfen')),
  image_path   TEXT,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX amazon_products_status_idx
  ON amazon_products (status, created_at DESC);
```

- [ ] **Step 4: Tests laufen lassen, alle gruen**

```bash
cd backend && npm test -- schema.amazon_products
```
Erwartet: alle 4 Tests **PASS**.

- [ ] **Step 5: Commit**

```bash
git add backend/src/db/migrations/057_amazon_products.sql backend/test/schema.amazon_products.test.ts
git commit -m "feat(amazon): Migration 057 — amazon_products Tabelle"
```

---

## Task 2: Backend — CRUD-Routes (ohne Bild)

**Files:**
- Create: `backend/src/routes/amazon.products.routes.ts`
- Modify: `backend/src/app.ts` (Mount hinzufügen)
- Create: `backend/test/integration.amazon_products.test.ts`

- [ ] **Step 1: Integration-Tests fuer CRUD schreiben (RED)**

Datei `backend/test/integration.amazon_products.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type Database from 'better-sqlite3';
import { createTestDb } from './setup';

// Wir mocken das echte DB-Modul, damit die Route gegen unsere :memory:-DB laeuft
vi.mock('../src/db/connection', () => {
  const mod: { default: Database.Database | null } = { default: null };
  return mod;
});

// Hilfs-App: nur die Amazon-Route mounten, ohne JWT-Guard (Test-Konvention)
async function makeApp(db: Database.Database) {
  const conn = await import('../src/db/connection');
  // @ts-expect-error — wir setzen das default-Export der gemockten DB-Datei
  conn.default = db;
  const routes = (await import('../src/routes/amazon.products.routes')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/amazon', routes);
  return app;
}

describe('Amazon Products API — CRUD', () => {
  let db: Database.Database;
  let app: express.Express;

  beforeEach(async () => {
    db = createTestDb();
    app = await makeApp(db);
  });

  it('POST /products legt Produkt mit Default-Status an', async () => {
    const r = await request(app).post('/api/amazon/products').send({ name: 'Test-Produkt' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ name: 'Test-Produkt', status: 'interessant', image_path: null });
    expect(typeof r.body.id).toBe('number');
  });

  it('POST /products weist leeren Namen ab', async () => {
    const r = await request(app).post('/api/amazon/products').send({ name: '   ' });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/name/i);
  });

  it('POST /products weist 201-Zeichen-Namen ab', async () => {
    const r = await request(app).post('/api/amazon/products').send({ name: 'x'.repeat(201) });
    expect(r.status).toBe(400);
  });

  it('GET /products listet sortiert created_at DESC, ohne verworfene', async () => {
    db.prepare(`INSERT INTO amazon_products (name, status, created_at) VALUES (?,?,?)`).run('A', 'interessant', 100);
    db.prepare(`INSERT INTO amazon_products (name, status, created_at) VALUES (?,?,?)`).run('B', 'verworfen', 200);
    db.prepare(`INSERT INTO amazon_products (name, status, created_at) VALUES (?,?,?)`).run('C', 'aktiv', 300);

    const r = await request(app).get('/api/amazon/products');
    expect(r.status).toBe(200);
    expect(r.body.map((p: { name: string }) => p.name)).toEqual(['C', 'A']);
  });

  it('GET /products?include_discarded=true liefert verworfene mit', async () => {
    db.prepare(`INSERT INTO amazon_products (name, status, created_at) VALUES (?,?,?)`).run('A', 'interessant', 100);
    db.prepare(`INSERT INTO amazon_products (name, status, created_at) VALUES (?,?,?)`).run('B', 'verworfen', 200);

    const r = await request(app).get('/api/amazon/products?include_discarded=true');
    expect(r.body.map((p: { name: string }) => p.name)).toEqual(['B', 'A']);
  });

  it('PATCH /:id aendert Status', async () => {
    const ins = db.prepare(`INSERT INTO amazon_products (name) VALUES ('X')`).run();
    const id = Number(ins.lastInsertRowid);

    const r = await request(app).patch(`/api/amazon/products/${id}`).send({ status: 'aktiv' });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('aktiv');
  });

  it('PATCH /:id weist ungueltigen Status ab', async () => {
    const ins = db.prepare(`INSERT INTO amazon_products (name) VALUES ('X')`).run();
    const id = Number(ins.lastInsertRowid);

    const r = await request(app).patch(`/api/amazon/products/${id}`).send({ status: 'kaputt' });
    expect(r.status).toBe(400);
  });

  it('DELETE /:id entfernt Produkt', async () => {
    const ins = db.prepare(`INSERT INTO amazon_products (name) VALUES ('X')`).run();
    const id = Number(ins.lastInsertRowid);

    const r = await request(app).delete(`/api/amazon/products/${id}`);
    expect(r.status).toBe(204);

    const row = db.prepare(`SELECT * FROM amazon_products WHERE id=?`).get(id);
    expect(row).toBeUndefined();
  });
});
```

- [ ] **Step 2: supertest-Dependency pruefen / installieren**

```bash
cd backend && node -e "require('supertest')" 2>/dev/null && echo "✓ vorhanden" || npm install --save-dev supertest @types/supertest
```
Erwartet: entweder `✓ vorhanden`, oder Installation läuft durch.

- [ ] **Step 3: Tests laufen lassen, Fail bestaetigen**

```bash
cd backend && npm test -- integration.amazon_products
```
Erwartet: alle Tests **FAIL** (Route existiert nicht).

- [ ] **Step 4: Route-Datei schreiben (GREEN)**

Datei `backend/src/routes/amazon.products.routes.ts`:

```ts
import { Router, type Request, type Response } from 'express';
import db from '../db/connection';

const router = Router();

type Status = 'interessant' | 'aktiv' | 'bestehend' | 'verworfen';
const VALID_STATUS: ReadonlySet<Status> = new Set(['interessant', 'aktiv', 'bestehend', 'verworfen']);
const MAX_NAME_LEN = 200;

interface ProductRow {
  id: number;
  name: string;
  status: Status;
  image_path: string | null;
  created_at: number;
  updated_at: number;
}

function validateName(raw: unknown): { ok: true; value: string } | { ok: false } {
  if (typeof raw !== 'string') return { ok: false };
  const trimmed = raw.trim();
  if (trimmed.length < 1 || trimmed.length > MAX_NAME_LEN) return { ok: false };
  return { ok: true, value: trimmed };
}

// GET /api/amazon/products?include_discarded=true|false
router.get('/products', (req: Request, res: Response) => {
  const includeDiscarded = String(req.query.include_discarded) === 'true';
  const sql = includeDiscarded
    ? `SELECT * FROM amazon_products ORDER BY created_at DESC, id DESC`
    : `SELECT * FROM amazon_products WHERE status != 'verworfen' ORDER BY created_at DESC, id DESC`;
  res.json(db.prepare(sql).all());
});

// POST /api/amazon/products
router.post('/products', (req: Request, res: Response) => {
  const name = validateName((req.body as { name?: unknown })?.name);
  if (!name.ok) { res.status(400).json({ error: 'name length invalid' }); return; }

  const result = db.prepare(
    `INSERT INTO amazon_products (name) VALUES (?)`
  ).run(name.value);
  const row = db.prepare(`SELECT * FROM amazon_products WHERE id = ?`).get(result.lastInsertRowid) as ProductRow;
  res.status(201).json(row);
});

// PATCH /api/amazon/products/:id
router.patch('/products/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: 'invalid id' }); return; }

  const existing = db.prepare(`SELECT * FROM amazon_products WHERE id = ?`).get(id) as ProductRow | undefined;
  if (!existing) { res.status(404).json({ error: 'not found' }); return; }

  const body = (req.body as { name?: unknown; status?: unknown }) ?? {};
  const updates: string[] = [];
  const params: unknown[] = [];

  if (body.name !== undefined) {
    const name = validateName(body.name);
    if (!name.ok) { res.status(400).json({ error: 'name length invalid' }); return; }
    updates.push('name = ?');
    params.push(name.value);
  }
  if (body.status !== undefined) {
    if (typeof body.status !== 'string' || !VALID_STATUS.has(body.status as Status)) {
      res.status(400).json({ error: 'invalid status' });
      return;
    }
    updates.push('status = ?');
    params.push(body.status);
  }

  if (updates.length === 0) { res.json(existing); return; }

  updates.push('updated_at = unixepoch()');
  params.push(id);
  db.prepare(`UPDATE amazon_products SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  const row = db.prepare(`SELECT * FROM amazon_products WHERE id = ?`).get(id) as ProductRow;
  res.json(row);
});

// DELETE /api/amazon/products/:id
router.delete('/products/:id', (_req: Request, res: Response) => {
  const id = Number(_req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: 'invalid id' }); return; }
  // Bild-Cleanup folgt in Task 3 (gleicher Handler wird dort erweitert).
  db.prepare(`DELETE FROM amazon_products WHERE id = ?`).run(id);
  res.status(204).end();
});

export default router;
```

- [ ] **Step 5: Tests laufen lassen, alle gruen**

```bash
cd backend && npm test -- integration.amazon_products
```
Erwartet: alle CRUD-Tests **PASS**.

- [ ] **Step 6: Route in app.ts mounten**

In `backend/src/app.ts` zwei Edits:

(a) Import-Block oben ergänzen — nach der `reviewsRoutes`-Zeile:

```ts
import amazonProductsRoutes from './routes/amazon.products.routes';
```

(b) Mount-Block — nach `app.use('/api/finance/reviews', reviewsRoutes);`:

```ts
app.use('/api/amazon', amazonProductsRoutes);
```

- [ ] **Step 7: Backend starten und manuell pruefen**

```bash
cd backend && pkill -f "tsx watch" 2>/dev/null; sleep 1; npm run dev &
sleep 3
curl -s http://localhost:3001/api/health
```
Erwartet: `{"status":"ok"}` — Backend laeuft. Anschliessend mit `pkill -f "tsx watch"` wieder stoppen, der Dev-Loop-Watcher uebernimmt im naechsten Schritt.

- [ ] **Step 8: Commit**

```bash
git add backend/src/routes/amazon.products.routes.ts backend/src/app.ts backend/test/integration.amazon_products.test.ts backend/package.json backend/package-lock.json 2>/dev/null
git commit -m "feat(amazon): CRUD-Routes fuer Produkte (list/create/patch/delete)"
```

---

## Task 3: Backend — Bild-Endpoints (Upload / Serve / Delete)

**Files:**
- Modify: `backend/src/routes/amazon.products.routes.ts`
- Modify: `backend/test/integration.amazon_products.test.ts` (Tests anhängen)

- [ ] **Step 1: Tests fuer Bild-Endpoints schreiben (RED)**

Im selben Test-File `integration.amazon_products.test.ts`, an Ende anhängen (vor dem schließenden `});` des `describe`-Blocks, alternativ neuer `describe`-Block):

```ts
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Amazon Products API — Bilder', () => {
  let db: Database.Database;
  let app: express.Express;
  const UPLOAD_DIR = path.join(os.homedir(), '.local', 'share', 'benny-dashboard', 'amazon-products');

  beforeEach(async () => {
    db = createTestDb();
    app = await makeApp(db);
    // Wir loeschen NICHT den ganzen Upload-Ordner (er kann Produktivdaten enthalten),
    // sondern arbeiten nur mit Dateinamen, die wir gleich pruefen.
    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  });

  function makePngBuffer(): Buffer {
    // 1x1 PNG (kleinster gueltiger PNG-Header)
    return Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a4944415478da6300010000000500010d0a2db40000000049454e44ae426082',
      'hex'
    );
  }

  it('POST /:id/image speichert Datei und setzt image_path', async () => {
    const ins = db.prepare(`INSERT INTO amazon_products (name) VALUES ('X')`).run();
    const id = Number(ins.lastInsertRowid);

    const r = await request(app)
      .post(`/api/amazon/products/${id}/image`)
      .attach('file', makePngBuffer(), { filename: 'test.png', contentType: 'image/png' });

    expect(r.status).toBe(200);
    expect(r.body.image_path).toMatch(/\.png$/);

    const row = db.prepare(`SELECT image_path FROM amazon_products WHERE id=?`).get(id) as { image_path: string };
    expect(row.image_path).toBe(r.body.image_path);
    expect(fs.existsSync(path.join(UPLOAD_DIR, row.image_path))).toBe(true);

    // Cleanup
    fs.unlinkSync(path.join(UPLOAD_DIR, row.image_path));
  });

  it('POST /:id/image entfernt vorheriges Bild', async () => {
    const ins = db.prepare(`INSERT INTO amazon_products (name) VALUES ('X')`).run();
    const id = Number(ins.lastInsertRowid);

    const r1 = await request(app).post(`/api/amazon/products/${id}/image`)
      .attach('file', makePngBuffer(), { filename: 'a.png', contentType: 'image/png' });
    const oldPath = path.join(UPLOAD_DIR, r1.body.image_path);

    const r2 = await request(app).post(`/api/amazon/products/${id}/image`)
      .attach('file', makePngBuffer(), { filename: 'b.png', contentType: 'image/png' });

    expect(fs.existsSync(oldPath)).toBe(false);
    expect(fs.existsSync(path.join(UPLOAD_DIR, r2.body.image_path))).toBe(true);

    fs.unlinkSync(path.join(UPLOAD_DIR, r2.body.image_path));
  });

  it('POST /:id/image weist falschen MIME-Type ab', async () => {
    const ins = db.prepare(`INSERT INTO amazon_products (name) VALUES ('X')`).run();
    const id = Number(ins.lastInsertRowid);

    const r = await request(app).post(`/api/amazon/products/${id}/image`)
      .attach('file', Buffer.from('nope'), { filename: 'evil.txt', contentType: 'text/plain' });

    expect(r.status).toBe(400);
  });

  it('GET /:id/image streamt Bild mit Content-Type', async () => {
    const ins = db.prepare(`INSERT INTO amazon_products (name) VALUES ('X')`).run();
    const id = Number(ins.lastInsertRowid);

    const up = await request(app).post(`/api/amazon/products/${id}/image`)
      .attach('file', makePngBuffer(), { filename: 'x.png', contentType: 'image/png' });

    const r = await request(app).get(`/api/amazon/products/${id}/image`);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toBe('image/png');
    expect(r.body.length).toBeGreaterThan(0);

    fs.unlinkSync(path.join(UPLOAD_DIR, up.body.image_path));
  });

  it('GET /:id/image gibt 404 ohne Bild', async () => {
    const ins = db.prepare(`INSERT INTO amazon_products (name) VALUES ('X')`).run();
    const id = Number(ins.lastInsertRowid);

    const r = await request(app).get(`/api/amazon/products/${id}/image`);
    expect(r.status).toBe(404);
  });

  it('DELETE /:id/image entfernt Datei und setzt image_path null', async () => {
    const ins = db.prepare(`INSERT INTO amazon_products (name) VALUES ('X')`).run();
    const id = Number(ins.lastInsertRowid);

    const up = await request(app).post(`/api/amazon/products/${id}/image`)
      .attach('file', makePngBuffer(), { filename: 'x.png', contentType: 'image/png' });
    const filePath = path.join(UPLOAD_DIR, up.body.image_path);

    const r = await request(app).delete(`/api/amazon/products/${id}/image`);
    expect(r.status).toBe(204);
    expect(fs.existsSync(filePath)).toBe(false);

    const row = db.prepare(`SELECT image_path FROM amazon_products WHERE id=?`).get(id) as { image_path: string | null };
    expect(row.image_path).toBeNull();
  });

  it('DELETE /:id loescht auch zugehoeriges Bild', async () => {
    const ins = db.prepare(`INSERT INTO amazon_products (name) VALUES ('X')`).run();
    const id = Number(ins.lastInsertRowid);

    const up = await request(app).post(`/api/amazon/products/${id}/image`)
      .attach('file', makePngBuffer(), { filename: 'x.png', contentType: 'image/png' });
    const filePath = path.join(UPLOAD_DIR, up.body.image_path);

    await request(app).delete(`/api/amazon/products/${id}`);
    expect(fs.existsSync(filePath)).toBe(false);
  });
});
```

- [ ] **Step 2: Tests laufen lassen, alle Bild-Tests rot**

```bash
cd backend && npm test -- integration.amazon_products
```
Erwartet: CRUD-Tests **PASS**, Bild-Tests **FAIL**.

- [ ] **Step 3: Route-Datei um Bild-Endpoints erweitern (GREEN)**

Am Anfang von `backend/src/routes/amazon.products.routes.ts` ergänzen (über `const router = Router();`):

```ts
import multer from 'multer';
import path from 'path';
import os from 'os';
import fs from 'fs';
import crypto from 'crypto';

const UPLOAD_DIR = path.join(os.homedir(), '.local', 'share', 'benny-dashboard', 'amazon-products');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png':  '.png',
  'image/webp': '.webp',
};

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = EXT_BY_MIME[file.mimetype];
      if (!ext) return cb(new Error('mime not allowed'), '');
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) return cb(new Error('mime not allowed'));
    cb(null, true);
  },
});

function deleteImageFile(filename: string | null | undefined) {
  if (!filename) return;
  const abs = path.resolve(UPLOAD_DIR, filename);
  if (!abs.startsWith(path.resolve(UPLOAD_DIR) + path.sep)) return; // Path-Traversal-Schutz
  try { fs.unlinkSync(abs); } catch { /* schon weg, egal */ }
}
```

Nach den bestehenden CRUD-Handlern, **vor** `export default router;`, einfügen:

```ts
// POST /api/amazon/products/:id/image — Bild hochladen / ersetzen
router.post('/products/:id/image', (req: Request, res: Response, next) => {
  upload.single('file')(req, res, (err: unknown) => {
    if (err) {
      const msg = err instanceof Error ? err.message : 'upload failed';
      res.status(400).json({ error: msg });
      return;
    }
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) { res.status(400).json({ error: 'invalid id' }); return; }
    const file = (req as Request & { file?: Express.Multer.File }).file;
    if (!file) { res.status(400).json({ error: 'no file' }); return; }

    const existing = db.prepare(`SELECT image_path FROM amazon_products WHERE id=?`).get(id) as { image_path: string | null } | undefined;
    if (!existing) {
      // Datei wurde schon abgelegt — wegräumen
      deleteImageFile(file.filename);
      res.status(404).json({ error: 'not found' });
      return;
    }

    deleteImageFile(existing.image_path);
    db.prepare(`UPDATE amazon_products SET image_path = ?, updated_at = unixepoch() WHERE id = ?`)
      .run(file.filename, id);
    res.json({ image_path: file.filename });
    next; // keine Wirkung — Express 5 propagiert ohnehin
  });
});

// GET /api/amazon/products/:id/image — Bild streamen
router.get('/products/:id/image', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: 'invalid id' }); return; }
  const row = db.prepare(`SELECT image_path FROM amazon_products WHERE id=?`).get(id) as { image_path: string | null } | undefined;
  if (!row || !row.image_path) { res.status(404).json({ error: 'no image' }); return; }

  const abs = path.resolve(UPLOAD_DIR, row.image_path);
  if (!abs.startsWith(path.resolve(UPLOAD_DIR) + path.sep) || !fs.existsSync(abs)) {
    res.status(404).json({ error: 'file missing' });
    return;
  }

  const ext = path.extname(abs).toLowerCase();
  const contentType =
    ext === '.png'  ? 'image/png'  :
    ext === '.webp' ? 'image/webp' :
    'image/jpeg';
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'private, max-age=300');
  fs.createReadStream(abs).pipe(res);
});

// DELETE /api/amazon/products/:id/image
router.delete('/products/:id/image', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: 'invalid id' }); return; }
  const row = db.prepare(`SELECT image_path FROM amazon_products WHERE id=?`).get(id) as { image_path: string | null } | undefined;
  if (!row) { res.status(404).json({ error: 'not found' }); return; }
  deleteImageFile(row.image_path);
  db.prepare(`UPDATE amazon_products SET image_path = NULL, updated_at = unixepoch() WHERE id=?`).run(id);
  res.status(204).end();
});
```

Außerdem den bestehenden DELETE-`/products/:id`-Handler erweitern: vor dem `DELETE FROM amazon_products` die Bilddatei löschen. Aktueller Handler ist:

```ts
router.delete('/products/:id', (_req: Request, res: Response) => {
  const id = Number(_req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: 'invalid id' }); return; }
  // Bild-Cleanup folgt in Task 3 (gleicher Handler wird dort erweitert).
  db.prepare(`DELETE FROM amazon_products WHERE id = ?`).run(id);
  res.status(204).end();
});
```

Ersetzen durch:

```ts
router.delete('/products/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: 'invalid id' }); return; }
  const row = db.prepare(`SELECT image_path FROM amazon_products WHERE id=?`).get(id) as { image_path: string | null } | undefined;
  if (row) deleteImageFile(row.image_path);
  db.prepare(`DELETE FROM amazon_products WHERE id = ?`).run(id);
  res.status(204).end();
});
```

- [ ] **Step 4: Tests laufen lassen, alle gruen**

```bash
cd backend && npm test -- integration.amazon_products
```
Erwartet: **alle** Tests (CRUD + Bilder) **PASS**.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/amazon.products.routes.ts backend/test/integration.amazon_products.test.ts
git commit -m "feat(amazon): Bild-Upload/Serve/Delete fuer Produkte"
```

---

## Task 4: Frontend — API-Client + Types

**Files:**
- Create: `frontend/src/api/amazon.api.ts`

- [ ] **Step 1: API-Client schreiben**

Datei `frontend/src/api/amazon.api.ts`:

```ts
import apiClient from './client';

export type AmazonProductStatus = 'interessant' | 'aktiv' | 'bestehend' | 'verworfen';

export interface AmazonProduct {
  id: number;
  name: string;
  status: AmazonProductStatus;
  image_path: string | null;
  created_at: number; // unix seconds
  updated_at: number;
}

export async function fetchAmazonProducts(includeDiscarded: boolean): Promise<AmazonProduct[]> {
  const r = await apiClient.get<AmazonProduct[]>('/amazon/products', {
    params: { include_discarded: includeDiscarded ? 'true' : 'false' },
  });
  return r.data;
}

export async function createAmazonProduct(name: string): Promise<AmazonProduct> {
  const r = await apiClient.post<AmazonProduct>('/amazon/products', { name });
  return r.data;
}

export async function updateAmazonProduct(
  id: number,
  patch: Partial<{ name: string; status: AmazonProductStatus }>,
): Promise<AmazonProduct> {
  const r = await apiClient.patch<AmazonProduct>(`/amazon/products/${id}`, patch);
  return r.data;
}

export async function deleteAmazonProduct(id: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${id}`);
}

export async function uploadAmazonProductImage(id: number, file: File): Promise<{ image_path: string }> {
  const fd = new FormData();
  fd.append('file', file);
  const r = await apiClient.post<{ image_path: string }>(`/amazon/products/${id}/image`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return r.data;
}

export async function deleteAmazonProductImage(id: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${id}/image`);
}

// Authentifizierte Bild-URL via fetch+blob fuer Verwendung in <img src>.
// Hintergrund: GET /:id/image braucht den Bearer-Token, also bauen wir eine Object-URL.
export async function getAmazonProductImageObjectUrl(id: number): Promise<string> {
  const r = await apiClient.get(`/amazon/products/${id}/image`, { responseType: 'blob' });
  return URL.createObjectURL(r.data as Blob);
}
```

- [ ] **Step 2: Typecheck laufen lassen**

```bash
cd frontend && npm run typecheck
```
Erwartet: **0 Errors** (oder nur vorbestehende, nicht aus dieser Datei).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/amazon.api.ts
git commit -m "feat(amazon): Frontend API-Client + Types"
```

---

## Task 5: Frontend — Hook + Page-Foundation (mit Mount-Wechsel)

**Files:**
- Create: `frontend/src/hooks/amazon/useAmazonProducts.ts`
- Create: `frontend/src/pages/amazon/AmazonOverviewPage.tsx`
- Modify: `frontend/src/routes/routes.tsx`
- Delete: `frontend/src/pages/AmazonPage.tsx`

- [ ] **Step 1: Hook schreiben**

Datei `frontend/src/hooks/amazon/useAmazonProducts.ts`:

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  type AmazonProduct, type AmazonProductStatus,
  fetchAmazonProducts, createAmazonProduct, updateAmazonProduct,
  deleteAmazonProduct, uploadAmazonProductImage, deleteAmazonProductImage,
} from '../../api/amazon.api';

export const AMAZON_PRODUCTS_KEY = ['amazon', 'products'] as const;

export function useAmazonProducts(includeDiscarded: boolean) {
  return useQuery({
    queryKey: [...AMAZON_PRODUCTS_KEY, { includeDiscarded }],
    queryFn: () => fetchAmazonProducts(includeDiscarded),
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: AMAZON_PRODUCTS_KEY });
}

export function useCreateAmazonProduct() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (name: string) => createAmazonProduct(name),
    onSuccess: invalidate,
  });
}

export function useUpdateAmazonProductStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: AmazonProductStatus }) =>
      updateAmazonProduct(id, { status }),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: AMAZON_PRODUCTS_KEY });
      const snapshots = qc.getQueriesData<AmazonProduct[]>({ queryKey: AMAZON_PRODUCTS_KEY });
      for (const [key, list] of snapshots) {
        if (!list) continue;
        qc.setQueryData<AmazonProduct[]>(key, list.map(p => p.id === id ? { ...p, status } : p));
      }
      return { snapshots };
    },
    onError: (_err, _vars, ctx) => {
      // Rollback
      for (const [key, list] of ctx?.snapshots ?? []) qc.setQueryData(key, list);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: AMAZON_PRODUCTS_KEY }),
  });
}

export function useDeleteAmazonProduct() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: number) => deleteAmazonProduct(id),
    onSuccess: invalidate,
  });
}

export function useUploadAmazonProductImage() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, file }: { id: number; file: File }) => uploadAmazonProductImage(id, file),
    onSuccess: invalidate,
  });
}

export function useDeleteAmazonProductImage() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: number) => deleteAmazonProductImage(id),
    onSuccess: invalidate,
  });
}
```

- [ ] **Step 2: Minimal-Page schreiben (zeigt nur Anzahl)**

Datei `frontend/src/pages/amazon/AmazonOverviewPage.tsx`:

```tsx
import { useState } from 'react';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { useAmazonProducts } from '../../hooks/amazon/useAmazonProducts';

export function AmazonOverviewPage() {
  const [showDiscarded, _setShowDiscarded] = useState(false);
  const { data: products = [], isLoading, isError, refetch } = useAmazonProducts(showDiscarded);

  return (
    <PageWrapper>
      <header className="flex items-center gap-3 mb-6">
        <div
          className="w-12 h-12 rounded-lg flex items-center justify-center"
          style={{ background: 'var(--color-surface-container)' }}
        >
          <span className="material-symbols-outlined" style={{ color: 'var(--color-primary)' }}>
            settings
          </span>
        </div>
        <div>
          <h1
            className="text-2xl font-bold leading-tight"
            style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}
          >
            ECO-Dashboard
          </h1>
          <p style={{ color: 'var(--color-on-surface-variant)' }}>
            Übersicht für Produktentwicklung
          </p>
        </div>
      </header>

      {isLoading && <p style={{ color: 'var(--color-on-surface-variant)' }}>Lade Produkte …</p>}
      {isError && (
        <div className="rounded-lg p-4" style={{ background: 'var(--color-surface-container-low)' }}>
          <p style={{ color: 'var(--color-on-surface)' }}>Produkte konnten nicht geladen werden.</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-2 px-3 py-1.5 rounded-md text-sm"
            style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)' }}
          >
            Erneut laden
          </button>
        </div>
      )}
      {!isLoading && !isError && (
        <p style={{ color: 'var(--color-on-surface-variant)' }}>
          {products.length} Produkt(e) — Komponenten folgen in den nächsten Tasks.
        </p>
      )}
    </PageWrapper>
  );
}
```

- [ ] **Step 3: Route umstellen**

In `frontend/src/routes/routes.tsx`:

(a) alte Import-Zeile `import { AmazonPage } from '../pages/AmazonPage';` ersetzen durch:

```tsx
import { AmazonOverviewPage } from '../pages/amazon/AmazonOverviewPage';
```

(b) Route-Element austauschen — aktuelle Zeile:

```tsx
{ path: '/amazon',         element: <AmazonPage /> },
```

ersetzen durch:

```tsx
{ path: '/amazon',         element: <AmazonOverviewPage /> },
```

- [ ] **Step 4: Alte Placeholder-Datei loeschen**

```bash
rm "frontend/src/pages/AmazonPage.tsx"
```

- [ ] **Step 5: Typecheck und Smoke-Test**

```bash
cd frontend && npm run typecheck
```
Erwartet: 0 Errors. Falls Backend nicht läuft: `cd backend && npm run dev &` zuerst.

Browser öffnen, einloggen, `/amazon` aufrufen. Erwartet: Header "ECO-Dashboard" + "0 Produkt(e) — Komponenten folgen …".

- [ ] **Step 6: Commit**

```bash
git add frontend/src/hooks/amazon/ frontend/src/pages/amazon/ frontend/src/routes/routes.tsx
git add -u frontend/src/pages/AmazonPage.tsx
git commit -m "feat(amazon): Page-Foundation + Hook, ersetzt Placeholder"
```

---

## Task 6: Frontend — ProductCard + ProductColumn + ProductBoard (read-only)

**Files:**
- Create: `frontend/src/components/amazon/ProductCard.tsx`
- Create: `frontend/src/components/amazon/ProductColumn.tsx`
- Create: `frontend/src/components/amazon/ProductBoard.tsx`
- Modify: `frontend/src/pages/amazon/AmazonOverviewPage.tsx`

In dieser Task gibt es noch keinen Status-Wechsel und kein Anlegen — nur die Read-Only-Darstellung. Status-Dropdown kommt in Task 7, Anlegen in Task 8.

- [ ] **Step 1: ProductCard schreiben**

Datei `frontend/src/components/amazon/ProductCard.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { type AmazonProduct, type AmazonProductStatus, getAmazonProductImageObjectUrl } from '../../api/amazon.api';

const STATUS_LABEL: Record<AmazonProductStatus, string> = {
  interessant: 'Interessant',
  aktiv:       'Aktiv',
  bestehend:   'Bestehend',
  verworfen:   'Verworfen',
};
const STATUS_ICON: Record<AmazonProductStatus, string> = {
  interessant: 'star',
  aktiv:       'settings',
  bestehend:   'check_circle',
  verworfen:   'archive',
};
const STATUS_COLOR: Record<AmazonProductStatus, string> = {
  interessant: '#60a5fa', // blue-400
  aktiv:       '#60a5fa',
  bestehend:   '#34d399', // emerald-400
  verworfen:   '#fdba74', // orange-300
};

function ProductImage({ product }: { product: AmazonProduct }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let revoked = false;
    let objectUrl: string | null = null;
    if (!product.image_path) { setSrc(null); return; }
    getAmazonProductImageObjectUrl(product.id)
      .then(url => {
        if (revoked) { URL.revokeObjectURL(url); return; }
        objectUrl = url;
        setSrc(url);
      })
      .catch(() => setSrc(null));
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [product.id, product.image_path]);

  if (!src) {
    return (
      <div
        className="aspect-[16/9] rounded-t-xl flex items-center justify-center"
        style={{ background: 'var(--color-surface-container-low)' }}
      >
        <span
          className="material-symbols-outlined text-4xl"
          style={{ color: 'var(--color-on-surface-variant)', opacity: 0.5 }}
        >
          image
        </span>
      </div>
    );
  }
  return <img src={src} alt={product.name} className="aspect-[16/9] w-full object-cover rounded-t-xl" />;
}

export function ProductCard({ product }: { product: AmazonProduct }) {
  const color = STATUS_COLOR[product.status];
  return (
    <article
      className="rounded-xl overflow-hidden"
      style={{
        background: 'var(--color-surface-container-low)',
        border: `1px solid ${color}26`, // ~15% alpha
      }}
    >
      <div className="relative">
        <ProductImage product={product} />
        <div
          className="absolute top-2 left-2 px-2.5 py-1 rounded-full text-xs flex items-center gap-1 backdrop-blur-sm"
          style={{ background: `${color}33`, color }}
        >
          <span className="material-symbols-outlined text-base">{STATUS_ICON[product.status]}</span>
          {STATUS_LABEL[product.status]}
        </div>
      </div>
      <div className="p-3">
        <h3 className="font-semibold mb-2" style={{ color: 'var(--color-on-surface)' }}>
          {product.name}
        </h3>
        <p className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
          {new Date(product.created_at * 1000).toLocaleDateString('de-DE')}
        </p>
      </div>
    </article>
  );
}
```

- [ ] **Step 2: ProductColumn schreiben**

Datei `frontend/src/components/amazon/ProductColumn.tsx`:

```tsx
import { type ReactNode } from 'react';
import { type AmazonProduct, type AmazonProductStatus } from '../../api/amazon.api';
import { ProductCard } from './ProductCard';

interface Props {
  title: string;
  icon: string;
  accent: string; // CSS color
  products: AmazonProduct[];
  emptyText: string;
  status: AmazonProductStatus; // unused jetzt, gebraucht in Task 7
  children?: ReactNode;
}

export function ProductColumn({ title, icon, accent, products, emptyText }: Props) {
  return (
    <section
      className="rounded-xl p-3 flex flex-col gap-3"
      style={{
        background: 'var(--color-surface-container-low)',
        border: `1px solid ${accent}26`,
      }}
    >
      <header className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined" style={{ color: accent }}>{icon}</span>
          <h2 className="font-semibold" style={{ color: accent }}>{title}</h2>
        </div>
        <span
          className="text-xs px-2 py-0.5 rounded-full"
          style={{ background: `${accent}33`, color: accent }}
        >
          {products.length}
        </span>
      </header>
      <div className="flex flex-col gap-3 min-h-[120px]">
        {products.length === 0 ? (
          <p
            className="text-sm text-center py-8"
            style={{ color: 'var(--color-on-surface-variant)', opacity: 0.7 }}
          >
            {emptyText}
          </p>
        ) : (
          products.map(p => <ProductCard key={p.id} product={p} />)
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: ProductBoard schreiben**

Datei `frontend/src/components/amazon/ProductBoard.tsx`:

```tsx
import { type AmazonProduct } from '../../api/amazon.api';
import { ProductColumn } from './ProductColumn';

interface Props {
  products: AmazonProduct[];
  showDiscarded: boolean;
}

export function ProductBoard({ products, showDiscarded }: Props) {
  const byStatus = {
    interessant: products.filter(p => p.status === 'interessant'),
    aktiv:       products.filter(p => p.status === 'aktiv'),
    bestehend:   products.filter(p => p.status === 'bestehend'),
    verworfen:   products.filter(p => p.status === 'verworfen'),
  };

  return (
    <div className={`grid gap-4 ${showDiscarded ? 'grid-cols-4' : 'grid-cols-3'}`}>
      <ProductColumn
        title="Interessant" icon="star" accent="#60a5fa"
        products={byStatus.interessant} status="interessant"
        emptyText="Keine interessanten Produkte"
      />
      <ProductColumn
        title="Aktiv am entwickeln" icon="settings" accent="#60a5fa"
        products={byStatus.aktiv} status="aktiv"
        emptyText="Noch keine aktiven Produkte"
      />
      <ProductColumn
        title="Meine bestehenden Produkte" icon="check_circle" accent="#34d399"
        products={byStatus.bestehend} status="bestehend"
        emptyText="Noch keine bestehenden Produkte"
      />
      {showDiscarded && (
        <ProductColumn
          title="Verworfen" icon="archive" accent="#fdba74"
          products={byStatus.verworfen} status="verworfen"
          emptyText="Keine verworfenen Produkte"
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Page-Container einbinden**

In `frontend/src/pages/amazon/AmazonOverviewPage.tsx`: den Platzhalter-Absatz unter `{!isLoading && !isError && (...)}` ersetzen durch:

```tsx
{!isLoading && !isError && <ProductBoard products={products} showDiscarded={showDiscarded} />}
```

Und Import oben ergänzen:

```tsx
import { ProductBoard } from '../../components/amazon/ProductBoard';
```

- [ ] **Step 5: Typecheck + Browser-Test**

```bash
cd frontend && npm run typecheck
```

Browser: `/amazon` aufrufen. Erwartet: 3 leere Spalten mit Headern und Empty-Texten. Über DB einen Testdatensatz anlegen (oder Task 8 abwarten) — die Karte muss in der korrekten Spalte erscheinen.

Schneller manueller DB-Insert für den Test:

```bash
cd backend && node -e "const db=require('better-sqlite3')(require('path').join(require('os').homedir(),'.local/share/benny-dashboard/dashboard.db')); db.prepare('INSERT INTO amazon_products (name) VALUES (?)').run('Smoke-Test'); console.log('inserted');"
```

Browser-Refresh → Karte "Smoke-Test" in "Interessant"-Spalte. Anschließend wieder löschen:

```bash
cd backend && node -e "const db=require('better-sqlite3')(require('path').join(require('os').homedir(),'.local/share/benny-dashboard/dashboard.db')); db.prepare(\"DELETE FROM amazon_products WHERE name='Smoke-Test'\").run();"
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/amazon/ProductCard.tsx frontend/src/components/amazon/ProductColumn.tsx frontend/src/components/amazon/ProductBoard.tsx frontend/src/pages/amazon/AmazonOverviewPage.tsx
git commit -m "feat(amazon): Board mit Spalten und Karten (read-only)"
```

---

## Task 7: Frontend — ProductStatusBadge mit Dropdown

**Files:**
- Create: `frontend/src/components/amazon/ProductStatusBadge.tsx`
- Modify: `frontend/src/components/amazon/ProductCard.tsx`

- [ ] **Step 1: Badge-Komponente schreiben**

Datei `frontend/src/components/amazon/ProductStatusBadge.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { type AmazonProductStatus } from '../../api/amazon.api';
import { useUpdateAmazonProductStatus } from '../../hooks/amazon/useAmazonProducts';

const LABEL: Record<AmazonProductStatus, string> = {
  interessant: 'Interessant',
  aktiv:       'Aktiv',
  bestehend:   'Bestehend',
  verworfen:   'Verworfen',
};
const ICON: Record<AmazonProductStatus, string> = {
  interessant: 'star',
  aktiv:       'settings',
  bestehend:   'check_circle',
  verworfen:   'archive',
};
const COLOR: Record<AmazonProductStatus, string> = {
  interessant: '#60a5fa',
  aktiv:       '#60a5fa',
  bestehend:   '#34d399',
  verworfen:   '#fdba74',
};
const ORDER: AmazonProductStatus[] = ['interessant', 'aktiv', 'bestehend', 'verworfen'];

export function ProductStatusBadge({ productId, status }: { productId: number; status: AmazonProductStatus }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const update = useUpdateAmazonProductStatus();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const color = COLOR[status];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        className="px-2.5 py-1 rounded-full text-xs flex items-center gap-1 backdrop-blur-sm cursor-pointer"
        style={{ background: `${color}33`, color }}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="material-symbols-outlined text-base">{ICON[status]}</span>
        {LABEL[status]}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 mt-1 rounded-lg shadow-lg overflow-hidden z-10 min-w-[160px]"
          style={{ background: 'var(--color-surface-container-high)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          {ORDER.map((s) => {
            const isCurrent = s === status;
            const c = COLOR[s];
            const isPending = update.isPending && update.variables?.status === s;
            return (
              <button
                key={s}
                type="button"
                role="menuitem"
                disabled={update.isPending}
                onClick={() => {
                  if (s === status) { setOpen(false); return; }
                  update.mutate({ id: productId, status: s }, { onSuccess: () => setOpen(false) });
                }}
                className="w-full px-3 py-2 text-sm flex items-center gap-2 text-left"
                style={{
                  background: isCurrent ? `${c}22` : 'transparent',
                  color: 'var(--color-on-surface)',
                }}
                onMouseEnter={(e) => { if (!isCurrent) e.currentTarget.style.background = `${c}11`; }}
                onMouseLeave={(e) => { if (!isCurrent) e.currentTarget.style.background = 'transparent'; }}
              >
                <span
                  className="material-symbols-outlined text-base"
                  style={{ color: isCurrent ? c : 'var(--color-on-surface-variant)' }}
                >
                  {isCurrent ? 'check' : ICON[s]}
                </span>
                <span className="flex-1">{LABEL[s]}</span>
                {isPending && (
                  <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: ProductCard auf Badge umstellen**

In `frontend/src/components/amazon/ProductCard.tsx`:

(a) Import oben ergänzen:

```tsx
import { ProductStatusBadge } from './ProductStatusBadge';
```

(b) Den inline `<div className="absolute top-2 left-2 …">…</div>`-Block (statisches Badge) ersetzen durch:

```tsx
<div className="absolute top-2 left-2">
  <ProductStatusBadge productId={product.id} status={product.status} />
</div>
```

(c) Die nicht mehr benötigten Konstanten `STATUS_ICON`, `STATUS_LABEL`, `STATUS_COLOR` aus `ProductCard.tsx` entfernen — der Border-Farbcode wird neu aus `product.status` abgeleitet. Datei vereinfachen:

```tsx
import { useEffect, useState } from 'react';
import { type AmazonProduct, getAmazonProductImageObjectUrl } from '../../api/amazon.api';
import { ProductStatusBadge } from './ProductStatusBadge';

const BORDER_COLOR: Record<AmazonProduct['status'], string> = {
  interessant: '#60a5fa',
  aktiv:       '#60a5fa',
  bestehend:   '#34d399',
  verworfen:   '#fdba74',
};

function ProductImage({ product }: { product: AmazonProduct }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let revoked = false;
    let objectUrl: string | null = null;
    if (!product.image_path) { setSrc(null); return; }
    getAmazonProductImageObjectUrl(product.id)
      .then(url => {
        if (revoked) { URL.revokeObjectURL(url); return; }
        objectUrl = url;
        setSrc(url);
      })
      .catch(() => setSrc(null));
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [product.id, product.image_path]);

  if (!src) {
    return (
      <div
        className="aspect-[16/9] rounded-t-xl flex items-center justify-center"
        style={{ background: 'var(--color-surface-container-low)' }}
      >
        <span className="material-symbols-outlined text-4xl" style={{ color: 'var(--color-on-surface-variant)', opacity: 0.5 }}>
          image
        </span>
      </div>
    );
  }
  return <img src={src} alt={product.name} className="aspect-[16/9] w-full object-cover rounded-t-xl" />;
}

export function ProductCard({ product }: { product: AmazonProduct }) {
  const color = BORDER_COLOR[product.status];
  return (
    <article
      className="rounded-xl overflow-hidden"
      style={{
        background: 'var(--color-surface-container-low)',
        border: `1px solid ${color}26`,
      }}
    >
      <div className="relative">
        <ProductImage product={product} />
        <div className="absolute top-2 left-2">
          <ProductStatusBadge productId={product.id} status={product.status} />
        </div>
      </div>
      <div className="p-3">
        <h3 className="font-semibold mb-2" style={{ color: 'var(--color-on-surface)' }}>
          {product.name}
        </h3>
        <p className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
          {new Date(product.created_at * 1000).toLocaleDateString('de-DE')}
        </p>
      </div>
    </article>
  );
}
```

- [ ] **Step 3: Typecheck + Browser-Test**

```bash
cd frontend && npm run typecheck
```

Browser: `/amazon`. Per DB-Insert ein Test-Produkt anlegen (Befehl aus Task 6, Step 5). Klick auf das Badge → Dropdown öffnet sich. "Aktiv" wählen → Karte wandert sofort (optimistic) in die "Aktiv"-Spalte. Backend-Bestätigung darunter → Refetch, Karte bleibt dort. Backend stoppen, nochmal versuchen → Toast nicht nötig: die Karte rollt zurück, weil `onError` die Snapshots wiederherstellt.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/amazon/ProductStatusBadge.tsx frontend/src/components/amazon/ProductCard.tsx
git commit -m "feat(amazon): Status-Dropdown auf Karte mit optimistic Update"
```

---

## Task 8: Frontend — Anlege-Dialog

**Files:**
- Create: `frontend/src/components/amazon/NewProductDialog.tsx`
- Modify: `frontend/src/pages/amazon/AmazonOverviewPage.tsx`

- [ ] **Step 1: Dialog schreiben (draggable, Name + optional Bild)**

Datei `frontend/src/components/amazon/NewProductDialog.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { useDraggableModal } from '../../hooks/useDraggableModal';
import { useCreateAmazonProduct, useUploadAmazonProductImage } from '../../hooks/amazon/useAmazonProducts';

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

function validateFile(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) return 'Nur JPG, PNG oder WEBP.';
  if (file.size > MAX_BYTES) return 'Bild ist größer als 5 MB.';
  return null;
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function NewProductDialog({ open, onClose }: Props) {
  const [name, setName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const create = useCreateAmazonProduct();
  const upload = useUploadAmazonProductImage();
  const { onMouseDown, modalStyle, headerStyle } = useDraggableModal();

  useEffect(() => {
    if (!open) {
      setName(''); setFile(null); setError(null);
      if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Paste-Support
  useEffect(() => {
    if (!open) return;
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.kind === 'file') {
          const f = item.getAsFile();
          if (f) { handlePickFile(f); break; }
        }
      }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [open]);

  function handlePickFile(f: File) {
    const msg = validateFile(f);
    if (msg) { setError(msg); return; }
    setError(null);
    setFile(f);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(f));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 200) {
      setError('Name muss 1–200 Zeichen lang sein.');
      return;
    }
    setError(null);
    try {
      const product = await create.mutateAsync(trimmed);
      if (file) {
        try { await upload.mutateAsync({ id: product.id, file }); }
        catch { setError('Produkt angelegt, aber Bild-Upload fehlgeschlagen.'); return; }
      }
      onClose();
    } catch {
      setError('Anlegen fehlgeschlagen.');
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div
        data-draggable-modal
        className="w-[440px] max-w-[90vw] rounded-xl"
        style={{ background: 'var(--color-surface-container)', ...modalStyle }}
        onClick={(e) => e.stopPropagation()}
      >
        <header
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ ...headerStyle, borderColor: 'rgba(255,255,255,0.08)' }}
          onMouseDown={onMouseDown}
        >
          <h2 className="font-semibold" style={{ color: 'var(--color-on-surface)' }}>Neues Produkt</h2>
          <button type="button" onClick={onClose} aria-label="Schließen">
            <span className="material-symbols-outlined" style={{ color: 'var(--color-on-surface-variant)' }}>close</span>
          </button>
        </header>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <label className="block">
            <span className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>Name</span>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              className="mt-1 w-full px-3 py-2 rounded-md"
              style={{
                background: 'var(--color-surface-container-low)',
                color: 'var(--color-on-surface)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            />
          </label>

          <div>
            <p className="text-sm mb-1" style={{ color: 'var(--color-on-surface-variant)' }}>Produktbild (optional)</p>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) handlePickFile(f);
              }}
              className="w-full aspect-[16/9] rounded-md flex items-center justify-center text-sm overflow-hidden"
              style={{
                background: 'var(--color-surface-container-low)',
                border: '1px dashed rgba(255,255,255,0.16)',
                color: 'var(--color-on-surface-variant)',
              }}
            >
              {previewUrl
                ? <img src={previewUrl} alt="Vorschau" className="w-full h-full object-cover" />
                : <span>Klicken, Drag&Drop oder Cmd+V einfügen</span>}
            </button>
            <input
              ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePickFile(f); }}
            />
          </div>

          {error && (
            <p className="text-sm" style={{ color: '#fca5a5' }}>{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md text-sm"
              style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={name.trim().length < 1 || create.isPending || upload.isPending}
              className="px-4 py-2 rounded-md text-sm disabled:opacity-50"
              style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)' }}
            >
              {create.isPending || upload.isPending ? 'Speichern…' : 'Anlegen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Page-Header um "+ Produkt direkt entwickeln" erweitern**

In `frontend/src/pages/amazon/AmazonOverviewPage.tsx`:

(a) Import ergänzen:

```tsx
import { NewProductDialog } from '../../components/amazon/NewProductDialog';
```

(b) State ergänzen:

```tsx
const [dialogOpen, setDialogOpen] = useState(false);
```

(c) Direkt nach dem `<header>`-Block, vor `{isLoading && …}`, einfügen:

```tsx
<div className="flex justify-end mb-4">
  <button
    type="button"
    onClick={() => setDialogOpen(true)}
    className="px-4 py-2 rounded-md text-sm flex items-center gap-2"
    style={{
      background: 'var(--color-surface-container-high)',
      color: 'var(--color-on-surface)',
      border: '1px solid rgba(255,255,255,0.08)',
    }}
  >
    <span className="material-symbols-outlined text-base">add</span>
    Produkt direkt entwickeln
  </button>
</div>
```

(d) Am Ende des `<PageWrapper>`, vor dem schließenden Tag, hinzufügen:

```tsx
<NewProductDialog open={dialogOpen} onClose={() => setDialogOpen(false)} />
```

- [ ] **Step 3: Browser-Test**

`/amazon` → "+ Produkt direkt entwickeln" klicken. Dialog öffnet sich, am Header draggable. Name eingeben → "Anlegen" → Dialog schließt sich, Karte erscheint in "Interessant". Mit Bild: Klick auf Drop-Zone → Datei wählen → Vorschau → "Anlegen" → Karte erscheint mit Bild.

Edge-Cases:
- Leerer Name → Button bleibt disabled.
- 201 Zeichen Name → server-seitig blockiert, Inline-Fehler.
- Bild > 5 MB → client-seitig blockiert, Inline-Fehler.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/amazon/NewProductDialog.tsx frontend/src/pages/amazon/AmazonOverviewPage.tsx
git commit -m "feat(amazon): Anlege-Dialog mit Name + optionalem Bild (DnD, Paste)"
```

---

## Task 9: Frontend — Verworfene-Toggle

**Files:**
- Create: `frontend/src/components/amazon/DiscardedToggleButton.tsx`
- Modify: `frontend/src/pages/amazon/AmazonOverviewPage.tsx`

- [ ] **Step 1: Toggle-Komponente schreiben**

Datei `frontend/src/components/amazon/DiscardedToggleButton.tsx`:

```tsx
interface Props {
  active: boolean;
  count: number;
  onToggle: () => void;
}

export function DiscardedToggleButton({ active, count, onToggle }: Props) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="px-3 py-1.5 rounded-md text-sm flex items-center gap-2"
      style={{
        background: 'var(--color-surface-container-high)',
        color: 'var(--color-on-surface)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <span className="material-symbols-outlined text-base">archive</span>
      {active ? 'Verworfene ausblenden' : 'Verworfene einblenden'}
      <span
        className="px-2 py-0.5 rounded-full text-xs"
        style={{ background: '#fdba7433', color: '#fdba74' }}
      >
        {count}
      </span>
    </button>
  );
}
```

- [ ] **Step 2: Page um Toggle erweitern**

In `frontend/src/pages/amazon/AmazonOverviewPage.tsx`:

(a) Import:

```tsx
import { DiscardedToggleButton } from '../../components/amazon/DiscardedToggleButton';
```

(b) State korrigieren — die alte Zeile `const [showDiscarded, _setShowDiscarded] = useState(false);` aus Task 5 ersetzen durch:

```tsx
const [showDiscarded, setShowDiscarded] = useState(false);
```

(c) Daten zweimal laden: wir brauchen die Verworfen-Anzahl auch ohne das Einblenden. Den `useAmazonProducts(showDiscarded)`-Aufruf ersetzen durch:

```tsx
const { data: products = [], isLoading, isError, refetch } = useAmazonProducts(true);
const discardedCount = products.filter(p => p.status === 'verworfen').length;
const visibleProducts = showDiscarded ? products : products.filter(p => p.status !== 'verworfen');
```

(d) Im Render `<ProductBoard>` entsprechend `visibleProducts` übergeben:

```tsx
{!isLoading && !isError && <ProductBoard products={visibleProducts} showDiscarded={showDiscarded} />}
```

(e) Direkt über dem Board, **nach** dem "+ Produkt direkt entwickeln"-Block, den Toggle einfügen:

```tsx
<div className="flex justify-end mb-4">
  <DiscardedToggleButton
    active={showDiscarded}
    count={discardedCount}
    onToggle={() => setShowDiscarded(v => !v)}
  />
</div>
```

- [ ] **Step 3: Browser-Test**

- Mehrere Produkte anlegen, eines davon per Dropdown auf "Verworfen" setzen.
- Toggle aus → 3 Spalten, verworfenes Produkt versteckt, Zähler zeigt 1.
- Toggle an → 4. Spalte erscheint, Karte sichtbar.
- Karte aus "Verworfen" zurück auf "Interessant" → Karte wandert (auch wenn Toggle wieder aus, sieht man sie in Interessant).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/amazon/DiscardedToggleButton.tsx frontend/src/pages/amazon/AmazonOverviewPage.tsx
git commit -m "feat(amazon): Verworfene-Toggle mit 4. Spalte und Zaehler"
```

---

## Task 10: Frontend — Hartes Löschen mit Confirm

**Files:**
- Create: `frontend/src/components/amazon/DeleteProductDialog.tsx`
- Modify: `frontend/src/components/amazon/ProductCard.tsx`

- [ ] **Step 1: Confirm-Dialog schreiben**

Datei `frontend/src/components/amazon/DeleteProductDialog.tsx`:

```tsx
import { useDeleteAmazonProduct } from '../../hooks/amazon/useAmazonProducts';
import { type AmazonProduct } from '../../api/amazon.api';

interface Props {
  product: AmazonProduct | null;
  onClose: () => void;
}

export function DeleteProductDialog({ product, onClose }: Props) {
  const del = useDeleteAmazonProduct();

  if (!product) return null;

  async function handleConfirm() {
    if (!product) return;
    try {
      await del.mutateAsync(product.id);
      onClose();
    } catch {
      // Fehler bleibt im Mutation-State; einfache Anzeige reicht hier
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div
        className="w-[400px] max-w-[90vw] rounded-xl p-5"
        style={{ background: 'var(--color-surface-container)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-semibold mb-2" style={{ color: 'var(--color-on-surface)' }}>
          Produkt löschen?
        </h2>
        <p className="text-sm mb-4" style={{ color: 'var(--color-on-surface-variant)' }}>
          „{product.name}" und das zugehörige Bild werden dauerhaft entfernt.
        </p>
        {del.isError && (
          <p className="text-sm mb-2" style={{ color: '#fca5a5' }}>Löschen fehlgeschlagen.</p>
        )}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={del.isPending}
            className="px-4 py-2 rounded-md text-sm"
            style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={del.isPending}
            className="px-4 py-2 rounded-md text-sm"
            style={{ background: '#dc2626', color: '#fff' }}
          >
            {del.isPending ? 'Lösche…' : 'Löschen'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Mülltonne-Button auf Karte hinzufügen**

In `frontend/src/components/amazon/ProductCard.tsx`:

(a) `ProductCard` Props erweitern und Render anpassen:

```tsx
interface ProductCardProps {
  product: AmazonProduct;
  onRequestDelete: (product: AmazonProduct) => void;
}

export function ProductCard({ product, onRequestDelete }: ProductCardProps) {
  const color = BORDER_COLOR[product.status];
  return (
    <article
      className="rounded-xl overflow-hidden group"
      style={{
        background: 'var(--color-surface-container-low)',
        border: `1px solid ${color}26`,
      }}
    >
      <div className="relative">
        <ProductImage product={product} />
        <div className="absolute top-2 left-2">
          <ProductStatusBadge productId={product.id} status={product.status} />
        </div>
        <button
          type="button"
          onClick={() => onRequestDelete(product)}
          aria-label="Produkt löschen"
          className="absolute top-2 right-2 p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
        >
          <span className="material-symbols-outlined text-base" style={{ color: '#fca5a5' }}>delete</span>
        </button>
      </div>
      <div className="p-3">
        <h3 className="font-semibold mb-2" style={{ color: 'var(--color-on-surface)' }}>
          {product.name}
        </h3>
        <p className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
          {new Date(product.created_at * 1000).toLocaleDateString('de-DE')}
        </p>
      </div>
    </article>
  );
}
```

- [ ] **Step 3: Prop durchleiten in ProductColumn + ProductBoard**

`frontend/src/components/amazon/ProductColumn.tsx` — Props erweitern und an Karte weitergeben:

```tsx
import { type ReactNode } from 'react';
import { type AmazonProduct, type AmazonProductStatus } from '../../api/amazon.api';
import { ProductCard } from './ProductCard';

interface Props {
  title: string;
  icon: string;
  accent: string;
  products: AmazonProduct[];
  emptyText: string;
  status: AmazonProductStatus;
  onRequestDelete: (product: AmazonProduct) => void;
  children?: ReactNode;
}

export function ProductColumn({ title, icon, accent, products, emptyText, onRequestDelete }: Props) {
  return (
    <section
      className="rounded-xl p-3 flex flex-col gap-3"
      style={{ background: 'var(--color-surface-container-low)', border: `1px solid ${accent}26` }}
    >
      <header className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined" style={{ color: accent }}>{icon}</span>
          <h2 className="font-semibold" style={{ color: accent }}>{title}</h2>
        </div>
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: `${accent}33`, color: accent }}>
          {products.length}
        </span>
      </header>
      <div className="flex flex-col gap-3 min-h-[120px]">
        {products.length === 0
          ? <p className="text-sm text-center py-8" style={{ color: 'var(--color-on-surface-variant)', opacity: 0.7 }}>{emptyText}</p>
          : products.map(p => <ProductCard key={p.id} product={p} onRequestDelete={onRequestDelete} />)
        }
      </div>
    </section>
  );
}
```

`frontend/src/components/amazon/ProductBoard.tsx` — Prop ergänzen und durchreichen:

```tsx
import { type AmazonProduct } from '../../api/amazon.api';
import { ProductColumn } from './ProductColumn';

interface Props {
  products: AmazonProduct[];
  showDiscarded: boolean;
  onRequestDelete: (product: AmazonProduct) => void;
}

export function ProductBoard({ products, showDiscarded, onRequestDelete }: Props) {
  const byStatus = {
    interessant: products.filter(p => p.status === 'interessant'),
    aktiv:       products.filter(p => p.status === 'aktiv'),
    bestehend:   products.filter(p => p.status === 'bestehend'),
    verworfen:   products.filter(p => p.status === 'verworfen'),
  };
  return (
    <div className={`grid gap-4 ${showDiscarded ? 'grid-cols-4' : 'grid-cols-3'}`}>
      <ProductColumn title="Interessant" icon="star" accent="#60a5fa"
        products={byStatus.interessant} status="interessant"
        emptyText="Keine interessanten Produkte" onRequestDelete={onRequestDelete} />
      <ProductColumn title="Aktiv am entwickeln" icon="settings" accent="#60a5fa"
        products={byStatus.aktiv} status="aktiv"
        emptyText="Noch keine aktiven Produkte" onRequestDelete={onRequestDelete} />
      <ProductColumn title="Meine bestehenden Produkte" icon="check_circle" accent="#34d399"
        products={byStatus.bestehend} status="bestehend"
        emptyText="Noch keine bestehenden Produkte" onRequestDelete={onRequestDelete} />
      {showDiscarded && (
        <ProductColumn title="Verworfen" icon="archive" accent="#fdba74"
          products={byStatus.verworfen} status="verworfen"
          emptyText="Keine verworfenen Produkte" onRequestDelete={onRequestDelete} />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Page-State + Dialog einbinden**

In `frontend/src/pages/amazon/AmazonOverviewPage.tsx`:

(a) Import:

```tsx
import { DeleteProductDialog } from '../../components/amazon/DeleteProductDialog';
import { type AmazonProduct } from '../../api/amazon.api';
```

(b) State ergänzen:

```tsx
const [pendingDelete, setPendingDelete] = useState<AmazonProduct | null>(null);
```

(c) `<ProductBoard>`-Aufruf um Prop erweitern:

```tsx
{!isLoading && !isError && (
  <ProductBoard
    products={visibleProducts}
    showDiscarded={showDiscarded}
    onRequestDelete={setPendingDelete}
  />
)}
```

(d) Am Ende, neben `<NewProductDialog>`:

```tsx
<DeleteProductDialog product={pendingDelete} onClose={() => setPendingDelete(null)} />
```

- [ ] **Step 5: Browser-Test**

- Hover über Karte → Mülltonne erscheint oben rechts.
- Klick → Confirm-Modal mit Produktname.
- "Löschen" → Karte verschwindet, Bild ist auch weg (im Upload-Ordner prüfen: `ls ~/.local/share/benny-dashboard/amazon-products/`).
- "Abbrechen" → Modal schließt, Karte bleibt.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/amazon/DeleteProductDialog.tsx frontend/src/components/amazon/ProductCard.tsx frontend/src/components/amazon/ProductColumn.tsx frontend/src/components/amazon/ProductBoard.tsx frontend/src/pages/amazon/AmazonOverviewPage.tsx
git commit -m "feat(amazon): Hartes Loeschen mit Confirm-Modal"
```

---

## Task 11: Frontend — Bild auf Karte tauschen / ergänzen

**Files:**
- Modify: `frontend/src/components/amazon/ProductCard.tsx`

- [ ] **Step 1: Bild-Klick + Upload integrieren**

In `frontend/src/components/amazon/ProductCard.tsx`:

(a) Import oben ergänzen:

```tsx
import { useRef } from 'react';
import { useUploadAmazonProductImage } from '../../hooks/amazon/useAmazonProducts';
```

(b) Im `ProductCard`-Body Hook + Ref + Validator:

```tsx
const upload = useUploadAmazonProductImage();
const fileInput = useRef<HTMLInputElement | null>(null);

function onPick(e: React.ChangeEvent<HTMLInputElement>) {
  const f = e.target.files?.[0];
  e.target.value = ''; // gleichen Datei-Reupload erlauben
  if (!f) return;
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(f.type) || f.size > 5 * 1024 * 1024) return; // still still ablehnen
  upload.mutate({ id: product.id, file: f });
}
```

(c) Den `<ProductImage product={product} />`-Aufruf in einen klickbaren Wrapper kapseln (statt direkt rendern):

```tsx
<button
  type="button"
  onClick={() => fileInput.current?.click()}
  aria-label={product.image_path ? 'Bild ersetzen' : 'Bild hinzufügen'}
  className="block w-full relative"
>
  <ProductImage product={product} />
  <span
    className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
    style={{ background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)' }}
  >
    <span
      className="px-2.5 py-1 rounded-md text-xs flex items-center gap-1"
      style={{ background: 'var(--color-surface-container)', color: 'var(--color-on-surface)' }}
    >
      <span className="material-symbols-outlined text-base">photo_camera</span>
      {product.image_path ? 'Ersetzen' : 'Hinzufügen'}
    </span>
  </span>
</button>
<input
  ref={fileInput}
  type="file"
  accept="image/jpeg,image/png,image/webp"
  className="hidden"
  onChange={onPick}
/>
```

Wichtig: Der **Status-Badge** und die **Mülltonne** dürfen **nicht** innerhalb dieses Buttons sein — sonst löst der Click auf das Badge auch den File-Picker aus. Beide bleiben Geschwister des neuen Buttons im `relative`-Container.

Resultierende Struktur des `relative`-Containers:

```tsx
<div className="relative">
  <button …>  {/* der File-Picker-Trigger oben */}
    <ProductImage … />
    <span …>{/* Hover-Overlay */}</span>
  </button>
  <input … ref={fileInput} />
  <div className="absolute top-2 left-2 z-10">
    <ProductStatusBadge productId={product.id} status={product.status} />
  </div>
  <button
    type="button"
    onClick={() => onRequestDelete(product)}
    aria-label="Produkt löschen"
    className="absolute top-2 right-2 z-10 p-1.5 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
    style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
  >
    <span className="material-symbols-outlined text-base" style={{ color: '#fca5a5' }}>delete</span>
  </button>
</div>
```

- [ ] **Step 2: Browser-Test**

- Karte ohne Bild → Hover → "Hinzufügen"-Overlay → Klick → Datei wählen → Bild erscheint nach Refetch.
- Karte mit Bild → Hover → "Ersetzen" → neue Datei → altes Bild im Upload-Ordner ist weg, neues drin.
- Klick auf Badge → Dropdown öffnet sich, File-Picker bleibt **zu**.
- Klick auf Mülltonne → Confirm-Modal, File-Picker bleibt **zu**.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/amazon/ProductCard.tsx
git commit -m "feat(amazon): Bild auf Karte tauschen/ergaenzen per Klick"
```

---

## Task 12: Tests & UAT-Abschluss

**Files:** keine neuen — Verifikation der bereits geschriebenen Tests + manuelles UAT.

- [ ] **Step 1: Backend-Tests komplett laufen lassen**

```bash
cd backend && npm test
```
Erwartet: **alle** Tests grün, inkl. `schema.amazon_products` und `integration.amazon_products`.

- [ ] **Step 2: Frontend-Typecheck**

```bash
cd frontend && npm run typecheck
```
Erwartet: **0 Errors**.

- [ ] **Step 3: Frontend-Build**

```bash
cd frontend && npm run build
```
Erwartet: erfolgreich kompiliert.

- [ ] **Step 4: Manuelles UAT (jeden Punkt abhaken)**

Voraussetzung: Backend frisch gestartet (`pkill -f "tsx watch"; sleep 1; cd backend && npm run dev`), Frontend `npm run dev` läuft, Browser auf `/amazon`, eingeloggt.

UAT-Checkliste (siehe Spec):
- [ ] Produkt anlegen ohne Bild → erscheint in "Interessant".
- [ ] Produkt anlegen mit Bild via Klick → Bild sichtbar.
- [ ] Produkt anlegen mit Bild via Cmd+V → Bild sichtbar.
- [ ] Status per Dropdown auf "Aktiv" → Karte wandert.
- [ ] Status per Dropdown auf "Verworfen" → Karte verschwindet bei aus-geblendetem Toggle.
- [ ] "Verworfene einblenden" → 4. Spalte erscheint, Toggle-Text wechselt, Zähler stimmt.
- [ ] Verworfenes Produkt zurück auf "Interessant" → Karte wandert.
- [ ] Bild auf Karte ersetzen → Klick aufs Bild → neue Datei → Bild aktualisiert. Altes File im Upload-Ordner ist weg.
- [ ] Hartes Löschen → Confirm-Modal → Karte und Bild entfernt.
- [ ] Fehlerpfad: Backend stoppen (`pkill -f "tsx watch"`), Status wechseln → Optimistic Update rollt zurück, Karte bleibt in alter Spalte. Backend wieder starten.
- [ ] Empty State: alle Produkte löschen → 3 leere Spalten mit Empty-Text.

Falls ein Punkt fehlschlägt: zurück zur Task mit dem fehlerhaften Verhalten, fixen, hier wieder abhaken.

- [ ] **Step 5: Final-Commit fuer UAT-Status (falls keine Code-Aenderungen)**

Wenn alles grün, keine zusätzliche Commit nötig. Andernfalls jeder Fix-Commit landet beim entsprechenden Bereich.

---

## Selbstreview-Notizen

- **Spec-Coverage:** alle in-Scope Items aus der Spec sind durch Tasks abgedeckt — Datenmodell (T1), CRUD-API (T2), Bild-API (T3), Routes-Mount (T2), Frontend-Foundation (T4–T5), Board/Card (T6), Status-Dropdown (T7), Anlege-Dialog (T8), Verworfen-Toggle (T9), Hard-Delete (T10), Bild-Tausch auf Karte (T11), Tests/UAT (T12).
- **Out-of-Scope** (Detail-Seite, Brand-Tab, USP/Marge/Sourcing-Felder, Sortier-Dropdown etc.) wird **bewusst nicht** angefasst.
- **Bekannte Falle aus Memory:** Stale-Backend nach Routen-Änderung — Task 2/3 enthält explizit `pkill -f "tsx watch"` als Sicherheitsnetz, UAT verlangt frischen Backend-Start.
- **Drag&Drop** ist explizit **nicht** im Plan (Spec-Out-of-Scope) — Statuswechsel ausschließlich via Dropdown.
