# Amazon Produkt-Detail — Brand-Sektion + Sourcing-Erweiterung Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bundle-Schritt 3 — neue "Beauftragt"-Checkbox-Spalte in der Sourcing-Sample-Tabelle plus komplette Brand-Sektion (Akkordeon mit Namens-Tabelle, Favoriten-Recherche-Bereich, PDF-Export, Doppelte-Namen-Warnung).

**Architecture:** Migration 059 ergänzt `sample_ordered` in `amazon_sourcing_samples`. Migration 060 legt `amazon_brand_name` (1:1) und `amazon_brand_name_candidates` (1:n) an. Neue Backend-Route-Datei `amazon.brand.routes.ts` mit Lazy-Init und Candidate-CRUD. Frontend: `BrandNameSection`-Akkordeon nutzt das vorhandene `SectionHeader`-Pattern, sortiert Namen client-seitig (Favoriten zuerst), öffnet automatisch einen Favoriten-Recherche-Bereich. PDF-Export via `jspdf` (im Projekt installiert).

**Tech Stack:** better-sqlite3 11.x, Express 5.x, vitest + supertest (Backend) — React 19, TanStack Query 5.x, axios, Tailwind v4, jspdf + jspdf-autotable (Frontend).

**Spec:** `docs/superpowers/specs/2026-06-01-amazon-detail-brand-name-design.md`

---

## Datei-Übersicht

| Pfad | Zweck |
|------|-------|
| `backend/src/db/migrations/059_amazon_sourcing_sample_ordered.sql` | Spalte `sample_ordered` |
| `backend/src/db/migrations/060_amazon_brand_name.sql` | Brand-Tabellen |
| `backend/test/schema.amazon_brand_name.test.ts` | Schema-Test |
| `backend/test/integration.amazon_sourcing.test.ts` | Erweiterung: 2 Tests für `sample_ordered` |
| `backend/src/routes/amazon.sourcing.routes.ts` | PATCH-Validator erweitert |
| `backend/src/routes/amazon.brand.routes.ts` | GET/PATCH + Candidate-CRUD |
| `backend/test/integration.amazon_brand.test.ts` | Integration-Tests |
| `backend/src/app.ts` | Mount neue Route |
| `frontend/src/api/amazon.api.ts` | Sample-Typ erweitert + Brand-Types/Wrappers |
| `frontend/src/hooks/amazon/useBrand.ts` | TanStack Query Hooks |
| `frontend/src/components/amazon/SourcingSampleRow.tsx` | "Beauftragt"-Checkbox-Spalte |
| `frontend/src/components/amazon/SourcingSampleTable.tsx` | Spalten-Header "Beauftragt" |
| `frontend/src/components/amazon/BrandNotes.tsx` | Sektion-weite Notizen-Textarea |
| `frontend/src/components/amazon/BrandNameRow.tsx` | Eine Zeile (Name + 5 Checkboxen + Remarks + Archiv) |
| `frontend/src/components/amazon/BrandNameTable.tsx` | Tabelle + Anlege-Form + Archiv-Toggle + PDF-Button |
| `frontend/src/components/amazon/DeleteBrandNameDialog.tsx` | Confirm-Modal |
| `frontend/src/components/amazon/BrandFavoriteCard.tsx` | Recherche-Karte je Favorit |
| `frontend/src/components/amazon/BrandFavoritesPanel.tsx` | Container für Favoriten-Karten |
| `frontend/src/components/amazon/BrandNameSection.tsx` | Akkordeon-Wrapper |
| `frontend/src/lib/amazon/exportBrandPdf.ts` | PDF-Generator |
| `frontend/src/pages/amazon/AmazonProductDetailPage.tsx` | `<BrandNameSection>` einbinden |

---

## Task 1: Migration 059 + Sourcing-Sample-Erweiterung (Backend)

**Files:**
- Create: `backend/src/db/migrations/059_amazon_sourcing_sample_ordered.sql`
- Modify: `backend/test/integration.amazon_sourcing.test.ts` (2 Tests anhängen)
- Modify: `backend/src/routes/amazon.sourcing.routes.ts` (PATCH-Validator erweitern)

- [ ] **Step 1: Tests anhaengen (RED)**

Im File `backend/test/integration.amazon_sourcing.test.ts` am Ende der `describe('Sourcing API — Samples')`-Suite (vor dem schließenden `});` dieser Suite, NACH dem letzten existierenden `it(...)`) einfügen:

```ts
  it('PATCH setzt sample_ordered = 1', async () => {
    const productId = makeProduct(db);
    const sid = (await request(app).post(`/api/amazon/products/${productId}/sourcing/samples`).send({})).body.sample.id;

    const r = await request(app)
      .patch(`/api/amazon/products/${productId}/sourcing/samples/${sid}`)
      .send({ sample_ordered: 1 });

    expect(r.status).toBe(200);
    expect(r.body.sample.sample_ordered).toBe(1);
  });

  it('PATCH ungueltiges sample_ordered -> 400', async () => {
    const productId = makeProduct(db);
    const sid = (await request(app).post(`/api/amazon/products/${productId}/sourcing/samples`).send({})).body.sample.id;

    const r = await request(app)
      .patch(`/api/amazon/products/${productId}/sourcing/samples/${sid}`)
      .send({ sample_ordered: 2 });

    expect(r.status).toBe(400);
  });
```

- [ ] **Step 2: Test laufen lassen, Fail bestaetigen**

```bash
cd backend && npm test -- integration.amazon_sourcing
```
Erwartet: 2 neue Tests **FAIL** (Spalte existiert nicht / Validator kennt das Feld nicht).

- [ ] **Step 3: Migration schreiben**

Datei `backend/src/db/migrations/059_amazon_sourcing_sample_ordered.sql`:

```sql
-- Migration 059: Amazon Sourcing — Beauftragt-Checkbox pro Sample (2026-06-01)
-- WICHTIG: Kein FK-Pragma setzen
-- WICHTIG: Auto-Backup laeuft via migrate.ts

ALTER TABLE amazon_sourcing_samples
  ADD COLUMN sample_ordered INTEGER NOT NULL DEFAULT 0
  CHECK (sample_ordered IN (0,1));
```

- [ ] **Step 4: Backend-Validator erweitern**

In `backend/src/routes/amazon.sourcing.routes.ts`: im PATCH-Handler `router.patch('/products/:id/sourcing/samples/:sampleId', ...)`, in der Validator-Sektion, **direkt nach dem `is_winner`-Block** (vor dem `if (updates.length > 0)`-Block), folgenden Block einfügen:

```ts
  if (body.sample_ordered !== undefined) {
    if (body.sample_ordered !== 0 && body.sample_ordered !== 1) {
      res.status(400).json({ error: 'invalid sample_ordered' });
      return;
    }
    updates.push('sample_ordered = ?');
    params.push(body.sample_ordered);
  }
```

Außerdem: im `SampleRow`-Interface oben in derselben Datei das neue Feld ergänzen — die Zeile `notizen: string | null;` durch:

```ts
  notizen: string | null;
  sample_ordered: number;
```

ersetzen.

- [ ] **Step 5: Tests laufen lassen, alle gruen**

```bash
cd backend && npm test -- integration.amazon_sourcing
```
Erwartet: **alle 20 Tests** PASS (18 alte + 2 neue).

- [ ] **Step 6: Commit**

```bash
git add backend/src/db/migrations/059_amazon_sourcing_sample_ordered.sql backend/test/integration.amazon_sourcing.test.ts backend/src/routes/amazon.sourcing.routes.ts
git commit -m "feat(amazon-sourcing): Beauftragt-Checkbox-Spalte fuer Samples

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Migration 060 + Schema-Test (Brand-Tabellen)

**Files:**
- Create: `backend/src/db/migrations/060_amazon_brand_name.sql`
- Create: `backend/test/schema.amazon_brand_name.test.ts`

- [ ] **Step 1: Schema-Test schreiben (RED)**

Datei `backend/test/schema.amazon_brand_name.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from './setup';

interface SqliteMaster { name: string; type: string; }
interface ColumnInfo { name: string; type: string; notnull: number; dflt_value: string | null; pk: number; }

describe('Migration 060 — amazon_brand_name + amazon_brand_name_candidates', () => {
  let db: Database.Database;
  beforeEach(() => { db = createTestDb(); });

  it('erstellt beide Brand-Tabellen', () => {
    const brand = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='amazon_brand_name'`
    ).get() as SqliteMaster | undefined;
    const cands = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='amazon_brand_name_candidates'`
    ).get() as SqliteMaster | undefined;
    expect(brand).toBeDefined();
    expect(cands).toBeDefined();
  });

  it('amazon_brand_name hat product_id PK + status + is_expanded + notes', () => {
    const cols = db.prepare(`PRAGMA table_info(amazon_brand_name)`).all() as ColumnInfo[];
    const names = new Set(cols.map(c => c.name));
    for (const n of ['product_id', 'status', 'is_expanded', 'notes', 'updated_at']) {
      expect(names.has(n), `Spalte ${n} fehlt`).toBe(true);
    }
  });

  it('amazon_brand_name.status CHECK', () => {
    db.prepare(`INSERT INTO amazon_products (name) VALUES ('P')`).run();
    const productId = (db.prepare(`SELECT last_insert_rowid() AS id`).get() as { id: number }).id;
    const insert = db.prepare(`INSERT INTO amazon_brand_name (product_id, status) VALUES (?, ?)`);
    expect(() => insert.run(productId, 'kaputt')).toThrow();
    db.prepare(`DELETE FROM amazon_brand_name WHERE product_id=?`).run(productId);
    expect(() => insert.run(productId, 'offen')).not.toThrow();
  });

  it('amazon_brand_name_candidates hat alle Spalten + Index', () => {
    const cols = db.prepare(`PRAGMA table_info(amazon_brand_name_candidates)`).all() as ColumnInfo[];
    const names = new Set(cols.map(c => c.name));
    for (const n of [
      'id', 'product_id', 'sort_order', 'name',
      'is_interesting', 'is_maybe', 'is_yes', 'is_no', 'is_favorite', 'is_archived',
      'remarks',
      'trademark_status', 'domain_com_status', 'domain_de_status', 'social_status',
      'research_url', 'research_notes',
      'created_at', 'updated_at',
    ]) {
      expect(names.has(n), `Spalte ${n} fehlt`).toBe(true);
    }
    const idx = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='index' AND name='amazon_brand_name_candidates_product_idx'`
    ).get();
    expect(idx).toBeDefined();
  });

  it('Candidates CHECK-Constraints', () => {
    db.prepare(`INSERT INTO amazon_products (name) VALUES ('P')`).run();
    const pid = (db.prepare(`SELECT last_insert_rowid() AS id`).get() as { id: number }).id;

    expect(() => db.prepare(
      `INSERT INTO amazon_brand_name_candidates (product_id, name, trademark_status) VALUES (?, 'X', ?)`
    ).run(pid, 'kaputt')).toThrow();

    expect(() => db.prepare(
      `INSERT INTO amazon_brand_name_candidates (product_id, name, domain_com_status) VALUES (?, 'X', ?)`
    ).run(pid, 'belegt')).not.toThrow();

    expect(() => db.prepare(
      `INSERT INTO amazon_brand_name_candidates (product_id, name, is_favorite) VALUES (?, 'X', ?)`
    ).run(pid, 2)).toThrow();
  });

  it('Cascade-Delete entfernt Brand-Daten beim Produkt-Loeschen', () => {
    db.prepare(`INSERT INTO amazon_products (name) VALUES ('P')`).run();
    const pid = (db.prepare(`SELECT last_insert_rowid() AS id`).get() as { id: number }).id;

    db.prepare(`INSERT INTO amazon_brand_name (product_id) VALUES (?)`).run(pid);
    db.prepare(`INSERT INTO amazon_brand_name_candidates (product_id, name) VALUES (?, 'Acme')`).run(pid);
    db.prepare(`INSERT INTO amazon_brand_name_candidates (product_id, name) VALUES (?, 'Beta')`).run(pid);

    db.prepare(`DELETE FROM amazon_products WHERE id=?`).run(pid);

    expect(db.prepare(`SELECT * FROM amazon_brand_name WHERE product_id=?`).get(pid)).toBeUndefined();
    expect(db.prepare(`SELECT * FROM amazon_brand_name_candidates WHERE product_id=?`).all(pid)).toEqual([]);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fail bestaetigen**

```bash
cd backend && npm test -- schema.amazon_brand_name
```
Erwartet: alle 6 Tests **FAIL**.

- [ ] **Step 3: Migration schreiben**

Datei `backend/src/db/migrations/060_amazon_brand_name.sql`:

```sql
-- Migration 060: Amazon Brand-Sektion — Namen + Favoriten-Recherche (2026-06-01)
-- WICHTIG: Kein FK-Pragma setzen
-- WICHTIG: Auto-Backup laeuft via migrate.ts

CREATE TABLE amazon_brand_name (
  product_id  INTEGER PRIMARY KEY
              REFERENCES amazon_products(id) ON DELETE CASCADE,
  status      TEXT    NOT NULL DEFAULT 'offen'
              CHECK (status IN ('offen','in_bearbeitung','erledigt')),
  is_expanded INTEGER NOT NULL DEFAULT 1
              CHECK (is_expanded IN (0,1)),
  notes       TEXT,
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE amazon_brand_name_candidates (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id      INTEGER NOT NULL
                  REFERENCES amazon_products(id) ON DELETE CASCADE,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  name            TEXT NOT NULL,
  is_interesting  INTEGER NOT NULL DEFAULT 0 CHECK (is_interesting IN (0,1)),
  is_maybe        INTEGER NOT NULL DEFAULT 0 CHECK (is_maybe IN (0,1)),
  is_yes          INTEGER NOT NULL DEFAULT 0 CHECK (is_yes IN (0,1)),
  is_no           INTEGER NOT NULL DEFAULT 0 CHECK (is_no IN (0,1)),
  is_favorite     INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0,1)),
  is_archived     INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0,1)),
  remarks         TEXT,
  trademark_status   TEXT CHECK (trademark_status   IS NULL OR trademark_status   IN ('frei','belegt','unklar')),
  domain_com_status  TEXT CHECK (domain_com_status  IS NULL OR domain_com_status  IN ('frei','belegt','unklar')),
  domain_de_status   TEXT CHECK (domain_de_status   IS NULL OR domain_de_status   IN ('frei','belegt','unklar')),
  social_status      TEXT CHECK (social_status      IS NULL OR social_status      IN ('frei','belegt','unklar')),
  research_url       TEXT,
  research_notes     TEXT,
  created_at         INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at         INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX amazon_brand_name_candidates_product_idx
  ON amazon_brand_name_candidates (product_id, sort_order, id);
```

- [ ] **Step 4: Tests laufen lassen, alle gruen**

```bash
cd backend && npm test -- schema.amazon_brand_name
```
Erwartet: alle 6 Tests **PASS**.

- [ ] **Step 5: Commit**

```bash
git add backend/src/db/migrations/060_amazon_brand_name.sql backend/test/schema.amazon_brand_name.test.ts
git commit -m "feat(amazon-brand): Migration 060 — Brand-Tabellen + Cascade-Delete

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Backend Brand-Routes + Tests + Mount

**Files:**
- Create: `backend/src/routes/amazon.brand.routes.ts`
- Create: `backend/test/integration.amazon_brand.test.ts`
- Modify: `backend/src/app.ts`

- [ ] **Step 1: Integration-Tests schreiben (RED)**

Datei `backend/test/integration.amazon_brand.test.ts`:

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
  // @ts-expect-error
  conn.default = db;
  const routes = (await import('../src/routes/amazon.brand.routes')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/amazon', routes);
  return app;
}

function makeProduct(db: Database.Database, name = 'P'): number {
  db.prepare(`INSERT INTO amazon_products (name) VALUES (?)`).run(name);
  return Number((db.prepare(`SELECT last_insert_rowid() AS id`).get() as { id: number }).id);
}

describe('Brand API — GET + PATCH', () => {
  let db: Database.Database;
  let app: express.Express;

  beforeEach(async () => {
    db = createTestDb();
    app = await makeApp(db);
  });

  it('GET legt brand-Eintrag bei Bedarf an', async () => {
    const pid = makeProduct(db);
    const r = await request(app).get(`/api/amazon/products/${pid}/brand`);
    expect(r.status).toBe(200);
    expect(r.body.brand).toMatchObject({
      product_id: pid,
      status: 'offen',
      is_expanded: 1,
      notes: null,
    });
    expect(r.body.names).toEqual([]);
  });

  it('GET 404 wenn Produkt fehlt', async () => {
    const r = await request(app).get(`/api/amazon/products/9999/brand`);
    expect(r.status).toBe(404);
  });

  it('PATCH aendert status + notes mit Trim', async () => {
    const pid = makeProduct(db);
    await request(app).get(`/api/amazon/products/${pid}/brand`);

    const r = await request(app)
      .patch(`/api/amazon/products/${pid}/brand`)
      .send({ status: 'in_bearbeitung', notes: '  Hello  ' });

    expect(r.status).toBe(200);
    expect(r.body.brand.status).toBe('in_bearbeitung');
    expect(r.body.brand.notes).toBe('Hello');
  });

  it('PATCH ungueltiger Status -> 400', async () => {
    const pid = makeProduct(db);
    const r = await request(app).patch(`/api/amazon/products/${pid}/brand`).send({ status: 'x' });
    expect(r.status).toBe(400);
  });

  it('PATCH notes leer -> null', async () => {
    const pid = makeProduct(db);
    await request(app).patch(`/api/amazon/products/${pid}/brand`).send({ notes: 'X' });
    const r = await request(app).patch(`/api/amazon/products/${pid}/brand`).send({ notes: '' });
    expect(r.body.brand.notes).toBeNull();
  });

  it('PATCH notes > 2000 -> 400', async () => {
    const pid = makeProduct(db);
    const r = await request(app)
      .patch(`/api/amazon/products/${pid}/brand`)
      .send({ notes: 'x'.repeat(2001) });
    expect(r.status).toBe(400);
  });
});

describe('Brand API — Candidates', () => {
  let db: Database.Database;
  let app: express.Express;

  beforeEach(async () => {
    db = createTestDb();
    app = await makeApp(db);
  });

  it('POST legt Eintrag mit sort_order = max+1 an', async () => {
    const pid = makeProduct(db);

    const r1 = await request(app).post(`/api/amazon/products/${pid}/brand/names`).send({ name: 'Acme' });
    expect(r1.status).toBe(201);
    expect(r1.body.name).toMatchObject({ name: 'Acme', sort_order: 1, is_favorite: 0 });

    const r2 = await request(app).post(`/api/amazon/products/${pid}/brand/names`).send({ name: 'Beta' });
    expect(r2.body.name.sort_order).toBe(2);
  });

  it('POST mit leerem Namen -> 400', async () => {
    const pid = makeProduct(db);
    const r = await request(app).post(`/api/amazon/products/${pid}/brand/names`).send({ name: '   ' });
    expect(r.status).toBe(400);
  });

  it('POST mit 201-Zeichen-Namen -> 400', async () => {
    const pid = makeProduct(db);
    const r = await request(app).post(`/api/amazon/products/${pid}/brand/names`).send({ name: 'x'.repeat(201) });
    expect(r.status).toBe(400);
  });

  it('Candidate-Limit 100: 101. POST -> 400', async () => {
    const pid = makeProduct(db);
    const insert = db.prepare(`INSERT INTO amazon_brand_name_candidates (product_id, name, sort_order) VALUES (?, ?, ?)`);
    for (let i = 1; i <= 100; i++) insert.run(pid, `N${i}`, i);

    const r = await request(app).post(`/api/amazon/products/${pid}/brand/names`).send({ name: 'overflow' });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/limit/i);
  });

  it('PATCH Bool-Felder + remarks mit Trim', async () => {
    const pid = makeProduct(db);
    const cid = (await request(app).post(`/api/amazon/products/${pid}/brand/names`).send({ name: 'Acme' })).body.name.id;

    const r = await request(app)
      .patch(`/api/amazon/products/${pid}/brand/names/${cid}`)
      .send({ is_interesting: 1, is_favorite: 1, remarks: '  hi  ' });

    expect(r.status).toBe(200);
    expect(r.body.name.is_interesting).toBe(1);
    expect(r.body.name.is_favorite).toBe(1);
    expect(r.body.name.remarks).toBe('hi');
  });

  it('PATCH research_status-Felder mit Enum + null', async () => {
    const pid = makeProduct(db);
    const cid = (await request(app).post(`/api/amazon/products/${pid}/brand/names`).send({ name: 'Acme' })).body.name.id;

    const r1 = await request(app).patch(`/api/amazon/products/${pid}/brand/names/${cid}`)
      .send({ trademark_status: 'frei', domain_com_status: 'belegt', domain_de_status: 'unklar', social_status: 'frei' });
    expect(r1.status).toBe(200);
    expect(r1.body.name.trademark_status).toBe('frei');

    const r2 = await request(app).patch(`/api/amazon/products/${pid}/brand/names/${cid}`)
      .send({ trademark_status: 'kaputt' });
    expect(r2.status).toBe(400);

    const r3 = await request(app).patch(`/api/amazon/products/${pid}/brand/names/${cid}`)
      .send({ trademark_status: null });
    expect(r3.body.name.trademark_status).toBeNull();
  });

  it('PATCH research_url > 500 -> 400', async () => {
    const pid = makeProduct(db);
    const cid = (await request(app).post(`/api/amazon/products/${pid}/brand/names`).send({ name: 'Acme' })).body.name.id;
    const r = await request(app).patch(`/api/amazon/products/${pid}/brand/names/${cid}`)
      .send({ research_url: 'x'.repeat(501) });
    expect(r.status).toBe(400);
  });

  it('PATCH research_notes > 2000 -> 400', async () => {
    const pid = makeProduct(db);
    const cid = (await request(app).post(`/api/amazon/products/${pid}/brand/names`).send({ name: 'Acme' })).body.name.id;
    const r = await request(app).patch(`/api/amazon/products/${pid}/brand/names/${cid}`)
      .send({ research_notes: 'x'.repeat(2001) });
    expect(r.status).toBe(400);
  });

  it('PATCH remarks > 300 -> 400', async () => {
    const pid = makeProduct(db);
    const cid = (await request(app).post(`/api/amazon/products/${pid}/brand/names`).send({ name: 'Acme' })).body.name.id;
    const r = await request(app).patch(`/api/amazon/products/${pid}/brand/names/${cid}`)
      .send({ remarks: 'x'.repeat(301) });
    expect(r.status).toBe(400);
  });

  it('PATCH name aendert Wert', async () => {
    const pid = makeProduct(db);
    const cid = (await request(app).post(`/api/amazon/products/${pid}/brand/names`).send({ name: 'Acme' })).body.name.id;
    const r = await request(app).patch(`/api/amazon/products/${pid}/brand/names/${cid}`)
      .send({ name: 'Acmeo' });
    expect(r.body.name.name).toBe('Acmeo');
  });

  it('DELETE entfernt Candidate', async () => {
    const pid = makeProduct(db);
    const cid = (await request(app).post(`/api/amazon/products/${pid}/brand/names`).send({ name: 'Acme' })).body.name.id;
    const r = await request(app).delete(`/api/amazon/products/${pid}/brand/names/${cid}`);
    expect(r.status).toBe(204);
    expect(db.prepare(`SELECT * FROM amazon_brand_name_candidates WHERE id=?`).get(cid)).toBeUndefined();
  });

  it('DELETE fremder Candidate -> 404', async () => {
    const pA = makeProduct(db, 'A');
    const pB = makeProduct(db, 'B');
    const cid = (await request(app).post(`/api/amazon/products/${pA}/brand/names`).send({ name: 'Acme' })).body.name.id;
    const r = await request(app).delete(`/api/amazon/products/${pB}/brand/names/${cid}`);
    expect(r.status).toBe(404);
  });

  it('GET liefert Candidates sortiert', async () => {
    const pid = makeProduct(db);
    await request(app).post(`/api/amazon/products/${pid}/brand/names`).send({ name: 'A' });
    await request(app).post(`/api/amazon/products/${pid}/brand/names`).send({ name: 'B' });
    await request(app).post(`/api/amazon/products/${pid}/brand/names`).send({ name: 'C' });
    const r = await request(app).get(`/api/amazon/products/${pid}/brand`);
    expect(r.body.names.map((n: { name: string }) => n.name)).toEqual(['A', 'B', 'C']);
  });
});
```

- [ ] **Step 2: Tests laufen lassen, Fail bestaetigen**

```bash
cd backend && npm test -- integration.amazon_brand
```
Erwartet: **alle FAIL** (Routendatei fehlt).

- [ ] **Step 3: Route-Datei schreiben**

Datei `backend/src/routes/amazon.brand.routes.ts`:

```ts
import { Router, type Request, type Response } from 'express';
import db from '../db/connection';

const router = Router();

type BrandStatus = 'offen' | 'in_bearbeitung' | 'erledigt';
const VALID_BRAND_STATUS: ReadonlySet<BrandStatus> = new Set(['offen', 'in_bearbeitung', 'erledigt']);

type ResearchStatus = 'frei' | 'belegt' | 'unklar';
const VALID_RESEARCH_STATUS: ReadonlySet<ResearchStatus> = new Set(['frei', 'belegt', 'unklar']);

const CANDIDATE_LIMIT = 100;
const MAX_NAME = 200;
const MAX_REMARKS = 300;
const MAX_URL = 500;
const MAX_NOTES = 2000;

interface BrandRow {
  product_id: number;
  status: BrandStatus;
  is_expanded: number;
  notes: string | null;
  updated_at: number;
}

interface CandidateRow {
  id: number;
  product_id: number;
  sort_order: number;
  name: string;
  is_interesting: number;
  is_maybe: number;
  is_yes: number;
  is_no: number;
  is_favorite: number;
  is_archived: number;
  remarks: string | null;
  trademark_status: ResearchStatus | null;
  domain_com_status: ResearchStatus | null;
  domain_de_status: ResearchStatus | null;
  social_status: ResearchStatus | null;
  research_url: string | null;
  research_notes: string | null;
  created_at: number;
  updated_at: number;
}

function ensureProduct(id: number): boolean {
  return db.prepare(`SELECT 1 FROM amazon_products WHERE id = ?`).get(id) !== undefined;
}

function getOrCreateBrand(productId: number): BrandRow {
  let row = db.prepare(`SELECT * FROM amazon_brand_name WHERE product_id = ?`).get(productId) as BrandRow | undefined;
  if (!row) {
    db.prepare(`INSERT INTO amazon_brand_name (product_id) VALUES (?)`).run(productId);
    row = db.prepare(`SELECT * FROM amazon_brand_name WHERE product_id = ?`).get(productId) as BrandRow;
  }
  return row;
}

function listCandidates(productId: number): CandidateRow[] {
  return db.prepare(
    `SELECT * FROM amazon_brand_name_candidates WHERE product_id = ? ORDER BY sort_order, id`
  ).all(productId) as CandidateRow[];
}

function normalizeText(raw: unknown, maxLen: number): { ok: true; value: string | null } | { ok: false } {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: false };
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: true, value: null };
  if (trimmed.length > maxLen) return { ok: false };
  return { ok: true, value: trimmed };
}

function loadCandidate(productId: number, candidateId: number): CandidateRow | undefined {
  return db.prepare(
    `SELECT * FROM amazon_brand_name_candidates WHERE id = ? AND product_id = ?`
  ).get(candidateId, productId) as CandidateRow | undefined;
}

// GET /api/amazon/products/:id/brand
router.get('/products/:id/brand', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) {
    res.status(404).json({ error: 'product not found' });
    return;
  }
  const brand = getOrCreateBrand(id);
  const names = listCandidates(id);
  res.json({ brand, names });
});

// PATCH /api/amazon/products/:id/brand
router.patch('/products/:id/brand', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) {
    res.status(404).json({ error: 'product not found' });
    return;
  }
  getOrCreateBrand(id);

  const body = (req.body as Record<string, unknown>) ?? {};
  const updates: string[] = [];
  const params: unknown[] = [];

  if (body.status !== undefined) {
    if (typeof body.status !== 'string' || !VALID_BRAND_STATUS.has(body.status as BrandStatus)) {
      res.status(400).json({ error: 'invalid status' });
      return;
    }
    updates.push('status = ?');
    params.push(body.status);
  }

  if (body.is_expanded !== undefined) {
    if (body.is_expanded !== 0 && body.is_expanded !== 1) {
      res.status(400).json({ error: 'invalid is_expanded' });
      return;
    }
    updates.push('is_expanded = ?');
    params.push(body.is_expanded);
  }

  if (body.notes !== undefined) {
    const v = normalizeText(body.notes, MAX_NOTES);
    if (!v.ok) { res.status(400).json({ error: 'invalid notes' }); return; }
    updates.push('notes = ?');
    params.push(v.value);
  }

  if (updates.length > 0) {
    updates.push('updated_at = unixepoch()');
    params.push(id);
    db.prepare(`UPDATE amazon_brand_name SET ${updates.join(', ')} WHERE product_id = ?`).run(...params);
  }

  const brand = getOrCreateBrand(id);
  res.json({ brand });
});

// POST /api/amazon/products/:id/brand/names
router.post('/products/:id/brand/names', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) {
    res.status(404).json({ error: 'product not found' });
    return;
  }

  const nameRaw = (req.body as { name?: unknown })?.name;
  const v = normalizeText(nameRaw, MAX_NAME);
  if (!v.ok || v.value === null) {
    res.status(400).json({ error: 'name length invalid' });
    return;
  }

  const count = (db.prepare(
    `SELECT COUNT(*) AS c FROM amazon_brand_name_candidates WHERE product_id = ?`
  ).get(id) as { c: number }).c;
  if (count >= CANDIDATE_LIMIT) {
    res.status(400).json({ error: 'candidate limit reached' });
    return;
  }

  const maxOrder = (db.prepare(
    `SELECT COALESCE(MAX(sort_order), 0) AS m FROM amazon_brand_name_candidates WHERE product_id = ?`
  ).get(id) as { m: number }).m;

  const result = db.prepare(
    `INSERT INTO amazon_brand_name_candidates (product_id, sort_order, name) VALUES (?, ?, ?)`
  ).run(id, maxOrder + 1, v.value);

  const row = db.prepare(`SELECT * FROM amazon_brand_name_candidates WHERE id = ?`).get(result.lastInsertRowid) as CandidateRow;
  res.status(201).json({ name: row });
});

// PATCH /api/amazon/products/:id/brand/names/:nameId
router.patch('/products/:id/brand/names/:nameId', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const cid = Number(req.params.nameId);
  if (!Number.isInteger(id) || !Number.isInteger(cid)) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  if (!ensureProduct(id) || !loadCandidate(id, cid)) {
    res.status(404).json({ error: 'not found' });
    return;
  }

  const body = (req.body as Record<string, unknown>) ?? {};
  const updates: string[] = [];
  const params: unknown[] = [];

  // name
  if (body.name !== undefined) {
    const v = normalizeText(body.name, MAX_NAME);
    if (!v.ok || v.value === null) { res.status(400).json({ error: 'name length invalid' }); return; }
    updates.push('name = ?');
    params.push(v.value);
  }

  // Bool-Felder
  for (const col of ['is_interesting', 'is_maybe', 'is_yes', 'is_no', 'is_favorite', 'is_archived'] as const) {
    if (body[col] !== undefined) {
      if (body[col] !== 0 && body[col] !== 1) {
        res.status(400).json({ error: `invalid ${col}` });
        return;
      }
      updates.push(`${col} = ?`);
      params.push(body[col]);
    }
  }

  // remarks (max 300)
  if (body.remarks !== undefined) {
    const v = normalizeText(body.remarks, MAX_REMARKS);
    if (!v.ok) { res.status(400).json({ error: 'invalid remarks' }); return; }
    updates.push('remarks = ?');
    params.push(v.value);
  }

  // research_url (max 500)
  if (body.research_url !== undefined) {
    const v = normalizeText(body.research_url, MAX_URL);
    if (!v.ok) { res.status(400).json({ error: 'invalid research_url' }); return; }
    updates.push('research_url = ?');
    params.push(v.value);
  }

  // research_notes (max 2000)
  if (body.research_notes !== undefined) {
    const v = normalizeText(body.research_notes, MAX_NOTES);
    if (!v.ok) { res.status(400).json({ error: 'invalid research_notes' }); return; }
    updates.push('research_notes = ?');
    params.push(v.value);
  }

  // research status fields
  for (const col of ['trademark_status', 'domain_com_status', 'domain_de_status', 'social_status'] as const) {
    if (body[col] !== undefined) {
      if (body[col] !== null &&
          (typeof body[col] !== 'string' || !VALID_RESEARCH_STATUS.has(body[col] as ResearchStatus))) {
        res.status(400).json({ error: `invalid ${col}` });
        return;
      }
      updates.push(`${col} = ?`);
      params.push(body[col]);
    }
  }

  // sort_order
  if (body.sort_order !== undefined) {
    if (typeof body.sort_order !== 'number' || !Number.isInteger(body.sort_order)) {
      res.status(400).json({ error: 'invalid sort_order' });
      return;
    }
    updates.push('sort_order = ?');
    params.push(body.sort_order);
  }

  if (updates.length > 0) {
    updates.push('updated_at = unixepoch()');
    params.push(cid);
    db.prepare(`UPDATE amazon_brand_name_candidates SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }

  const row = db.prepare(`SELECT * FROM amazon_brand_name_candidates WHERE id = ?`).get(cid) as CandidateRow;
  res.json({ name: row });
});

// DELETE /api/amazon/products/:id/brand/names/:nameId
router.delete('/products/:id/brand/names/:nameId', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const cid = Number(req.params.nameId);
  if (!Number.isInteger(id) || !Number.isInteger(cid)) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  if (!ensureProduct(id) || !loadCandidate(id, cid)) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  db.prepare(`DELETE FROM amazon_brand_name_candidates WHERE id = ?`).run(cid);
  res.status(204).end();
});

export default router;
```

- [ ] **Step 4: Mount in app.ts**

In `backend/src/app.ts`:

(a) Import nach `amazonSourcingRoutes` ergänzen:
```ts
import amazonBrandRoutes from './routes/amazon.brand.routes';
```

(b) Mount nach `app.use('/api/amazon', amazonSourcingRoutes);` ergänzen:
```ts
app.use('/api/amazon', amazonBrandRoutes);
```

- [ ] **Step 5: Tests laufen lassen, alle gruen**

```bash
cd backend && npm test -- integration.amazon_brand
```
Erwartet: **alle Tests** PASS.

- [ ] **Step 6: Backend starten und Health pruefen**

```bash
cd backend && pkill -f "tsx watch" 2>/dev/null; sleep 1; npm run dev &
sleep 3
curl -s http://localhost:3001/api/health
```
Erwartet: `{"status":"ok"}`. Dann `pkill -f "tsx watch"`.

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/amazon.brand.routes.ts backend/test/integration.amazon_brand.test.ts backend/src/app.ts
git commit -m "feat(amazon-brand): Backend-Routes GET/PATCH/Candidate-CRUD + Mount

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Frontend API-Types + Hooks

**Files:**
- Modify: `frontend/src/api/amazon.api.ts` (anhängen)
- Create: `frontend/src/hooks/amazon/useBrand.ts`

- [ ] **Step 1: API-Wrappers anhaengen**

Am Ende von `frontend/src/api/amazon.api.ts` zwei Blöcke anhängen.

(a) Erweiterung des bestehenden `SourcingSample`-Interfaces ist NICHT möglich (TypeScript erlaubt kein Interface-Reopen mit zusätzlichen Pflichtfeldern). Stattdessen wird das bestehende `SourcingSample`-Interface durch ein direktes Edit erweitert. Suche das Interface (das die Spalten `id, product_id, sort_order, is_winner, hersteller, sample_kosten, …` enthält) und füge die Zeile

```ts
  sample_ordered: 0 | 1;
```

direkt nach `is_winner: 0 | 1;` ein. Und im `SamplePatch`-Type die Zeile

```ts
  sample_ordered: 0 | 1;
```

als zusätzliche optionale Eigenschaft im `Partial<{...}>` mit aufnehmen (nach `is_winner: 0 | 1;`).

(b) Brand-Types und Wrappers ans Datei-Ende anhängen:

```ts
// ── Brand-Sektion ─────────────────────────────────────────────────────────────

export type BrandStatus = 'offen' | 'in_bearbeitung' | 'erledigt';
export type ResearchStatus = 'frei' | 'belegt' | 'unklar';

export interface BrandName {
  product_id: number;
  status: BrandStatus;
  is_expanded: 0 | 1;
  notes: string | null;
  updated_at: number;
}

export interface BrandCandidate {
  id: number;
  product_id: number;
  sort_order: number;
  name: string;
  is_interesting: 0 | 1;
  is_maybe: 0 | 1;
  is_yes: 0 | 1;
  is_no: 0 | 1;
  is_favorite: 0 | 1;
  is_archived: 0 | 1;
  remarks: string | null;
  trademark_status: ResearchStatus | null;
  domain_com_status: ResearchStatus | null;
  domain_de_status: ResearchStatus | null;
  social_status: ResearchStatus | null;
  research_url: string | null;
  research_notes: string | null;
  created_at: number;
  updated_at: number;
}

export interface BrandPayload {
  brand: BrandName;
  names: BrandCandidate[];
}

export type BrandPatch = Partial<Pick<BrandName, 'status' | 'is_expanded' | 'notes'>>;

export type CandidatePatch = Partial<{
  name: string;
  is_interesting: 0 | 1;
  is_maybe: 0 | 1;
  is_yes: 0 | 1;
  is_no: 0 | 1;
  is_favorite: 0 | 1;
  is_archived: 0 | 1;
  remarks: string | null;
  trademark_status: ResearchStatus | null;
  domain_com_status: ResearchStatus | null;
  domain_de_status: ResearchStatus | null;
  social_status: ResearchStatus | null;
  research_url: string | null;
  research_notes: string | null;
  sort_order: number;
}>;

export async function fetchBrand(productId: number): Promise<BrandPayload> {
  const r = await apiClient.get<BrandPayload>(`/amazon/products/${productId}/brand`);
  return r.data;
}

export async function updateBrand(productId: number, patch: BrandPatch): Promise<BrandName> {
  const r = await apiClient.patch<{ brand: BrandName }>(`/amazon/products/${productId}/brand`, patch);
  return r.data.brand;
}

export async function createCandidate(productId: number, name: string): Promise<BrandCandidate> {
  const r = await apiClient.post<{ name: BrandCandidate }>(
    `/amazon/products/${productId}/brand/names`,
    { name },
  );
  return r.data.name;
}

export async function updateCandidate(
  productId: number,
  candidateId: number,
  patch: CandidatePatch,
): Promise<BrandCandidate> {
  const r = await apiClient.patch<{ name: BrandCandidate }>(
    `/amazon/products/${productId}/brand/names/${candidateId}`,
    patch,
  );
  return r.data.name;
}

export async function deleteCandidate(productId: number, candidateId: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${productId}/brand/names/${candidateId}`);
}
```

- [ ] **Step 2: Hook-Datei schreiben**

Datei `frontend/src/hooks/amazon/useBrand.ts`:

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  type BrandName, type BrandPatch, type BrandPayload,
  type BrandCandidate, type CandidatePatch,
  fetchBrand, updateBrand as apiUpdateBrand,
  createCandidate as apiCreateCandidate,
  updateCandidate as apiUpdateCandidate,
  deleteCandidate as apiDeleteCandidate,
} from '../../api/amazon.api';

export const brandKey = (productId: number) =>
  ['amazon', 'products', productId, 'brand'] as const;

export function useBrand(productId: number) {
  return useQuery({
    queryKey: brandKey(productId),
    queryFn: () => fetchBrand(productId),
    enabled: Number.isInteger(productId) && productId > 0,
  });
}

export function useUpdateBrand(productId: number) {
  const qc = useQueryClient();
  const key = brandKey(productId);
  return useMutation({
    mutationFn: (patch: BrandPatch) => apiUpdateBrand(productId, patch),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<BrandPayload>(key);
      if (prev) {
        qc.setQueryData<BrandPayload>(key, {
          ...prev,
          brand: { ...prev.brand, ...patch } as BrandName,
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(key, ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export function useCreateCandidate(productId: number) {
  const qc = useQueryClient();
  const key = brandKey(productId);
  return useMutation({
    mutationFn: (name: string) => apiCreateCandidate(productId, name),
    onSuccess: (candidate) => {
      const prev = qc.getQueryData<BrandPayload>(key);
      if (prev) {
        qc.setQueryData<BrandPayload>(key, {
          ...prev,
          names: [...prev.names, candidate],
        });
      } else {
        qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}

export function useUpdateCandidate(productId: number) {
  const qc = useQueryClient();
  const key = brandKey(productId);
  return useMutation({
    mutationFn: ({ candidateId, patch }: { candidateId: number; patch: CandidatePatch }) =>
      apiUpdateCandidate(productId, candidateId, patch),
    onMutate: async ({ candidateId, patch }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<BrandPayload>(key);
      if (prev) {
        qc.setQueryData<BrandPayload>(key, {
          ...prev,
          names: prev.names.map(n =>
            n.id === candidateId ? ({ ...n, ...patch } as BrandCandidate) : n,
          ),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(key, ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export function useDeleteCandidate(productId: number) {
  const qc = useQueryClient();
  const key = brandKey(productId);
  return useMutation({
    mutationFn: (candidateId: number) => apiDeleteCandidate(productId, candidateId),
    onMutate: async (candidateId) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<BrandPayload>(key);
      if (prev) {
        qc.setQueryData<BrandPayload>(key, {
          ...prev,
          names: prev.names.filter(n => n.id !== candidateId),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(key, ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}
```

- [ ] **Step 3: Typecheck**

```bash
cd frontend && npm run typecheck
```
Erwartet: 0 Fehler.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/amazon.api.ts frontend/src/hooks/amazon/useBrand.ts
git commit -m "feat(amazon-brand): Frontend API + TanStack-Query Hooks

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Frontend Sourcing-Spalte "Beauftragt"

**Files:**
- Modify: `frontend/src/components/amazon/SourcingSampleTable.tsx`
- Modify: `frontend/src/components/amazon/SourcingSampleRow.tsx`

- [ ] **Step 1: Spalten-Header ergaenzen**

In `frontend/src/components/amazon/SourcingSampleTable.tsx` im `<thead>` zwischen den `<th>`-Tags für "Lieferzeit" und "Qualität" einfügen:

```tsx
                <th style={{ ...TH_STYLE, textAlign: 'center' }}>Beauftragt</th>
```

Konkret: die Zeile `<th style={TH_STYLE}>Lieferzeit</th>` muss gefolgt werden von der neuen Beauftragt-Spalte, dann erst `<th style={TH_STYLE}>Qualität</th>`.

- [ ] **Step 2: Zellen-Renderer in der Zeile ergaenzen**

In `frontend/src/components/amazon/SourcingSampleRow.tsx` finde das `<td>` für "Lieferzeit" (mit `placeholder="z.B. 3-5 Tage"`). Direkt nach dem schließenden `</td>` dieses Lieferzeit-Inputs, vor dem `<td>` mit dem `qualitaet`-Select, einfügen:

```tsx
      <td className="p-2 text-center">
        <input
          type="checkbox"
          checked={sample.sample_ordered === 1}
          onChange={(e) => patch({ sample_ordered: e.target.checked ? 1 : 0 })}
          aria-label="Sample beauftragt"
          className="w-4 h-4"
          style={{ accentColor: 'var(--color-primary)' }}
        />
      </td>
```

- [ ] **Step 3: Typecheck**

```bash
cd frontend && npm run typecheck
```
Erwartet: 0 Fehler.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/amazon/SourcingSampleTable.tsx frontend/src/components/amazon/SourcingSampleRow.tsx
git commit -m "feat(amazon-sourcing): UI-Spalte 'Beauftragt' in Sample-Tabelle

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: BrandNotes + BrandNameRow + DeleteBrandNameDialog

**Files:**
- Create: `frontend/src/components/amazon/BrandNotes.tsx`
- Create: `frontend/src/components/amazon/BrandNameRow.tsx`
- Create: `frontend/src/components/amazon/DeleteBrandNameDialog.tsx`

- [ ] **Step 1: BrandNotes**

Datei `frontend/src/components/amazon/BrandNotes.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { useUpdateBrand } from '../../hooks/amazon/useBrand';

interface Props {
  productId: number;
  notes: string | null;
}

export function BrandNotes({ productId, notes }: Props) {
  const update = useUpdateBrand(productId);
  const [local, setLocal] = useState(notes ?? '');

  useEffect(() => { setLocal(notes ?? ''); }, [notes]);

  function save() {
    const trimmed = local.trim();
    const next: string | null = trimmed.length === 0 ? null : trimmed;
    if (next === notes) return;
    update.mutate({ notes: next });
  }

  return (
    <div className="px-5 pb-3">
      <label className="text-sm font-semibold mb-2 block" style={{ color: 'var(--color-on-surface)' }}>
        Notizen
      </label>
      <textarea
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={save}
        rows={4}
        maxLength={2000}
        placeholder="Allgemeine Notizen zur Markennamen-Findung …"
        className="w-full px-3 py-2 rounded-md text-sm resize-y"
        style={{
          background: 'var(--color-surface-container-low)',
          color: 'var(--color-on-surface)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: DeleteBrandNameDialog**

Datei `frontend/src/components/amazon/DeleteBrandNameDialog.tsx`:

```tsx
import { type BrandCandidate } from '../../api/amazon.api';
import { useDeleteCandidate } from '../../hooks/amazon/useBrand';

interface Props {
  productId: number;
  candidate: BrandCandidate | null;
  onClose: () => void;
}

export function DeleteBrandNameDialog({ productId, candidate, onClose }: Props) {
  const del = useDeleteCandidate(productId);
  if (!candidate) return null;

  async function handleConfirm() {
    if (!candidate) return;
    try {
      await del.mutateAsync(candidate.id);
      onClose();
    } catch { /* error stays in mutation state */ }
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
          Markenname löschen?
        </h2>
        <p className="text-sm mb-4" style={{ color: 'var(--color-on-surface-variant)' }}>
          „{candidate.name}" wird dauerhaft entfernt.
        </p>
        {del.isError && <p className="text-sm mb-2" style={{ color: '#fca5a5' }}>Löschen fehlgeschlagen.</p>}
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

- [ ] **Step 3: BrandNameRow**

Datei `frontend/src/components/amazon/BrandNameRow.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { type BrandCandidate, type CandidatePatch } from '../../api/amazon.api';
import { useUpdateCandidate } from '../../hooks/amazon/useBrand';

interface Props {
  productId: number;
  candidate: BrandCandidate;
  onRequestDelete: (c: BrandCandidate) => void;
}

const INPUT_STYLE: React.CSSProperties = {
  background: 'var(--color-surface-container-low)',
  color: 'var(--color-on-surface)',
  border: '1px solid rgba(255,255,255,0.08)',
};

export function BrandNameRow({ productId, candidate, onRequestDelete }: Props) {
  const update = useUpdateCandidate(productId);

  const [name, setName] = useState(candidate.name);
  const [remarks, setRemarks] = useState(candidate.remarks ?? '');

  useEffect(() => { setName(candidate.name); }, [candidate.name]);
  useEffect(() => { setRemarks(candidate.remarks ?? ''); }, [candidate.remarks]);

  function patch(p: CandidatePatch) {
    update.mutate({ candidateId: candidate.id, patch: p });
  }

  function saveName() {
    const trimmed = name.trim();
    if (trimmed.length === 0 || trimmed === candidate.name) {
      setName(candidate.name);
      return;
    }
    patch({ name: trimmed });
  }

  function saveRemarks() {
    const trimmed = remarks.trim();
    const next: string | null = trimmed.length === 0 ? null : trimmed;
    if (next === candidate.remarks) return;
    patch({ remarks: next });
  }

  function toggle(field: 'is_interesting' | 'is_maybe' | 'is_yes' | 'is_no' | 'is_favorite' | 'is_archived', current: 0 | 1) {
    patch({ [field]: current === 1 ? 0 : 1 } as CandidatePatch);
  }

  return (
    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', opacity: candidate.is_archived === 1 ? 0.55 : 1 }}>
      <td className="p-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          maxLength={200}
          className="w-full px-2 py-1 rounded text-sm"
          style={INPUT_STYLE}
        />
      </td>
      {(['is_interesting', 'is_maybe', 'is_yes', 'is_no', 'is_favorite'] as const).map(field => (
        <td key={field} className="p-2 text-center">
          <input
            type="checkbox"
            checked={candidate[field] === 1}
            onChange={() => toggle(field, candidate[field] as 0 | 1)}
            className="w-4 h-4"
            style={{ accentColor: field === 'is_favorite' ? '#fbbf24' : 'var(--color-primary)' }}
            aria-label={field}
          />
        </td>
      ))}
      <td className="p-2">
        <input
          type="text"
          value={remarks}
          onChange={(e) => setRemarks(e.target.value)}
          onBlur={saveRemarks}
          maxLength={300}
          placeholder="Bemerkungen"
          className="w-full px-2 py-1 rounded text-sm"
          style={INPUT_STYLE}
        />
      </td>
      <td className="p-2 text-center">
        <input
          type="checkbox"
          checked={candidate.is_archived === 1}
          onChange={() => toggle('is_archived', candidate.is_archived as 0 | 1)}
          className="w-4 h-4"
          style={{ accentColor: '#fdba74' }}
          aria-label="archiviert"
        />
      </td>
      <td className="p-2 text-right">
        <button
          type="button"
          onClick={() => onRequestDelete(candidate)}
          aria-label="Markenname löschen"
          className="p-1 rounded hover:bg-white/5"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#fca5a5' }}>delete</span>
        </button>
      </td>
    </tr>
  );
}
```

- [ ] **Step 4: Typecheck**

```bash
cd frontend && npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/amazon/BrandNotes.tsx frontend/src/components/amazon/DeleteBrandNameDialog.tsx frontend/src/components/amazon/BrandNameRow.tsx
git commit -m "feat(amazon-brand): BrandNotes + BrandNameRow + DeleteBrandNameDialog

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: BrandNameTable mit Anlege-Form + Sortierung + Archiv-Toggle

**Files:**
- Create: `frontend/src/components/amazon/BrandNameTable.tsx`

- [ ] **Step 1: BrandNameTable**

Datei `frontend/src/components/amazon/BrandNameTable.tsx`:

```tsx
import { useMemo, useState } from 'react';
import { type BrandCandidate, type BrandName } from '../../api/amazon.api';
import { useCreateCandidate } from '../../hooks/amazon/useBrand';
import { BrandNameRow } from './BrandNameRow';
import { DeleteBrandNameDialog } from './DeleteBrandNameDialog';

const CANDIDATE_LIMIT = 100;

const TH_STYLE: React.CSSProperties = {
  textAlign: 'left',
  fontSize: '12px',
  fontWeight: 500,
  color: 'var(--color-on-surface-variant)',
  padding: '8px',
  whiteSpace: 'nowrap',
};

interface Props {
  productId: number;
  brand: BrandName;          // unused now but mirrors SourcingSampleTable signature
  candidates: BrandCandidate[];
  onExportPdf: () => void;
}

function sortFavoritesFirst(list: BrandCandidate[]): BrandCandidate[] {
  return [...list].sort((a, b) => {
    if (a.is_favorite !== b.is_favorite) return b.is_favorite - a.is_favorite;
    if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
    return a.id - b.id;
  });
}

export function BrandNameTable({ productId, candidates, onExportPdf }: Props) {
  const create = useCreateCandidate(productId);
  const [showArchived, setShowArchived] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<BrandCandidate | null>(null);
  const [newName, setNewName] = useState('');

  const archivedCount = candidates.filter(c => c.is_archived === 1).length;
  const atLimit = candidates.length >= CANDIDATE_LIMIT;

  const visibleSorted = useMemo(() => {
    const filtered = showArchived ? candidates : candidates.filter(c => c.is_archived === 0);
    return sortFavoritesFirst(filtered);
  }, [candidates, showArchived]);

  const trimmedNew = newName.trim();
  const duplicate = useMemo(() => {
    if (trimmedNew.length === 0) return null;
    return candidates.find(c => c.name.toLowerCase() === trimmedNew.toLowerCase()) ?? null;
  }, [candidates, trimmedNew]);

  function handleAdd() {
    if (trimmedNew.length === 0 || trimmedNew.length > 200) return;
    if (atLimit) return;
    create.mutate(trimmedNew, {
      onSuccess: () => setNewName(''),
    });
  }

  return (
    <div className="px-5 pb-5">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--color-on-surface)' }}>
          <span className="material-symbols-outlined text-base">list</span>
          Namensliste
        </h3>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowArchived(v => !v)}
            className="px-3 py-1.5 rounded-md text-sm flex items-center gap-2"
            style={{
              background: 'var(--color-surface-container-high)',
              color: 'var(--color-on-surface)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <span className="material-symbols-outlined text-base">archive</span>
            {showArchived ? 'Archivierte ausblenden' : 'Archivierte einblenden'}
            <span className="px-2 py-0.5 rounded-full text-xs" style={{ background: '#fdba7433', color: '#fdba74' }}>
              {archivedCount}
            </span>
          </button>
          <button
            type="button"
            onClick={onExportPdf}
            disabled={candidates.filter(c => c.is_archived === 0).length === 0}
            className="px-3 py-1.5 rounded-md text-sm flex items-center gap-2 disabled:opacity-50"
            style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)' }}
          >
            <span className="material-symbols-outlined text-base">picture_as_pdf</span>
            PDF exportieren
          </button>
        </div>
      </div>

      {/* Tabelle */}
      {visibleSorted.length === 0 ? (
        <p
          className="text-sm text-center py-6 rounded-md"
          style={{ color: 'var(--color-on-surface-variant)', background: 'var(--color-surface-container-low)' }}
        >
          Noch keine Namen — unten einen ersten Vorschlag eintragen.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full" style={{ minWidth: '800px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <th style={TH_STYLE}>Name</th>
                <th style={{ ...TH_STYLE, textAlign: 'center' }}>Interessant</th>
                <th style={{ ...TH_STYLE, textAlign: 'center' }}>Vielleicht</th>
                <th style={{ ...TH_STYLE, textAlign: 'center' }}>Ja</th>
                <th style={{ ...TH_STYLE, textAlign: 'center' }}>Nein</th>
                <th style={{ ...TH_STYLE, textAlign: 'center' }}>★ Favourit</th>
                <th style={TH_STYLE}>Bemerkungen</th>
                <th style={{ ...TH_STYLE, textAlign: 'center' }}>Archiv</th>
                <th style={{ ...TH_STYLE, textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {visibleSorted.map(c => (
                <BrandNameRow
                  key={c.id}
                  productId={productId}
                  candidate={c}
                  onRequestDelete={setPendingDelete}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add-Form */}
      <div className="mt-4 flex items-start gap-2 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); }}
            maxLength={200}
            disabled={atLimit}
            placeholder="Neuer Markenname …"
            className="w-full px-3 py-2 rounded-md text-sm"
            style={{
              background: 'var(--color-surface-container-low)',
              color: 'var(--color-on-surface)',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          />
          {duplicate && (
            <p className="text-xs mt-1" style={{ color: '#fdba74' }}>
              Name „{duplicate.name}" existiert bereits{duplicate.is_archived === 1 ? ' (archiviert)' : ''}.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handleAdd}
          disabled={trimmedNew.length === 0 || atLimit || create.isPending}
          className="px-3 py-2 rounded-md text-sm flex items-center gap-2 disabled:opacity-50"
          style={{
            background: 'var(--color-surface-container-high)',
            color: 'var(--color-on-surface)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
          title={atLimit ? `Maximal ${CANDIDATE_LIMIT} Namen pro Produkt` : undefined}
        >
          <span className="material-symbols-outlined text-base">add</span>
          Name hinzufügen
        </button>
      </div>

      <DeleteBrandNameDialog
        productId={productId}
        candidate={pendingDelete}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

```bash
cd frontend && npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/amazon/BrandNameTable.tsx
git commit -m "feat(amazon-brand): Namens-Tabelle mit Sortierung + Add-Form + Duplikat-Warnung

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: BrandFavoriteCard + BrandFavoritesPanel

**Files:**
- Create: `frontend/src/components/amazon/BrandFavoriteCard.tsx`
- Create: `frontend/src/components/amazon/BrandFavoritesPanel.tsx`

- [ ] **Step 1: BrandFavoriteCard**

Datei `frontend/src/components/amazon/BrandFavoriteCard.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { type BrandCandidate, type CandidatePatch, type ResearchStatus } from '../../api/amazon.api';
import { useUpdateCandidate } from '../../hooks/amazon/useBrand';

const STATUS_LABEL: Record<ResearchStatus, string> = {
  frei: 'frei', belegt: 'belegt', unklar: 'unklar',
};
const STATUS_COLOR: Record<ResearchStatus, string> = {
  frei: '#34d399',
  belegt: '#fca5a5',
  unklar: '#fdba74',
};
const ORDER: ResearchStatus[] = ['frei', 'belegt', 'unklar'];

interface Props {
  productId: number;
  candidate: BrandCandidate;
}

const ACCENT = '#f472b6';

function StatusPills({
  value,
  onChange,
}: { value: ResearchStatus | null; onChange: (next: ResearchStatus | null) => void }) {
  return (
    <div className="flex gap-1">
      {ORDER.map(s => {
        const active = value === s;
        const color = STATUS_COLOR[s];
        return (
          <button
            key={s}
            type="button"
            onClick={() => onChange(active ? null : s)}
            className="px-2.5 py-1 rounded-full text-xs"
            style={{
              background: active ? `${color}33` : 'transparent',
              color: active ? color : 'var(--color-on-surface-variant)',
              border: `1px solid ${active ? color : 'rgba(255,255,255,0.12)'}`,
            }}
          >
            {STATUS_LABEL[s]}
          </button>
        );
      })}
    </div>
  );
}

export function BrandFavoriteCard({ productId, candidate }: Props) {
  const update = useUpdateCandidate(productId);

  const [url, setUrl] = useState(candidate.research_url ?? '');
  const [notes, setNotes] = useState(candidate.research_notes ?? '');

  useEffect(() => { setUrl(candidate.research_url ?? ''); }, [candidate.research_url]);
  useEffect(() => { setNotes(candidate.research_notes ?? ''); }, [candidate.research_notes]);

  function patch(p: CandidatePatch) {
    update.mutate({ candidateId: candidate.id, patch: p });
  }

  function saveUrl() {
    const trimmed = url.trim();
    const next: string | null = trimmed.length === 0 ? null : trimmed;
    if (next === candidate.research_url) return;
    patch({ research_url: next });
  }

  function saveNotes() {
    const trimmed = notes.trim();
    const next: string | null = trimmed.length === 0 ? null : trimmed;
    if (next === candidate.research_notes) return;
    patch({ research_notes: next });
  }

  const fields: Array<{ label: string; key: keyof CandidatePatch; current: ResearchStatus | null }> = [
    { label: 'Markenrecht', key: 'trademark_status',  current: candidate.trademark_status },
    { label: '.com Domain', key: 'domain_com_status', current: candidate.domain_com_status },
    { label: '.de Domain',  key: 'domain_de_status',  current: candidate.domain_de_status },
    { label: 'Social Media',key: 'social_status',     current: candidate.social_status },
  ];

  return (
    <article
      className="rounded-lg p-4 flex flex-col gap-3"
      style={{
        background: 'var(--color-surface-container)',
        border: `1px solid ${ACCENT}26`,
      }}
    >
      <header className="flex items-center gap-2">
        <span className="material-symbols-outlined" style={{ color: ACCENT, fontSize: '18px' }}>star</span>
        <h4 className="font-semibold" style={{ color: 'var(--color-on-surface)' }}>{candidate.name}</h4>
      </header>

      <div className="grid gap-2 sm:grid-cols-[140px_1fr] items-center">
        {fields.map(f => (
          <div key={f.key} className="contents">
            <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>{f.label}</span>
            <StatusPills
              value={f.current}
              onChange={(next) => patch({ [f.key]: next } as CandidatePatch)}
            />
          </div>
        ))}
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>Recherche-URL</span>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onBlur={saveUrl}
          maxLength={500}
          placeholder="https://…"
          className="w-full px-2 py-1 rounded text-sm"
          style={{
            background: 'var(--color-surface-container-low)',
            color: 'var(--color-on-surface)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>Notizen</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={saveNotes}
          rows={3}
          maxLength={2000}
          className="w-full px-2 py-1 rounded text-sm resize-y"
          style={{
            background: 'var(--color-surface-container-low)',
            color: 'var(--color-on-surface)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        />
      </label>
    </article>
  );
}
```

- [ ] **Step 2: BrandFavoritesPanel**

Datei `frontend/src/components/amazon/BrandFavoritesPanel.tsx`:

```tsx
import { type BrandCandidate } from '../../api/amazon.api';
import { BrandFavoriteCard } from './BrandFavoriteCard';

interface Props {
  productId: number;
  candidates: BrandCandidate[];
}

export function BrandFavoritesPanel({ productId, candidates }: Props) {
  const favorites = candidates.filter(c => c.is_favorite === 1 && c.is_archived === 0);
  if (favorites.length === 0) return null;

  return (
    <div className="px-5 pb-5">
      <h3 className="text-sm font-semibold mb-1 flex items-center gap-2" style={{ color: 'var(--color-on-surface)' }}>
        <span className="material-symbols-outlined text-base" style={{ color: '#fbbf24' }}>star</span>
        Recherche
      </h3>
      <p className="text-xs mb-3" style={{ color: 'var(--color-on-surface-variant)' }}>
        Pruefe Markenrecht, Domains und Social-Media-Handles für deine Favoriten.
      </p>
      <div className="grid gap-3 grid-cols-1 lg:grid-cols-2">
        {favorites.map(c => (
          <BrandFavoriteCard key={c.id} productId={productId} candidate={c} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
cd frontend && npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/amazon/BrandFavoriteCard.tsx frontend/src/components/amazon/BrandFavoritesPanel.tsx
git commit -m "feat(amazon-brand): Favoriten-Recherche-Karten + Container

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: PDF-Export-Helper

**Files:**
- Create: `frontend/src/lib/amazon/exportBrandPdf.ts`

- [ ] **Step 1: Helper schreiben**

Datei `frontend/src/lib/amazon/exportBrandPdf.ts`:

```ts
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { type BrandPayload, type BrandCandidate, type ResearchStatus } from '../../api/amazon.api';

function slug(s: string, max = 50): string {
  return s
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, max);
}

function fmtStatus(v: ResearchStatus | null): string {
  if (!v) return '—';
  return v;
}

export function exportBrandPdf(product: { name: string }, payload: BrandPayload): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 40;
  let y = 50;

  // Titel
  doc.setFontSize(20);
  doc.text(`Markennamen — ${product.name}`, marginX, y);
  y += 24;

  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(`Stand: ${new Date().toLocaleDateString('de-DE')}`, marginX, y);
  doc.setTextColor(0);
  y += 18;

  // Sektion-Notizen
  if (payload.brand.notes) {
    doc.setFontSize(11);
    doc.text('Notizen:', marginX, y);
    y += 14;
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(payload.brand.notes, pageWidth - marginX * 2);
    doc.text(lines, marginX, y);
    y += lines.length * 12 + 10;
  }

  // Tabelle der nicht-archivierten Namen
  const visible: BrandCandidate[] = [...payload.names]
    .filter(c => c.is_archived === 0)
    .sort((a, b) => {
      if (a.is_favorite !== b.is_favorite) return b.is_favorite - a.is_favorite;
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.id - b.id;
    });

  if (visible.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [['Name', 'Interessant', 'Vielleicht', 'Ja', 'Nein', '★', 'Bemerkungen']],
      body: visible.map(c => [
        c.name,
        c.is_interesting === 1 ? '✓' : '',
        c.is_maybe === 1       ? '✓' : '',
        c.is_yes === 1         ? '✓' : '',
        c.is_no === 1          ? '✓' : '',
        c.is_favorite === 1    ? '★' : '',
        c.remarks ?? '',
      ]),
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [50, 50, 80] },
      margin: { left: marginX, right: marginX },
    });
    // @ts-expect-error — jspdf-autotable mutiert doc.lastAutoTable
    y = (doc as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 20;
  }

  // Recherche-Block je Favorit
  const favorites = visible.filter(c => c.is_favorite === 1);
  for (const fav of favorites) {
    if (y > 720) { doc.addPage(); y = 50; }

    doc.setFontSize(13);
    doc.text(`── ${fav.name} ──`, marginX, y);
    y += 16;

    doc.setFontSize(10);
    const rows: Array<[string, string]> = [
      ['Markenrecht',  fmtStatus(fav.trademark_status)],
      ['.com Domain',  fmtStatus(fav.domain_com_status)],
      ['.de Domain',   fmtStatus(fav.domain_de_status)],
      ['Social Media', fmtStatus(fav.social_status)],
      ['URL',          fav.research_url ?? '—'],
    ];
    for (const [k, v] of rows) {
      doc.text(`${k}: ${v}`, marginX + 8, y);
      y += 13;
      if (y > 760) { doc.addPage(); y = 50; }
    }
    if (fav.research_notes) {
      doc.text('Notizen:', marginX + 8, y);
      y += 13;
      const lines = doc.splitTextToSize(fav.research_notes, pageWidth - marginX * 2 - 16);
      doc.text(lines, marginX + 16, y);
      y += lines.length * 12 + 12;
    } else {
      y += 4;
    }
  }

  // Footer auf jeder Seite
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      `Benny Dashboard · Seite ${p} / ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 20,
      { align: 'center' },
    );
  }

  const filename = `Markennamen_${slug(product.name)}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}
```

- [ ] **Step 2: Typecheck**

```bash
cd frontend && npm run typecheck
```
Erwartet: 0 Fehler. Falls `jspdf-autotable` Typ-Konflikte meldet, ist `autoTable(doc, …)` der korrekte Default-Import.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/amazon/exportBrandPdf.ts
git commit -m "feat(amazon-brand): PDF-Export-Helper mit jspdf + autotable

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: BrandNameSection + Detail-Page-Einbindung

**Files:**
- Create: `frontend/src/components/amazon/BrandNameSection.tsx`
- Modify: `frontend/src/pages/amazon/AmazonProductDetailPage.tsx`

- [ ] **Step 1: BrandNameSection**

Datei `frontend/src/components/amazon/BrandNameSection.tsx`:

```tsx
import { type BrandStatus } from '../../api/amazon.api';
import { useBrand, useUpdateBrand } from '../../hooks/amazon/useBrand';
import { SectionHeader } from './SectionHeader';
import { SectionStatusBadge } from './SectionStatusBadge';
import { BrandNotes } from './BrandNotes';
import { BrandNameTable } from './BrandNameTable';
import { BrandFavoritesPanel } from './BrandFavoritesPanel';
import { exportBrandPdf } from '../../lib/amazon/exportBrandPdf';

const ACCENT = '#f472b6';

interface Props {
  productId: number;
  productName: string;
}

export function BrandNameSection({ productId, productName }: Props) {
  const { data, isLoading, isError, refetch } = useBrand(productId);
  const update = useUpdateBrand(productId);

  if (isLoading) {
    return (
      <section
        className="rounded-xl p-5"
        style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <p style={{ color: 'var(--color-on-surface-variant)' }}>Lade Markenname …</p>
      </section>
    );
  }
  if (isError || !data) {
    return (
      <section
        className="rounded-xl p-5"
        style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <p className="mb-2" style={{ color: 'var(--color-on-surface)' }}>Markenname konnte nicht geladen werden.</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="px-3 py-1.5 rounded-md text-sm"
          style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)' }}
        >
          Erneut laden
        </button>
      </section>
    );
  }

  const { brand, names } = data;
  const expanded = brand.is_expanded === 1;

  function handleExport() {
    if (!data) return;
    exportBrandPdf({ name: productName }, data);
  }

  // SectionStatusBadge uses SourcingStatus — but the enum values are identical to BrandStatus.
  // Reuse via a small cast: both types share the same string union.
  type ReuseStatus = Parameters<typeof SectionStatusBadge>[0]['status'];

  return (
    <section
      className="rounded-xl overflow-hidden"
      style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <SectionHeader
        icon="label"
        title="Markenname"
        accent={ACCENT}
        expanded={expanded}
        onToggleExpand={() => update.mutate({ is_expanded: expanded ? 0 : 1 })}
        rightSlot={
          <SectionStatusBadge
            status={brand.status as ReuseStatus}
            onChange={(next: ReuseStatus) => update.mutate({ status: next as BrandStatus })}
          />
        }
      />
      {expanded && (
        <>
          <BrandNotes productId={productId} notes={brand.notes} />
          <BrandNameTable
            productId={productId}
            brand={brand}
            candidates={names}
            onExportPdf={handleExport}
          />
          <BrandFavoritesPanel productId={productId} candidates={names} />
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Detail-Page einbinden**

In `frontend/src/pages/amazon/AmazonProductDetailPage.tsx`:

(a) Import nach `SourcingSection` ergänzen:

```tsx
import { BrandNameSection } from '../../components/amazon/BrandNameSection';
```

(b) Im Sections-Container die neue Sektion direkt nach `<SourcingSection>` einfügen:

```tsx
<div className="flex flex-col gap-4">
  <SourcingSection productId={product.id} />
  <BrandNameSection productId={product.id} productName={product.name} />
</div>
```

- [ ] **Step 3: Typecheck**

```bash
cd frontend && npm run typecheck
```
Erwartet: 0 Fehler.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/amazon/BrandNameSection.tsx frontend/src/pages/amazon/AmazonProductDetailPage.tsx
git commit -m "feat(amazon-brand): BrandNameSection + Einbindung Detail-Seite

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Tests, Typecheck, UAT

**Files:** Keine Code-Aenderungen — Verifikation.

- [ ] **Step 1: Backend-Tests komplett**

```bash
cd backend && npm test
```
Erwartet: alle Tests grün, inkl. `schema.amazon_brand_name` (6) und `integration.amazon_brand` (17).

- [ ] **Step 2: Frontend-Typecheck**

```bash
cd frontend && npm run typecheck
```
Erwartet: 0 Fehler.

- [ ] **Step 3: Backend frisch starten**

```bash
cd backend && pkill -f "tsx watch" 2>/dev/null; sleep 1; npm run dev &
```

- [ ] **Step 4: Manuelles UAT (jeden Punkt abhaken)**

Browser auf `/amazon/entwicklung/products/:id` einer existierenden Karte.

Sourcing-Erweiterung:
- [ ] Sample-Tabelle: neue Spalte "Beauftragt" zwischen Lieferzeit und Qualität.
- [ ] Beauftragt-Checkbox togglen → Autosave → Reload → bleibt.

Brand-Sektion:
- [ ] Markenname-Sektion erscheint unter Sourcing.
- [ ] Status auf "In Bearbeitung" → Reload → bleibt.
- [ ] Notizen tippen, Tab → gespeichert.
- [ ] Neuen Namen "Acme" eintippen → Enter → Zeile erscheint.
- [ ] "Acme" nochmal tippen → Warnung "Name 'Acme' existiert bereits".
- [ ] Trotzdem hinzufügen → zweite Zeile.
- [ ] Bei Zeile 1: Favourit anhaken → rutscht (falls nicht schon erste) nach oben.
- [ ] Favoriten-Recherche-Block erscheint unter der Tabelle mit einer Karte.
- [ ] Markenrecht: "unklar" klicken → orange Pille.
- [ ] Klicke "unklar" nochmal → Pille deaktiviert (= null).
- [ ] .com auf "frei", .de auf "belegt".
- [ ] Recherche-URL eintippen, Tab → Autosave.
- [ ] Notizen-Textarea tippen, Tab → Autosave.
- [ ] Bei Zeile 2: Archiv-Checkbox setzen → bei deaktiviertem "Archivierte einblenden" verschwindet die Zeile.
- [ ] Archiv-Toggle umschalten → Zeile erscheint mit reduzierter Opazität.
- [ ] Mülltonne in Zeile 1 → Confirm-Modal → Zeile weg.
- [ ] PDF exportieren → Download startet, Datei enthält Tabelle + Favoriten-Block.
- [ ] Sektion zuklappen (Klick auf Header) → bleibt nach Reload zugeklappt.
- [ ] Fehlerpfad: Backend stoppen, Notiz tippen → Autosave zeigt Fehler.

- [ ] **Step 5: Falls UAT-Punkt fehlschlaegt**

Zur betroffenen Task zurück, fixen, hier wieder abhaken.

---

## Selbstreview-Notizen

- **Spec-Coverage:**
  - Sourcing `sample_ordered`: T1 (Migration + Backend + Tests), T5 (Frontend-Spalte).
  - Brand-Tabellen + CHECK + Cascade: T2.
  - Backend-Routes mit Lazy-Init und Limit 100: T3.
  - API-Types + Hooks mit optimistic Updates: T4.
  - BrandNotes / BrandNameRow / DeleteBrandNameDialog: T6.
  - BrandNameTable mit Favoriten-Sort + Archiv-Toggle + Duplikat-Warnung: T7.
  - BrandFavoriteCard mit 4 Status-Pillen + URL + Notizen: T8.
  - PDF-Export-Helper: T9.
  - BrandNameSection-Akkordeon + Detail-Einbindung: T10.
  - UAT inkl. aller Spec-Edge-Cases: T11.
- **Type-Konsistenz:** `BrandName`, `BrandCandidate`, `BrandPatch`, `CandidatePatch`, `BrandPayload`, `ResearchStatus`, `BrandStatus` werden in allen Tasks identisch verwendet. Hook-Namen: `useBrand`, `useUpdateBrand`, `useCreateCandidate`, `useUpdateCandidate`, `useDeleteCandidate`. API-Funktionen: `fetchBrand`, `updateBrand`, `createCandidate`, `updateCandidate`, `deleteCandidate`.
- **Wiederverwendung:** `SectionHeader` + `SectionStatusBadge` aus Sourcing-Schritt 2 werden ohne Aenderung uebernommen — beide haben generische Props.
- **Out-of-Scope** bleibt liegen: Drag&Drop, Domain-API, Auto-Sort weitere Sektionen.
- **Bekannte Falle aus Memory:** Stale-Backend — T11 startet Backend frisch.
