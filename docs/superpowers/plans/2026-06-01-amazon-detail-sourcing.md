# Amazon Produkt-Detail — Sourcing-Sektion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Erste inhaltliche Sektion auf der Produkt-Detail-Seite — aufklappbares Akkordeon "Sourcing" mit 9-Punkte-Checkliste und erweiterbarer Sample-Vergleichs-Tabelle, manueller Status, Auto-Save.

**Architecture:** Zwei neue SQLite-Tabellen `amazon_sourcing` (1:1) und `amazon_sourcing_samples` (1:n) mit `ON DELETE CASCADE` zum Produkt. Eigene Route-Datei `amazon.sourcing.routes.ts` mit GET, PATCH und Sample-CRUD; Winner-Exklusivität in SQL-Transaktion. Frontend: wiederverwendbares `SectionHeader`-Pattern + sourcing-spezifische Komponenten, TanStack Query mit optimistic Updates, globaler `AutosaveIndicator` als Footer.

**Tech Stack:** better-sqlite3 11.x, Express 5.x, vitest + supertest (Backend) — React 19, TanStack Query 5.x, axios, Tailwind v4 (Frontend).

**Spec:** `docs/superpowers/specs/2026-06-01-amazon-detail-sourcing-design.md`

---

## Datei-Übersicht

| Pfad | Zweck |
|------|-------|
| `backend/src/db/migrations/058_amazon_sourcing.sql` | Beide Tabellen + Index |
| `backend/test/schema.amazon_sourcing.test.ts` | Schema-Test |
| `backend/src/routes/amazon.sourcing.routes.ts` | GET/PATCH + Sample-CRUD |
| `backend/test/integration.amazon_sourcing.test.ts` | Integration-Test |
| `backend/src/app.ts` | Mount unter `/api/amazon` |
| `frontend/src/api/amazon.api.ts` | Types + Wrappers ergänzen |
| `frontend/src/hooks/amazon/useSourcing.ts` | TanStack-Query-Hooks |
| `frontend/src/components/amazon/SectionHeader.tsx` | Wiederverwendbar (Icon, Titel, Status, Chevron) |
| `frontend/src/components/amazon/SectionStatusBadge.tsx` | Dropdown für 3 Section-Status |
| `frontend/src/components/amazon/SourcingChecklist.tsx` | 9 Checkboxen |
| `frontend/src/components/amazon/SourcingSampleRow.tsx` | Eine editierbare Sample-Zeile |
| `frontend/src/components/amazon/SourcingSampleTable.tsx` | Tabelle + "+ Sample"-Button |
| `frontend/src/components/amazon/DeleteSampleDialog.tsx` | Confirm-Modal |
| `frontend/src/components/amazon/SourcingSection.tsx` | Akkordeon-Wrapper |
| `frontend/src/components/amazon/AutosaveIndicator.tsx` | Footer-Anzeige |
| `frontend/src/pages/amazon/AmazonProductDetailPage.tsx` | Einbindung Section + Indikator |

---

## Task 1: Migration + Schema-Test

**Files:**
- Create: `backend/src/db/migrations/058_amazon_sourcing.sql`
- Create: `backend/test/schema.amazon_sourcing.test.ts`

- [ ] **Step 1: Schema-Test schreiben (RED)**

Datei `backend/test/schema.amazon_sourcing.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from './setup';

interface SqliteMaster { name: string; type: string; }
interface ColumnInfo { name: string; type: string; notnull: number; dflt_value: string | null; pk: number; }

describe('Migration 058 — amazon_sourcing + amazon_sourcing_samples', () => {
  let db: Database.Database;
  beforeEach(() => { db = createTestDb(); });

  it('erstellt beide Tabellen', () => {
    const sourcing = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='amazon_sourcing'`
    ).get() as SqliteMaster | undefined;
    const samples = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='amazon_sourcing_samples'`
    ).get() as SqliteMaster | undefined;
    expect(sourcing).toBeDefined();
    expect(samples).toBeDefined();
  });

  it('amazon_sourcing hat alle 9 cp_-Spalten + status + is_expanded + updated_at', () => {
    const cols = db.prepare(`PRAGMA table_info(amazon_sourcing)`).all() as ColumnInfo[];
    const names = new Set(cols.map(c => c.name));
    for (const n of [
      'product_id', 'status', 'is_expanded',
      'cp_hersteller_gefiltert', 'cp_anforderungen_kommuniziert', 'cp_erste_preise_erhalten',
      'cp_usp_geprueft', 'cp_samples_angefragt', 'cp_sample_analyse',
      'cp_vergleichstabelle', 'cp_finale_verhandlung', 'cp_zahlungsziel',
      'updated_at',
    ]) {
      expect(names.has(n), `Spalte ${n} fehlt`).toBe(true);
    }
  });

  it('amazon_sourcing.status CHECK weist ungueltige Werte ab', () => {
    db.prepare(`INSERT INTO amazon_products (name) VALUES ('P')`).run();
    const productId = db.prepare(`SELECT last_insert_rowid() AS id`).get() as { id: number };
    const insert = db.prepare(`INSERT INTO amazon_sourcing (product_id, status) VALUES (?, ?)`);
    expect(() => insert.run(productId.id, 'kaputt')).toThrow();
    db.prepare(`DELETE FROM amazon_sourcing WHERE product_id=?`).run(productId.id);
    expect(() => insert.run(productId.id, 'offen')).not.toThrow();
    db.prepare(`DELETE FROM amazon_sourcing WHERE product_id=?`).run(productId.id);
    expect(() => insert.run(productId.id, 'in_bearbeitung')).not.toThrow();
    db.prepare(`DELETE FROM amazon_sourcing WHERE product_id=?`).run(productId.id);
    expect(() => insert.run(productId.id, 'erledigt')).not.toThrow();
  });

  it('amazon_sourcing_samples hat alle Spalten und Index', () => {
    const cols = db.prepare(`PRAGMA table_info(amazon_sourcing_samples)`).all() as ColumnInfo[];
    const names = new Set(cols.map(c => c.name));
    for (const n of [
      'id', 'product_id', 'sort_order', 'is_winner',
      'hersteller', 'sample_kosten', 'besonderheiten', 'lieferzeit',
      'qualitaet', 'bewertung', 'status', 'notizen',
      'created_at', 'updated_at',
    ]) {
      expect(names.has(n), `Spalte ${n} fehlt`).toBe(true);
    }
    const idx = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='index' AND name='amazon_sourcing_samples_product_idx'`
    ).get();
    expect(idx).toBeDefined();
  });

  it('amazon_sourcing_samples CHECK-Constraints', () => {
    db.prepare(`INSERT INTO amazon_products (name) VALUES ('P')`).run();
    const productId = (db.prepare(`SELECT last_insert_rowid() AS id`).get() as { id: number }).id;

    // qualitaet ungueltig
    expect(() => db.prepare(
      `INSERT INTO amazon_sourcing_samples (product_id, qualitaet) VALUES (?, ?)`
    ).run(productId, 'super_gut')).toThrow();

    // bewertung > 5
    expect(() => db.prepare(
      `INSERT INTO amazon_sourcing_samples (product_id, bewertung) VALUES (?, ?)`
    ).run(productId, 7)).toThrow();

    // bewertung negativ
    expect(() => db.prepare(
      `INSERT INTO amazon_sourcing_samples (product_id, bewertung) VALUES (?, ?)`
    ).run(productId, -1)).toThrow();

    // status sample ungueltig
    expect(() => db.prepare(
      `INSERT INTO amazon_sourcing_samples (product_id, status) VALUES (?, ?)`
    ).run(productId, 'kaputt')).toThrow();

    // is_winner != 0/1
    expect(() => db.prepare(
      `INSERT INTO amazon_sourcing_samples (product_id, is_winner) VALUES (?, ?)`
    ).run(productId, 2)).toThrow();
  });

  it('Cascade-Delete entfernt sourcing + samples bei Produkt-Loeschung', () => {
    db.prepare(`INSERT INTO amazon_products (name) VALUES ('P')`).run();
    const productId = (db.prepare(`SELECT last_insert_rowid() AS id`).get() as { id: number }).id;

    db.prepare(`INSERT INTO amazon_sourcing (product_id) VALUES (?)`).run(productId);
    db.prepare(`INSERT INTO amazon_sourcing_samples (product_id, hersteller) VALUES (?, 'A')`).run(productId);
    db.prepare(`INSERT INTO amazon_sourcing_samples (product_id, hersteller) VALUES (?, 'B')`).run(productId);

    db.prepare(`DELETE FROM amazon_products WHERE id=?`).run(productId);

    const sourcing = db.prepare(`SELECT * FROM amazon_sourcing WHERE product_id=?`).get(productId);
    const samples = db.prepare(`SELECT * FROM amazon_sourcing_samples WHERE product_id=?`).all(productId);
    expect(sourcing).toBeUndefined();
    expect(samples).toEqual([]);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fail bestaetigen**

```bash
cd backend && npm test -- schema.amazon_sourcing
```
Erwartet: **alle Tests FAIL** (Tabellen existieren nicht).

- [ ] **Step 3: Migration schreiben (GREEN)**

Datei `backend/src/db/migrations/058_amazon_sourcing.sql`:

```sql
-- Migration 058: Amazon ECO-Dashboard — Sourcing-Sektion (2026-06-01)
-- WICHTIG: Kein FK-Pragma setzen — wird zentral in migrate.ts gesteuert
-- WICHTIG: Auto-Backup laeuft via migrate.ts vor Anwendung

CREATE TABLE amazon_sourcing (
  product_id                    INTEGER PRIMARY KEY
                                REFERENCES amazon_products(id) ON DELETE CASCADE,
  status                        TEXT    NOT NULL DEFAULT 'offen'
                                CHECK (status IN ('offen','in_bearbeitung','erledigt')),
  is_expanded                   INTEGER NOT NULL DEFAULT 1
                                CHECK (is_expanded IN (0,1)),
  cp_hersteller_gefiltert       INTEGER NOT NULL DEFAULT 0 CHECK (cp_hersteller_gefiltert IN (0,1)),
  cp_anforderungen_kommuniziert INTEGER NOT NULL DEFAULT 0 CHECK (cp_anforderungen_kommuniziert IN (0,1)),
  cp_erste_preise_erhalten      INTEGER NOT NULL DEFAULT 0 CHECK (cp_erste_preise_erhalten IN (0,1)),
  cp_usp_geprueft               INTEGER NOT NULL DEFAULT 0 CHECK (cp_usp_geprueft IN (0,1)),
  cp_samples_angefragt          INTEGER NOT NULL DEFAULT 0 CHECK (cp_samples_angefragt IN (0,1)),
  cp_sample_analyse             INTEGER NOT NULL DEFAULT 0 CHECK (cp_sample_analyse IN (0,1)),
  cp_vergleichstabelle          INTEGER NOT NULL DEFAULT 0 CHECK (cp_vergleichstabelle IN (0,1)),
  cp_finale_verhandlung         INTEGER NOT NULL DEFAULT 0 CHECK (cp_finale_verhandlung IN (0,1)),
  cp_zahlungsziel               INTEGER NOT NULL DEFAULT 0 CHECK (cp_zahlungsziel IN (0,1)),
  updated_at                    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE amazon_sourcing_samples (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id      INTEGER NOT NULL
                  REFERENCES amazon_products(id) ON DELETE CASCADE,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  is_winner       INTEGER NOT NULL DEFAULT 0 CHECK (is_winner IN (0,1)),
  hersteller      TEXT,
  sample_kosten   TEXT,
  besonderheiten  TEXT,
  lieferzeit      TEXT,
  qualitaet       TEXT CHECK (qualitaet IS NULL OR qualitaet IN ('sehr_gut','gut','mittel','schlecht')),
  bewertung       INTEGER CHECK (bewertung IS NULL OR (bewertung >= 0 AND bewertung <= 5)),
  status          TEXT CHECK (status IS NULL OR status IN ('angefragt','bestellt','erhalten','abgelehnt')),
  notizen         TEXT,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX amazon_sourcing_samples_product_idx
  ON amazon_sourcing_samples (product_id, sort_order, id);
```

- [ ] **Step 4: Tests laufen lassen, alle gruen**

```bash
cd backend && npm test -- schema.amazon_sourcing
```
Erwartet: alle 6 Tests **PASS**.

- [ ] **Step 5: Commit**

```bash
git add backend/src/db/migrations/058_amazon_sourcing.sql backend/test/schema.amazon_sourcing.test.ts
git commit -m "feat(amazon-sourcing): Migration 058 — Tabellen + CHECK + Cascade-Delete

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Backend — Sourcing-GET + PATCH

**Files:**
- Create: `backend/src/routes/amazon.sourcing.routes.ts`
- Create: `backend/test/integration.amazon_sourcing.test.ts`

- [ ] **Step 1: Integration-Test fuer GET + PATCH schreiben (RED)**

Datei `backend/test/integration.amazon_sourcing.test.ts`:

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
  // @ts-expect-error — wir setzen das default-Export der gemockten DB-Datei
  conn.default = db;
  const routes = (await import('../src/routes/amazon.sourcing.routes')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/amazon', routes);
  return app;
}

function makeProduct(db: Database.Database, name = 'P'): number {
  db.prepare(`INSERT INTO amazon_products (name) VALUES (?)`).run(name);
  return Number((db.prepare(`SELECT last_insert_rowid() AS id`).get() as { id: number }).id);
}

describe('Sourcing API — GET + PATCH', () => {
  let db: Database.Database;
  let app: express.Express;

  beforeEach(async () => {
    db = createTestDb();
    app = await makeApp(db);
  });

  it('GET legt sourcing-Eintrag bei Bedarf an', async () => {
    const productId = makeProduct(db);
    const r = await request(app).get(`/api/amazon/products/${productId}/sourcing`);
    expect(r.status).toBe(200);
    expect(r.body.sourcing).toMatchObject({
      product_id: productId,
      status: 'offen',
      is_expanded: 1,
      cp_hersteller_gefiltert: 0,
      cp_zahlungsziel: 0,
    });
    expect(r.body.samples).toEqual([]);

    // DB hat den Eintrag jetzt persistent
    const row = db.prepare(`SELECT * FROM amazon_sourcing WHERE product_id=?`).get(productId);
    expect(row).toBeDefined();
  });

  it('GET zweimal liefert denselben Eintrag (kein Duplikat)', async () => {
    const productId = makeProduct(db);
    await request(app).get(`/api/amazon/products/${productId}/sourcing`);
    await request(app).get(`/api/amazon/products/${productId}/sourcing`);
    const count = (db.prepare(
      `SELECT COUNT(*) AS c FROM amazon_sourcing WHERE product_id=?`
    ).get(productId) as { c: number }).c;
    expect(count).toBe(1);
  });

  it('GET 404 wenn Produkt nicht existiert', async () => {
    const r = await request(app).get(`/api/amazon/products/9999/sourcing`);
    expect(r.status).toBe(404);
  });

  it('PATCH aktualisiert cp_-Felder', async () => {
    const productId = makeProduct(db);
    await request(app).get(`/api/amazon/products/${productId}/sourcing`); // lazy-init

    const r = await request(app)
      .patch(`/api/amazon/products/${productId}/sourcing`)
      .send({ cp_samples_angefragt: 1, cp_sample_analyse: 1 });

    expect(r.status).toBe(200);
    expect(r.body.sourcing.cp_samples_angefragt).toBe(1);
    expect(r.body.sourcing.cp_sample_analyse).toBe(1);
  });

  it('PATCH weist ungueltigen Status ab', async () => {
    const productId = makeProduct(db);
    const r = await request(app)
      .patch(`/api/amazon/products/${productId}/sourcing`)
      .send({ status: 'kaputt' });
    expect(r.status).toBe(400);
  });

  it('PATCH weist ungueltigen cp-Wert ab', async () => {
    const productId = makeProduct(db);
    const r = await request(app)
      .patch(`/api/amazon/products/${productId}/sourcing`)
      .send({ cp_samples_angefragt: 2 });
    expect(r.status).toBe(400);
  });

  it('PATCH is_expanded togglet', async () => {
    const productId = makeProduct(db);
    await request(app).get(`/api/amazon/products/${productId}/sourcing`);

    const r1 = await request(app)
      .patch(`/api/amazon/products/${productId}/sourcing`)
      .send({ is_expanded: 0 });
    expect(r1.body.sourcing.is_expanded).toBe(0);
  });
});
```

- [ ] **Step 2: Tests laufen lassen, Fail bestaetigen**

```bash
cd backend && npm test -- integration.amazon_sourcing
```
Erwartet: **alle FAIL** (Route existiert nicht).

- [ ] **Step 3: Route-Datei schreiben (GREEN)**

Datei `backend/src/routes/amazon.sourcing.routes.ts`:

```ts
import { Router, type Request, type Response } from 'express';
import db from '../db/connection';

const router = Router();

type SourcingStatus = 'offen' | 'in_bearbeitung' | 'erledigt';
const VALID_SOURCING_STATUS: ReadonlySet<SourcingStatus> = new Set(['offen', 'in_bearbeitung', 'erledigt']);

const CP_COLUMNS = [
  'cp_hersteller_gefiltert',
  'cp_anforderungen_kommuniziert',
  'cp_erste_preise_erhalten',
  'cp_usp_geprueft',
  'cp_samples_angefragt',
  'cp_sample_analyse',
  'cp_vergleichstabelle',
  'cp_finale_verhandlung',
  'cp_zahlungsziel',
] as const;

interface SourcingRow {
  product_id: number;
  status: SourcingStatus;
  is_expanded: number;
  cp_hersteller_gefiltert: number;
  cp_anforderungen_kommuniziert: number;
  cp_erste_preise_erhalten: number;
  cp_usp_geprueft: number;
  cp_samples_angefragt: number;
  cp_sample_analyse: number;
  cp_vergleichstabelle: number;
  cp_finale_verhandlung: number;
  cp_zahlungsziel: number;
  updated_at: number;
}

function ensureProduct(id: number): boolean {
  return db.prepare(`SELECT 1 FROM amazon_products WHERE id = ?`).get(id) !== undefined;
}

function getOrCreateSourcing(productId: number): SourcingRow {
  let row = db.prepare(`SELECT * FROM amazon_sourcing WHERE product_id = ?`).get(productId) as SourcingRow | undefined;
  if (!row) {
    db.prepare(`INSERT INTO amazon_sourcing (product_id) VALUES (?)`).run(productId);
    row = db.prepare(`SELECT * FROM amazon_sourcing WHERE product_id = ?`).get(productId) as SourcingRow;
  }
  return row;
}

function listSamples(productId: number): unknown[] {
  return db.prepare(
    `SELECT * FROM amazon_sourcing_samples
     WHERE product_id = ?
     ORDER BY sort_order, id`
  ).all(productId);
}

// GET /api/amazon/products/:id/sourcing
router.get('/products/:id/sourcing', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) {
    res.status(404).json({ error: 'product not found' });
    return;
  }
  const sourcing = getOrCreateSourcing(id);
  const samples = listSamples(id);
  res.json({ sourcing, samples });
});

// PATCH /api/amazon/products/:id/sourcing
router.patch('/products/:id/sourcing', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) {
    res.status(404).json({ error: 'product not found' });
    return;
  }
  getOrCreateSourcing(id); // sicherstellen, dass es einen Eintrag gibt

  const body = (req.body as Record<string, unknown>) ?? {};
  const updates: string[] = [];
  const params: unknown[] = [];

  if (body.status !== undefined) {
    if (typeof body.status !== 'string' || !VALID_SOURCING_STATUS.has(body.status as SourcingStatus)) {
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

  for (const col of CP_COLUMNS) {
    if (body[col] !== undefined) {
      if (body[col] !== 0 && body[col] !== 1) {
        res.status(400).json({ error: `invalid ${col}` });
        return;
      }
      updates.push(`${col} = ?`);
      params.push(body[col]);
    }
  }

  if (updates.length > 0) {
    updates.push('updated_at = unixepoch()');
    params.push(id);
    db.prepare(`UPDATE amazon_sourcing SET ${updates.join(', ')} WHERE product_id = ?`).run(...params);
  }

  const sourcing = getOrCreateSourcing(id);
  res.json({ sourcing });
});

export default router;
```

- [ ] **Step 4: Tests laufen lassen, GET + PATCH gruen**

```bash
cd backend && npm test -- integration.amazon_sourcing
```
Erwartet: alle 7 GET/PATCH-Tests **PASS**.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/amazon.sourcing.routes.ts backend/test/integration.amazon_sourcing.test.ts
git commit -m "feat(amazon-sourcing): GET + PATCH-Route mit Lazy-Init

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Backend — Sample-CRUD + Mount

**Files:**
- Modify: `backend/src/routes/amazon.sourcing.routes.ts` (Sample-Handler anhängen)
- Modify: `backend/test/integration.amazon_sourcing.test.ts` (Sample-Tests anhängen)
- Modify: `backend/src/app.ts` (Mount)

- [ ] **Step 1: Sample-Tests anhaengen (RED)**

Im selben File `backend/test/integration.amazon_sourcing.test.ts`, am Ende (nach dem existierenden `describe`-Block), neuer Block:

```ts
describe('Sourcing API — Samples', () => {
  let db: Database.Database;
  let app: express.Express;

  beforeEach(async () => {
    db = createTestDb();
    app = await makeApp(db);
  });

  it('POST legt leere Sample-Zeile an, sort_order = max+1', async () => {
    const productId = makeProduct(db);

    const r1 = await request(app).post(`/api/amazon/products/${productId}/sourcing/samples`).send({});
    expect(r1.status).toBe(201);
    expect(r1.body.sample).toMatchObject({
      product_id: productId,
      sort_order: 1,
      is_winner: 0,
      hersteller: null,
      bewertung: null,
    });

    const r2 = await request(app).post(`/api/amazon/products/${productId}/sourcing/samples`).send({});
    expect(r2.body.sample.sort_order).toBe(2);

    const r3 = await request(app).post(`/api/amazon/products/${productId}/sourcing/samples`).send({});
    expect(r3.body.sample.sort_order).toBe(3);
  });

  it('POST gibt 404 fuer unbekanntes Produkt', async () => {
    const r = await request(app).post(`/api/amazon/products/9999/sourcing/samples`).send({});
    expect(r.status).toBe(404);
  });

  it('PATCH aktualisiert Felder mit Trim', async () => {
    const productId = makeProduct(db);
    const created = await request(app).post(`/api/amazon/products/${productId}/sourcing/samples`).send({});
    const sid = created.body.sample.id;

    const r = await request(app)
      .patch(`/api/amazon/products/${productId}/sourcing/samples/${sid}`)
      .send({ hersteller: '  Lieferant A  ', bewertung: 4, qualitaet: 'gut', status: 'bestellt' });

    expect(r.status).toBe(200);
    expect(r.body.sample.hersteller).toBe('Lieferant A');
    expect(r.body.sample.bewertung).toBe(4);
    expect(r.body.sample.qualitaet).toBe('gut');
    expect(r.body.sample.status).toBe('bestellt');
  });

  it('PATCH leerer String wird zu null', async () => {
    const productId = makeProduct(db);
    const created = await request(app).post(`/api/amazon/products/${productId}/sourcing/samples`).send({});
    const sid = created.body.sample.id;
    await request(app).patch(`/api/amazon/products/${productId}/sourcing/samples/${sid}`)
      .send({ hersteller: 'X' });
    const r = await request(app).patch(`/api/amazon/products/${productId}/sourcing/samples/${sid}`)
      .send({ hersteller: '' });
    expect(r.body.sample.hersteller).toBeNull();
  });

  it('PATCH ungueltige bewertung -> 400', async () => {
    const productId = makeProduct(db);
    const created = await request(app).post(`/api/amazon/products/${productId}/sourcing/samples`).send({});
    const sid = created.body.sample.id;

    const r1 = await request(app).patch(`/api/amazon/products/${productId}/sourcing/samples/${sid}`)
      .send({ bewertung: 7 });
    expect(r1.status).toBe(400);

    const r2 = await request(app).patch(`/api/amazon/products/${productId}/sourcing/samples/${sid}`)
      .send({ bewertung: -1 });
    expect(r2.status).toBe(400);
  });

  it('PATCH ungueltige qualitaet/status -> 400', async () => {
    const productId = makeProduct(db);
    const created = await request(app).post(`/api/amazon/products/${productId}/sourcing/samples`).send({});
    const sid = created.body.sample.id;

    const r1 = await request(app).patch(`/api/amazon/products/${productId}/sourcing/samples/${sid}`)
      .send({ qualitaet: 'super_gut' });
    expect(r1.status).toBe(400);

    const r2 = await request(app).patch(`/api/amazon/products/${productId}/sourcing/samples/${sid}`)
      .send({ status: 'kaputt' });
    expect(r2.status).toBe(400);
  });

  it('PATCH is_winner = 1 setzt alle anderen auf 0 (Transaktion)', async () => {
    const productId = makeProduct(db);
    const s1 = (await request(app).post(`/api/amazon/products/${productId}/sourcing/samples`).send({})).body.sample.id;
    const s2 = (await request(app).post(`/api/amazon/products/${productId}/sourcing/samples`).send({})).body.sample.id;
    const s3 = (await request(app).post(`/api/amazon/products/${productId}/sourcing/samples`).send({})).body.sample.id;

    await request(app).patch(`/api/amazon/products/${productId}/sourcing/samples/${s1}`).send({ is_winner: 1 });
    let rows = db.prepare(`SELECT id, is_winner FROM amazon_sourcing_samples WHERE product_id=?`).all(productId) as Array<{ id: number; is_winner: number }>;
    expect(rows.find(r => r.id === s1)!.is_winner).toBe(1);
    expect(rows.find(r => r.id === s2)!.is_winner).toBe(0);
    expect(rows.find(r => r.id === s3)!.is_winner).toBe(0);

    await request(app).patch(`/api/amazon/products/${productId}/sourcing/samples/${s2}`).send({ is_winner: 1 });
    rows = db.prepare(`SELECT id, is_winner FROM amazon_sourcing_samples WHERE product_id=?`).all(productId) as Array<{ id: number; is_winner: number }>;
    expect(rows.find(r => r.id === s1)!.is_winner).toBe(0);
    expect(rows.find(r => r.id === s2)!.is_winner).toBe(1);
  });

  it('PATCH text-Feld > 500 -> 400', async () => {
    const productId = makeProduct(db);
    const sid = (await request(app).post(`/api/amazon/products/${productId}/sourcing/samples`).send({})).body.sample.id;
    const r = await request(app).patch(`/api/amazon/products/${productId}/sourcing/samples/${sid}`)
      .send({ notizen: 'x'.repeat(501) });
    expect(r.status).toBe(400);
  });

  it('DELETE entfernt Sample', async () => {
    const productId = makeProduct(db);
    const sid = (await request(app).post(`/api/amazon/products/${productId}/sourcing/samples`).send({})).body.sample.id;

    const r = await request(app).delete(`/api/amazon/products/${productId}/sourcing/samples/${sid}`);
    expect(r.status).toBe(204);

    const row = db.prepare(`SELECT * FROM amazon_sourcing_samples WHERE id=?`).get(sid);
    expect(row).toBeUndefined();
  });

  it('DELETE eines fremden Sample -> 404', async () => {
    const productA = makeProduct(db, 'A');
    const productB = makeProduct(db, 'B');
    const sid = (await request(app).post(`/api/amazon/products/${productA}/sourcing/samples`).send({})).body.sample.id;

    const r = await request(app).delete(`/api/amazon/products/${productB}/sourcing/samples/${sid}`);
    expect(r.status).toBe(404);
  });

  it('Sample-Limit 50: 51. POST -> 400', async () => {
    const productId = makeProduct(db);
    // 50 Inserts direkt in DB, schneller als 50 HTTP-Calls
    const insert = db.prepare(`INSERT INTO amazon_sourcing_samples (product_id, sort_order) VALUES (?, ?)`);
    for (let i = 1; i <= 50; i++) insert.run(productId, i);

    const r = await request(app).post(`/api/amazon/products/${productId}/sourcing/samples`).send({});
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/limit/i);
  });
});
```

- [ ] **Step 2: Tests laufen lassen, Sample-Tests rot**

```bash
cd backend && npm test -- integration.amazon_sourcing
```
Erwartet: GET/PATCH-Tests **PASS**, Sample-Tests **FAIL**.

- [ ] **Step 3: Sample-Handler in Route-Datei einbauen (GREEN)**

In `backend/src/routes/amazon.sourcing.routes.ts`: vor `export default router;` Folgendes einfügen.

Zuerst Hilfs-Typen und Validatoren am Anfang der Datei (nach den existierenden Imports und Konstanten) ergänzen:

```ts
type SampleQuality = 'sehr_gut' | 'gut' | 'mittel' | 'schlecht';
type SampleStatus = 'angefragt' | 'bestellt' | 'erhalten' | 'abgelehnt';
const VALID_QUALITY: ReadonlySet<SampleQuality> = new Set(['sehr_gut', 'gut', 'mittel', 'schlecht']);
const VALID_SAMPLE_STATUS: ReadonlySet<SampleStatus> = new Set(['angefragt', 'bestellt', 'erhalten', 'abgelehnt']);

const SAMPLE_LIMIT = 50;
const MAX_TEXT_LEN = 500;

interface SampleRow {
  id: number;
  product_id: number;
  sort_order: number;
  is_winner: number;
  hersteller: string | null;
  sample_kosten: string | null;
  besonderheiten: string | null;
  lieferzeit: string | null;
  qualitaet: SampleQuality | null;
  bewertung: number | null;
  status: SampleStatus | null;
  notizen: string | null;
  created_at: number;
  updated_at: number;
}

function normalizeText(raw: unknown): { ok: true; value: string | null } | { ok: false } {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: false };
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: true, value: null };
  if (trimmed.length > MAX_TEXT_LEN) return { ok: false };
  return { ok: true, value: trimmed };
}

function loadSample(productId: number, sampleId: number): SampleRow | undefined {
  return db.prepare(
    `SELECT * FROM amazon_sourcing_samples WHERE id = ? AND product_id = ?`
  ).get(sampleId, productId) as SampleRow | undefined;
}
```

Dann die drei Handler **vor** `export default router;`:

```ts
// POST /api/amazon/products/:id/sourcing/samples
router.post('/products/:id/sourcing/samples', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) {
    res.status(404).json({ error: 'product not found' });
    return;
  }

  const count = (db.prepare(
    `SELECT COUNT(*) AS c FROM amazon_sourcing_samples WHERE product_id = ?`
  ).get(id) as { c: number }).c;
  if (count >= SAMPLE_LIMIT) {
    res.status(400).json({ error: 'sample limit reached' });
    return;
  }

  const maxOrder = (db.prepare(
    `SELECT COALESCE(MAX(sort_order), 0) AS m FROM amazon_sourcing_samples WHERE product_id = ?`
  ).get(id) as { m: number }).m;

  const result = db.prepare(
    `INSERT INTO amazon_sourcing_samples (product_id, sort_order) VALUES (?, ?)`
  ).run(id, maxOrder + 1);

  const row = db.prepare(`SELECT * FROM amazon_sourcing_samples WHERE id = ?`).get(result.lastInsertRowid) as SampleRow;
  res.status(201).json({ sample: row });
});

// PATCH /api/amazon/products/:id/sourcing/samples/:sampleId
router.patch('/products/:id/sourcing/samples/:sampleId', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const sampleId = Number(req.params.sampleId);
  if (!Number.isInteger(id) || !Number.isInteger(sampleId)) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  if (!ensureProduct(id) || !loadSample(id, sampleId)) {
    res.status(404).json({ error: 'not found' });
    return;
  }

  const body = (req.body as Record<string, unknown>) ?? {};
  const updates: string[] = [];
  const params: unknown[] = [];

  // Text-Felder
  for (const col of ['hersteller', 'sample_kosten', 'besonderheiten', 'lieferzeit', 'notizen'] as const) {
    if (body[col] !== undefined) {
      const v = normalizeText(body[col]);
      if (!v.ok) { res.status(400).json({ error: `invalid ${col}` }); return; }
      updates.push(`${col} = ?`);
      params.push(v.value);
    }
  }

  if (body.qualitaet !== undefined) {
    if (body.qualitaet !== null &&
        (typeof body.qualitaet !== 'string' || !VALID_QUALITY.has(body.qualitaet as SampleQuality))) {
      res.status(400).json({ error: 'invalid qualitaet' });
      return;
    }
    updates.push('qualitaet = ?');
    params.push(body.qualitaet);
  }

  if (body.status !== undefined) {
    if (body.status !== null &&
        (typeof body.status !== 'string' || !VALID_SAMPLE_STATUS.has(body.status as SampleStatus))) {
      res.status(400).json({ error: 'invalid status' });
      return;
    }
    updates.push('status = ?');
    params.push(body.status);
  }

  if (body.bewertung !== undefined) {
    if (body.bewertung !== null &&
        (typeof body.bewertung !== 'number' || !Number.isInteger(body.bewertung) ||
         body.bewertung < 0 || body.bewertung > 5)) {
      res.status(400).json({ error: 'invalid bewertung' });
      return;
    }
    updates.push('bewertung = ?');
    params.push(body.bewertung);
  }

  if (body.sort_order !== undefined) {
    if (typeof body.sort_order !== 'number' || !Number.isInteger(body.sort_order)) {
      res.status(400).json({ error: 'invalid sort_order' });
      return;
    }
    updates.push('sort_order = ?');
    params.push(body.sort_order);
  }

  // Winner-Exklusivitaet
  if (body.is_winner !== undefined) {
    if (body.is_winner !== 0 && body.is_winner !== 1) {
      res.status(400).json({ error: 'invalid is_winner' });
      return;
    }
    if (body.is_winner === 1) {
      db.transaction(() => {
        db.prepare(
          `UPDATE amazon_sourcing_samples SET is_winner = 0, updated_at = unixepoch()
           WHERE product_id = ? AND id != ?`
        ).run(id, sampleId);
        // is_winner = 1 wird mit dem normalen UPDATE unten gesetzt
      })();
    }
    updates.push('is_winner = ?');
    params.push(body.is_winner);
  }

  if (updates.length > 0) {
    updates.push('updated_at = unixepoch()');
    params.push(sampleId);
    db.prepare(`UPDATE amazon_sourcing_samples SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }

  const row = db.prepare(`SELECT * FROM amazon_sourcing_samples WHERE id = ?`).get(sampleId) as SampleRow;
  res.json({ sample: row });
});

// DELETE /api/amazon/products/:id/sourcing/samples/:sampleId
router.delete('/products/:id/sourcing/samples/:sampleId', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const sampleId = Number(req.params.sampleId);
  if (!Number.isInteger(id) || !Number.isInteger(sampleId)) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  if (!ensureProduct(id) || !loadSample(id, sampleId)) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  db.prepare(`DELETE FROM amazon_sourcing_samples WHERE id = ?`).run(sampleId);
  res.status(204).end();
});
```

- [ ] **Step 4: Tests laufen lassen, alle gruen**

```bash
cd backend && npm test -- integration.amazon_sourcing
```
Erwartet: **alle** Tests (GET/PATCH + Samples) **PASS** (insgesamt 17).

- [ ] **Step 5: Route in app.ts mounten**

In `backend/src/app.ts`:

(a) Import nach `amazonProductsRoutes` ergänzen:

```ts
import amazonSourcingRoutes from './routes/amazon.sourcing.routes';
```

(b) Mount nach `app.use('/api/amazon', amazonProductsRoutes);` ergänzen:

```ts
app.use('/api/amazon', amazonSourcingRoutes);
```

- [ ] **Step 6: Backend starten und Health pruefen**

```bash
cd backend && pkill -f "tsx watch" 2>/dev/null; sleep 1; npm run dev &
sleep 3
curl -s http://localhost:3001/api/health
```
Erwartet: `{"status":"ok"}`. Dann `pkill -f "tsx watch"`.

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/amazon.sourcing.routes.ts backend/test/integration.amazon_sourcing.test.ts backend/src/app.ts
git commit -m "feat(amazon-sourcing): Sample-CRUD mit Winner-Exklusivitaet + Mount

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Frontend — API-Types + Wrappers

**Files:**
- Modify: `frontend/src/api/amazon.api.ts` (anhängen)

- [ ] **Step 1: Types + Wrappers anhaengen**

Am Ende von `frontend/src/api/amazon.api.ts` Folgendes anhängen:

```ts
// ── Sourcing ──────────────────────────────────────────────────────────────────

export type SourcingStatus = 'offen' | 'in_bearbeitung' | 'erledigt';
export type SampleQuality = 'sehr_gut' | 'gut' | 'mittel' | 'schlecht';
export type SampleStatus = 'angefragt' | 'bestellt' | 'erhalten' | 'abgelehnt';

export const SOURCING_CP_KEYS = [
  'cp_hersteller_gefiltert',
  'cp_anforderungen_kommuniziert',
  'cp_erste_preise_erhalten',
  'cp_usp_geprueft',
  'cp_samples_angefragt',
  'cp_sample_analyse',
  'cp_vergleichstabelle',
  'cp_finale_verhandlung',
  'cp_zahlungsziel',
] as const;
export type SourcingCpKey = typeof SOURCING_CP_KEYS[number];

export interface Sourcing {
  product_id: number;
  status: SourcingStatus;
  is_expanded: 0 | 1;
  cp_hersteller_gefiltert: 0 | 1;
  cp_anforderungen_kommuniziert: 0 | 1;
  cp_erste_preise_erhalten: 0 | 1;
  cp_usp_geprueft: 0 | 1;
  cp_samples_angefragt: 0 | 1;
  cp_sample_analyse: 0 | 1;
  cp_vergleichstabelle: 0 | 1;
  cp_finale_verhandlung: 0 | 1;
  cp_zahlungsziel: 0 | 1;
  updated_at: number;
}

export interface SourcingSample {
  id: number;
  product_id: number;
  sort_order: number;
  is_winner: 0 | 1;
  hersteller: string | null;
  sample_kosten: string | null;
  besonderheiten: string | null;
  lieferzeit: string | null;
  qualitaet: SampleQuality | null;
  bewertung: number | null;
  status: SampleStatus | null;
  notizen: string | null;
  created_at: number;
  updated_at: number;
}

export interface SourcingPayload {
  sourcing: Sourcing;
  samples: SourcingSample[];
}

export type SourcingPatch = Partial<
  Pick<Sourcing, 'status' | 'is_expanded'>
  & Record<SourcingCpKey, 0 | 1>
>;

export type SamplePatch = Partial<{
  is_winner: 0 | 1;
  hersteller: string | null;
  sample_kosten: string | null;
  besonderheiten: string | null;
  lieferzeit: string | null;
  qualitaet: SampleQuality | null;
  bewertung: number | null;
  status: SampleStatus | null;
  notizen: string | null;
  sort_order: number;
}>;

export async function fetchSourcing(productId: number): Promise<SourcingPayload> {
  const r = await apiClient.get<SourcingPayload>(`/amazon/products/${productId}/sourcing`);
  return r.data;
}

export async function updateSourcing(productId: number, patch: SourcingPatch): Promise<Sourcing> {
  const r = await apiClient.patch<{ sourcing: Sourcing }>(`/amazon/products/${productId}/sourcing`, patch);
  return r.data.sourcing;
}

export async function createSample(productId: number): Promise<SourcingSample> {
  const r = await apiClient.post<{ sample: SourcingSample }>(
    `/amazon/products/${productId}/sourcing/samples`,
    {},
  );
  return r.data.sample;
}

export async function updateSample(
  productId: number,
  sampleId: number,
  patch: SamplePatch,
): Promise<SourcingSample> {
  const r = await apiClient.patch<{ sample: SourcingSample }>(
    `/amazon/products/${productId}/sourcing/samples/${sampleId}`,
    patch,
  );
  return r.data.sample;
}

export async function deleteSample(productId: number, sampleId: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${productId}/sourcing/samples/${sampleId}`);
}
```

- [ ] **Step 2: Typecheck**

```bash
cd frontend && npm run typecheck
```
Erwartet: 0 Fehler.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/amazon.api.ts
git commit -m "feat(amazon-sourcing): Frontend Types + API-Wrappers

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Frontend — Hooks `useSourcing.ts`

**Files:**
- Create: `frontend/src/hooks/amazon/useSourcing.ts`

- [ ] **Step 1: Hook-Datei schreiben**

Datei `frontend/src/hooks/amazon/useSourcing.ts`:

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  type Sourcing, type SourcingPatch, type SourcingPayload,
  type SourcingSample, type SamplePatch,
  fetchSourcing, updateSourcing as apiUpdateSourcing,
  createSample as apiCreateSample,
  updateSample as apiUpdateSample,
  deleteSample as apiDeleteSample,
} from '../../api/amazon.api';

export const sourcingKey = (productId: number) =>
  ['amazon', 'products', productId, 'sourcing'] as const;

export function useSourcing(productId: number) {
  return useQuery({
    queryKey: sourcingKey(productId),
    queryFn: () => fetchSourcing(productId),
    enabled: Number.isInteger(productId) && productId > 0,
  });
}

export function useUpdateSourcing(productId: number) {
  const qc = useQueryClient();
  const key = sourcingKey(productId);
  return useMutation({
    mutationFn: (patch: SourcingPatch) => apiUpdateSourcing(productId, patch),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<SourcingPayload>(key);
      if (prev) {
        qc.setQueryData<SourcingPayload>(key, {
          ...prev,
          sourcing: { ...prev.sourcing, ...patch } as Sourcing,
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export function useCreateSample(productId: number) {
  const qc = useQueryClient();
  const key = sourcingKey(productId);
  return useMutation({
    mutationFn: () => apiCreateSample(productId),
    onSuccess: (sample) => {
      const prev = qc.getQueryData<SourcingPayload>(key);
      if (prev) {
        qc.setQueryData<SourcingPayload>(key, {
          ...prev,
          samples: [...prev.samples, sample],
        });
      } else {
        qc.invalidateQueries({ queryKey: key });
      }
    },
  });
}

export function useUpdateSample(productId: number) {
  const qc = useQueryClient();
  const key = sourcingKey(productId);
  return useMutation({
    mutationFn: ({ sampleId, patch }: { sampleId: number; patch: SamplePatch }) =>
      apiUpdateSample(productId, sampleId, patch),
    onMutate: async ({ sampleId, patch }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<SourcingPayload>(key);
      if (prev) {
        const winnerExclusive = patch.is_winner === 1;
        const updatedSamples: SourcingSample[] = prev.samples.map(s => {
          if (s.id === sampleId) return { ...s, ...patch } as SourcingSample;
          if (winnerExclusive) return { ...s, is_winner: 0 };
          return s;
        });
        qc.setQueryData<SourcingPayload>(key, { ...prev, samples: updatedSamples });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export function useDeleteSample(productId: number) {
  const qc = useQueryClient();
  const key = sourcingKey(productId);
  return useMutation({
    mutationFn: (sampleId: number) => apiDeleteSample(productId, sampleId),
    onMutate: async (sampleId) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<SourcingPayload>(key);
      if (prev) {
        qc.setQueryData<SourcingPayload>(key, {
          ...prev,
          samples: prev.samples.filter(s => s.id !== sampleId),
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}
```

- [ ] **Step 2: Typecheck**

```bash
cd frontend && npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/amazon/useSourcing.ts
git commit -m "feat(amazon-sourcing): TanStack-Query-Hooks mit optimistic Updates

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: SectionHeader + SectionStatusBadge

**Files:**
- Create: `frontend/src/components/amazon/SectionStatusBadge.tsx`
- Create: `frontend/src/components/amazon/SectionHeader.tsx`

Wiederverwendbar: spätere Sektionen erben diese beiden Komponenten.

- [ ] **Step 1: SectionStatusBadge**

Datei `frontend/src/components/amazon/SectionStatusBadge.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react';
import { type SourcingStatus } from '../../api/amazon.api';

const LABEL: Record<SourcingStatus, string> = {
  offen:           'Offen',
  in_bearbeitung:  'In Bearbeitung',
  erledigt:        'Erledigt',
};
const COLOR: Record<SourcingStatus, string> = {
  offen:           '#9ca3af',
  in_bearbeitung:  '#60a5fa',
  erledigt:        '#34d399',
};
const ORDER: SourcingStatus[] = ['offen', 'in_bearbeitung', 'erledigt'];

interface Props {
  status: SourcingStatus;
  onChange: (next: SourcingStatus) => void;
  isPending?: boolean;
}

export function SectionStatusBadge({ status, onChange, isPending }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

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
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
        className="px-2.5 py-1 rounded-full text-xs flex items-center gap-1"
        style={{ background: `${color}33`, color }}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={isPending}
      >
        {LABEL[status]}
        <span className="material-symbols-outlined text-base" style={{ fontSize: '14px' }}>expand_more</span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-1 rounded-lg shadow-lg overflow-hidden z-20 min-w-[160px]"
          style={{ background: 'var(--color-surface-container-high)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          {ORDER.map((s) => {
            const isCurrent = s === status;
            const c = COLOR[s];
            return (
              <button
                key={s}
                type="button"
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  if (s !== status) onChange(s);
                  setOpen(false);
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
                  {isCurrent ? 'check' : 'circle'}
                </span>
                <span className="flex-1">{LABEL[s]}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: SectionHeader**

Datei `frontend/src/components/amazon/SectionHeader.tsx`:

```tsx
import { type ReactNode } from 'react';

interface Props {
  icon: string;
  title: string;
  accent: string;       // CSS color (z.B. '#a78bfa')
  expanded: boolean;
  onToggleExpand: () => void;
  rightSlot?: ReactNode; // i.d.R. das SectionStatusBadge
}

export function SectionHeader({ icon, title, accent, expanded, onToggleExpand, rightSlot }: Props) {
  return (
    <header
      role="button"
      tabIndex={0}
      onClick={onToggleExpand}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggleExpand();
        }
      }}
      className="flex items-center gap-3 px-5 py-4 cursor-pointer select-none"
      style={{ background: 'transparent' }}
    >
      <span className="material-symbols-outlined" style={{ color: accent }}>{icon}</span>
      <h2 className="flex-1 font-semibold" style={{ color: accent }}>{title}</h2>
      {rightSlot}
      <span
        className="material-symbols-outlined transition-transform"
        style={{
          color: 'var(--color-on-surface-variant)',
          transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
        }}
      >
        expand_more
      </span>
    </header>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
cd frontend && npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/amazon/SectionStatusBadge.tsx frontend/src/components/amazon/SectionHeader.tsx
git commit -m "feat(amazon-sections): wiederverwendbare SectionHeader + SectionStatusBadge

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: SourcingChecklist

**Files:**
- Create: `frontend/src/components/amazon/SourcingChecklist.tsx`

- [ ] **Step 1: Datei schreiben**

Datei `frontend/src/components/amazon/SourcingChecklist.tsx`:

```tsx
import { type Sourcing, type SourcingCpKey } from '../../api/amazon.api';
import { useUpdateSourcing } from '../../hooks/amazon/useSourcing';

const ITEMS: Array<{ key: SourcingCpKey; label: string }> = [
  { key: 'cp_hersteller_gefiltert',       label: 'Hersteller gefiltert' },
  { key: 'cp_anforderungen_kommuniziert', label: 'Anforderungen kommuniziert' },
  { key: 'cp_erste_preise_erhalten',      label: 'Erste Preise erhalten' },
  { key: 'cp_usp_geprueft',               label: 'USP Umsetzbarkeit geprueft' },
  { key: 'cp_samples_angefragt',          label: 'Samples angefragt' },
  { key: 'cp_sample_analyse',             label: 'Sample Analyse durchgefuehrt' },
  { key: 'cp_vergleichstabelle',          label: 'Vergleichstabelle erstellt' },
  { key: 'cp_finale_verhandlung',         label: 'Finale Verhandlung durchgefuehrt' },
  { key: 'cp_zahlungsziel',               label: 'Zahlungsziel verhandelt' },
];

interface Props {
  productId: number;
  sourcing: Sourcing;
}

export function SourcingChecklist({ productId, sourcing }: Props) {
  const update = useUpdateSourcing(productId);

  function toggle(key: SourcingCpKey) {
    const next: 0 | 1 = sourcing[key] === 1 ? 0 : 1;
    update.mutate({ [key]: next } as Partial<Record<SourcingCpKey, 0 | 1>>);
  }

  return (
    <div className="px-5 pb-3">
      <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-on-surface)' }}>
        Sourcing Schritte anzeigen
      </h3>
      <ul className="flex flex-col gap-2">
        {ITEMS.map(({ key, label }) => {
          const checked = sourcing[key] === 1;
          return (
            <li key={key}>
              <label
                className="flex items-center gap-2 cursor-pointer text-sm"
                style={{ color: 'var(--color-on-surface)' }}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(key)}
                  className="w-4 h-4"
                  style={{ accentColor: 'var(--color-primary)' }}
                />
                {label}
              </label>
            </li>
          );
        })}
      </ul>
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
git add frontend/src/components/amazon/SourcingChecklist.tsx
git commit -m "feat(amazon-sourcing): 9-Punkte-Checkliste mit optimistic Toggle

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: SourcingSampleRow + Tabelle + Delete-Dialog

**Files:**
- Create: `frontend/src/components/amazon/DeleteSampleDialog.tsx`
- Create: `frontend/src/components/amazon/SourcingSampleRow.tsx`
- Create: `frontend/src/components/amazon/SourcingSampleTable.tsx`

- [ ] **Step 1: DeleteSampleDialog**

Datei `frontend/src/components/amazon/DeleteSampleDialog.tsx`:

```tsx
import { type SourcingSample } from '../../api/amazon.api';
import { useDeleteSample } from '../../hooks/amazon/useSourcing';

interface Props {
  productId: number;
  sample: SourcingSample | null;
  onClose: () => void;
}

export function DeleteSampleDialog({ productId, sample, onClose }: Props) {
  const del = useDeleteSample(productId);
  if (!sample) return null;

  async function handleConfirm() {
    if (!sample) return;
    try {
      await del.mutateAsync(sample.id);
      onClose();
    } catch { /* Fehler bleibt im Mutation-State */ }
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
        <h2 className="font-semibold mb-2" style={{ color: 'var(--color-on-surface)' }}>Sample loeschen?</h2>
        <p className="text-sm mb-4" style={{ color: 'var(--color-on-surface-variant)' }}>
          „{sample.hersteller || 'Unbenanntes Sample'}" wird dauerhaft entfernt.
        </p>
        {del.isError && <p className="text-sm mb-2" style={{ color: '#fca5a5' }}>Loeschen fehlgeschlagen.</p>}
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
            {del.isPending ? 'Loesche…' : 'Loeschen'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: SourcingSampleRow**

Datei `frontend/src/components/amazon/SourcingSampleRow.tsx`:

```tsx
import { useEffect, useState } from 'react';
import {
  type SamplePatch, type SampleQuality, type SampleStatus, type SourcingSample,
} from '../../api/amazon.api';
import { useUpdateSample } from '../../hooks/amazon/useSourcing';

const QUALITY_OPTIONS: Array<{ value: SampleQuality; label: string }> = [
  { value: 'sehr_gut', label: 'Sehr gut' },
  { value: 'gut',      label: 'Gut' },
  { value: 'mittel',   label: 'Mittel' },
  { value: 'schlecht', label: 'Schlecht' },
];
const STATUS_OPTIONS: Array<{ value: SampleStatus; label: string }> = [
  { value: 'angefragt', label: 'Angefragt' },
  { value: 'bestellt',  label: 'Bestellt' },
  { value: 'erhalten',  label: 'Erhalten' },
  { value: 'abgelehnt', label: 'Abgelehnt' },
];

interface Props {
  productId: number;
  sample: SourcingSample;
  onRequestDelete: (sample: SourcingSample) => void;
}

const INPUT_STYLE: React.CSSProperties = {
  background: 'var(--color-surface-container-low)',
  color: 'var(--color-on-surface)',
  border: '1px solid rgba(255,255,255,0.08)',
};

export function SourcingSampleRow({ productId, sample, onRequestDelete }: Props) {
  const update = useUpdateSample(productId);

  // Lokaler Mirror der Text-Felder (on-blur PATCH)
  const [hersteller, setHersteller] = useState(sample.hersteller ?? '');
  const [kosten, setKosten] = useState(sample.sample_kosten ?? '');
  const [besonderheiten, setBesonderheiten] = useState(sample.besonderheiten ?? '');
  const [lieferzeit, setLieferzeit] = useState(sample.lieferzeit ?? '');
  const [notizen, setNotizen] = useState(sample.notizen ?? '');

  // Synchronisieren wenn der Server frische Werte liefert
  useEffect(() => { setHersteller(sample.hersteller ?? ''); }, [sample.hersteller]);
  useEffect(() => { setKosten(sample.sample_kosten ?? ''); }, [sample.sample_kosten]);
  useEffect(() => { setBesonderheiten(sample.besonderheiten ?? ''); }, [sample.besonderheiten]);
  useEffect(() => { setLieferzeit(sample.lieferzeit ?? ''); }, [sample.lieferzeit]);
  useEffect(() => { setNotizen(sample.notizen ?? ''); }, [sample.notizen]);

  function patch(p: SamplePatch) {
    update.mutate({ sampleId: sample.id, patch: p });
  }

  function saveText(field: keyof SamplePatch, current: string, original: string | null) {
    const trimmed = current.trim();
    const next: string | null = trimmed.length === 0 ? null : trimmed;
    if (next === original) return;
    patch({ [field]: next } as SamplePatch);
  }

  function setWinner() {
    if (sample.is_winner === 1) return;
    patch({ is_winner: 1 });
  }

  return (
    <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      {/* Winner */}
      <td className="p-2 text-center">
        <button
          type="button"
          aria-label={sample.is_winner === 1 ? 'Winner' : 'Als Winner markieren'}
          onClick={setWinner}
          className="w-5 h-5 rounded-full flex items-center justify-center"
          style={{
            border: '2px solid ' + (sample.is_winner === 1 ? '#34d399' : 'rgba(255,255,255,0.3)'),
            background: sample.is_winner === 1 ? '#34d399' : 'transparent',
          }}
        >
          {sample.is_winner === 1 && (
            <span className="material-symbols-outlined" style={{ fontSize: '14px', color: '#fff' }}>check</span>
          )}
        </button>
      </td>

      {/* Hersteller */}
      <td className="p-2">
        <input
          type="text" value={hersteller}
          onChange={(e) => setHersteller(e.target.value)}
          onBlur={() => saveText('hersteller', hersteller, sample.hersteller)}
          maxLength={500}
          placeholder="Hersteller Name"
          className="w-full px-2 py-1 rounded text-sm"
          style={INPUT_STYLE}
        />
      </td>

      {/* Kosten */}
      <td className="p-2">
        <input
          type="text" value={kosten}
          onChange={(e) => setKosten(e.target.value)}
          onBlur={() => saveText('sample_kosten', kosten, sample.sample_kosten)}
          maxLength={500}
          placeholder="0.00 USD"
          className="w-full px-2 py-1 rounded text-sm"
          style={INPUT_STYLE}
        />
      </td>

      {/* Besonderheiten */}
      <td className="p-2">
        <input
          type="text" value={besonderheiten}
          onChange={(e) => setBesonderheiten(e.target.value)}
          onBlur={() => saveText('besonderheiten', besonderheiten, sample.besonderheiten)}
          maxLength={500}
          placeholder="z.B. besondere Merkmale"
          className="w-full px-2 py-1 rounded text-sm"
          style={INPUT_STYLE}
        />
      </td>

      {/* Lieferzeit */}
      <td className="p-2">
        <input
          type="text" value={lieferzeit}
          onChange={(e) => setLieferzeit(e.target.value)}
          onBlur={() => saveText('lieferzeit', lieferzeit, sample.lieferzeit)}
          maxLength={500}
          placeholder="z.B. 3-5 Tage"
          className="w-full px-2 py-1 rounded text-sm"
          style={INPUT_STYLE}
        />
      </td>

      {/* Qualitaet */}
      <td className="p-2">
        <select
          value={sample.qualitaet ?? ''}
          onChange={(e) => patch({ qualitaet: (e.target.value || null) as SampleQuality | null })}
          className="w-full px-2 py-1 rounded text-sm"
          style={INPUT_STYLE}
        >
          <option value="">Qualitaet</option>
          {QUALITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </td>

      {/* Bewertung */}
      <td className="p-2">
        <div className="flex items-center gap-0.5">
          {[1, 2, 3, 4, 5].map(n => {
            const active = sample.bewertung !== null && n <= sample.bewertung;
            return (
              <button
                key={n}
                type="button"
                aria-label={`${n} Sterne`}
                onClick={() => patch({ bewertung: n })}
                className="w-5 h-5 flex items-center justify-center"
              >
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: '18px',
                    color: active ? '#fbbf24' : 'rgba(255,255,255,0.25)',
                    fontVariationSettings: active ? '"FILL" 1' : '"FILL" 0',
                  }}
                >
                  star
                </span>
              </button>
            );
          })}
        </div>
      </td>

      {/* Status */}
      <td className="p-2">
        <select
          value={sample.status ?? ''}
          onChange={(e) => patch({ status: (e.target.value || null) as SampleStatus | null })}
          className="w-full px-2 py-1 rounded text-sm"
          style={INPUT_STYLE}
        >
          <option value="">Status</option>
          {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </td>

      {/* Notizen */}
      <td className="p-2">
        <input
          type="text" value={notizen}
          onChange={(e) => setNotizen(e.target.value)}
          onBlur={() => saveText('notizen', notizen, sample.notizen)}
          maxLength={500}
          placeholder="Sample-Notizen"
          className="w-full px-2 py-1 rounded text-sm"
          style={INPUT_STYLE}
        />
      </td>

      {/* Aktionen */}
      <td className="p-2 text-right">
        <button
          type="button"
          onClick={() => onRequestDelete(sample)}
          aria-label="Sample loeschen"
          className="p-1 rounded hover:bg-white/5"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#fca5a5' }}>delete</span>
        </button>
      </td>
    </tr>
  );
}
```

- [ ] **Step 3: SourcingSampleTable**

Datei `frontend/src/components/amazon/SourcingSampleTable.tsx`:

```tsx
import { useState } from 'react';
import { type SourcingSample } from '../../api/amazon.api';
import { useCreateSample } from '../../hooks/amazon/useSourcing';
import { SourcingSampleRow } from './SourcingSampleRow';
import { DeleteSampleDialog } from './DeleteSampleDialog';

const SAMPLE_LIMIT = 50;

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
  samples: SourcingSample[];
}

export function SourcingSampleTable({ productId, samples }: Props) {
  const create = useCreateSample(productId);
  const [pendingDelete, setPendingDelete] = useState<SourcingSample | null>(null);
  const atLimit = samples.length >= SAMPLE_LIMIT;

  return (
    <div className="px-5 pb-5">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--color-on-surface)' }}>
        <span className="material-symbols-outlined text-base">bar_chart</span>
        Sample Vergleich
      </h3>

      {samples.length === 0 ? (
        <p
          className="text-sm text-center py-6 rounded-md"
          style={{ color: 'var(--color-on-surface-variant)', background: 'var(--color-surface-container-low)' }}
        >
          Noch keine Samples — auf „+ Sample hinzufuegen" klicken.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full" style={{ minWidth: '900px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <th style={{ ...TH_STYLE, textAlign: 'center' }}>Winner</th>
                <th style={TH_STYLE}>Hersteller</th>
                <th style={TH_STYLE}>Sample Kosten</th>
                <th style={TH_STYLE}>Besonderheiten</th>
                <th style={TH_STYLE}>Lieferzeit</th>
                <th style={TH_STYLE}>Qualitaet</th>
                <th style={TH_STYLE}>Bewertung</th>
                <th style={TH_STYLE}>Status</th>
                <th style={TH_STYLE}>Notizen</th>
                <th style={{ ...TH_STYLE, textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {samples.map(s => (
                <SourcingSampleRow
                  key={s.id}
                  productId={productId}
                  sample={s}
                  onRequestDelete={setPendingDelete}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3">
        <button
          type="button"
          onClick={() => create.mutate()}
          disabled={create.isPending || atLimit}
          title={atLimit ? `Maximal ${SAMPLE_LIMIT} Samples pro Produkt` : undefined}
          className="px-3 py-1.5 rounded-md text-sm flex items-center gap-2 disabled:opacity-50"
          style={{
            background: 'var(--color-surface-container-high)',
            color: 'var(--color-on-surface)',
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <span className="material-symbols-outlined text-base">add</span>
          Sample hinzufuegen
        </button>
      </div>

      <DeleteSampleDialog
        productId={productId}
        sample={pendingDelete}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

```bash
cd frontend && npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/amazon/DeleteSampleDialog.tsx frontend/src/components/amazon/SourcingSampleRow.tsx frontend/src/components/amazon/SourcingSampleTable.tsx
git commit -m "feat(amazon-sourcing): Sample-Tabelle mit Inline-Edit + Stars + Delete-Confirm

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: SourcingSection + Einbindung in Detail-Seite

**Files:**
- Create: `frontend/src/components/amazon/SourcingSection.tsx`
- Create: `frontend/src/components/amazon/AutosaveIndicator.tsx`
- Modify: `frontend/src/pages/amazon/AmazonProductDetailPage.tsx`

- [ ] **Step 1: AutosaveIndicator**

Datei `frontend/src/components/amazon/AutosaveIndicator.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { useIsMutating } from '@tanstack/react-query';

export function AutosaveIndicator() {
  const mutatingCount = useIsMutating({ mutationKey: undefined });
  const isMutating = mutatingCount > 0;
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    if (isMutating) return;
    // Wechsel von „mutating" zu „idle": kurz „Gespeichert ✓" zeigen
    setShowSaved(true);
    const t = setTimeout(() => setShowSaved(false), 1500);
    return () => clearTimeout(t);
  }, [isMutating]);

  if (isMutating) {
    return (
      <p className="text-xs flex items-center gap-1" style={{ color: 'var(--color-on-surface-variant)' }}>
        <span className="material-symbols-outlined text-base animate-spin" style={{ fontSize: '14px' }}>progress_activity</span>
        Speichere …
      </p>
    );
  }
  if (showSaved) {
    return (
      <p className="text-xs flex items-center gap-1" style={{ color: '#34d399' }}>
        <span className="material-symbols-outlined text-base" style={{ fontSize: '14px' }}>check</span>
        Gespeichert
      </p>
    );
  }
  return (
    <p className="text-xs" style={{ color: 'var(--color-on-surface-variant)', opacity: 0.6 }}>
      Aenderungen werden automatisch gespeichert
    </p>
  );
}
```

- [ ] **Step 2: SourcingSection**

Datei `frontend/src/components/amazon/SourcingSection.tsx`:

```tsx
import { type SourcingStatus } from '../../api/amazon.api';
import { useSourcing, useUpdateSourcing } from '../../hooks/amazon/useSourcing';
import { SectionHeader } from './SectionHeader';
import { SectionStatusBadge } from './SectionStatusBadge';
import { SourcingChecklist } from './SourcingChecklist';
import { SourcingSampleTable } from './SourcingSampleTable';

const ACCENT = '#a78bfa'; // purple-400

interface Props {
  productId: number;
}

export function SourcingSection({ productId }: Props) {
  const { data, isLoading, isError, refetch } = useSourcing(productId);
  const update = useUpdateSourcing(productId);

  if (isLoading) {
    return (
      <section
        className="rounded-xl p-5"
        style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <p style={{ color: 'var(--color-on-surface-variant)' }}>Lade Sourcing …</p>
      </section>
    );
  }

  if (isError || !data) {
    return (
      <section
        className="rounded-xl p-5"
        style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <p className="mb-2" style={{ color: 'var(--color-on-surface)' }}>Sourcing konnte nicht geladen werden.</p>
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

  const { sourcing, samples } = data;
  const expanded = sourcing.is_expanded === 1;

  return (
    <section
      className="rounded-xl overflow-hidden"
      style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <SectionHeader
        icon="inventory_2"
        title="Sourcing"
        accent={ACCENT}
        expanded={expanded}
        onToggleExpand={() => update.mutate({ is_expanded: expanded ? 0 : 1 })}
        rightSlot={
          <SectionStatusBadge
            status={sourcing.status}
            onChange={(next: SourcingStatus) => update.mutate({ status: next })}
          />
        }
      />
      {expanded && (
        <>
          <SourcingChecklist productId={productId} sourcing={sourcing} />
          <SourcingSampleTable productId={productId} samples={samples} />
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 3: Detail-Seite einbinden**

In `frontend/src/pages/amazon/AmazonProductDetailPage.tsx`:

(a) Importe ergänzen (nach den existierenden):

```tsx
import { SourcingSection } from '../../components/amazon/SourcingSection';
import { AutosaveIndicator } from '../../components/amazon/AutosaveIndicator';
```

(b) Den existierenden Platzhalter-Block

```tsx
{/* Felder-Spalte (vorerst leer) */}
<section
  className="rounded-xl p-5"
  style={{
    background: 'var(--color-surface-container-low)',
    border: '1px solid rgba(255,255,255,0.06)',
  }}
>
  <h2 className="font-semibold mb-2" style={{ color: 'var(--color-on-surface)' }}>
    Details
  </h2>
  <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
    Felder fuer USP, Marge, Sourcing, Notizen und Tags folgen in den naechsten Schritten.
  </p>
</section>
```

ersetzen durch:

```tsx
{/* Sections-Spalte */}
<div className="flex flex-col gap-4">
  <SourcingSection productId={product.id} />
</div>
```

(c) Direkt nach dem schließenden Tag des äußeren `<div className="grid gap-6 …">`-Blocks (also außerhalb des Grids) folgenden Footer hinzufügen:

```tsx
<div className="mt-4">
  <AutosaveIndicator />
</div>
```

- [ ] **Step 4: Typecheck**

```bash
cd frontend && npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/amazon/SourcingSection.tsx frontend/src/components/amazon/AutosaveIndicator.tsx frontend/src/pages/amazon/AmazonProductDetailPage.tsx
git commit -m "feat(amazon-sourcing): SourcingSection + AutosaveIndicator + Einbindung Detail

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Tests & UAT-Abschluss

**Files:** keine neuen — Verifikation der bereits geschriebenen Tests + manuelles UAT.

- [ ] **Step 1: Alle Backend-Tests gruen**

```bash
cd backend && npm test
```
Erwartet: **alle** Tests bestehen, inkl. `schema.amazon_sourcing` (6) und `integration.amazon_sourcing` (17).

- [ ] **Step 2: Frontend-Typecheck**

```bash
cd frontend && npm run typecheck
```
Erwartet: 0 Fehler.

- [ ] **Step 3: Manuelles UAT**

Backend frisch starten:

```bash
cd backend && pkill -f "tsx watch" 2>/dev/null; sleep 1; npm run dev &
```

Frontend laeuft per `npm run dev`. Browser auf `/amazon` → ein Produkt anlegen → auf die Karte klicken → Detail-Seite.

UAT-Checkliste (jeden Punkt abhaken):
- [ ] Sourcing-Sektion erscheint mit Status „Offen" und allen Checkboxen leer.
- [ ] Status auf „In Bearbeitung" wechseln → Autosave-Indikator: „Speichere…" → „Gespeichert". Reload → Status bleibt.
- [ ] Checkbox „Samples angefragt" setzen → bleibt nach Reload.
- [ ] „+ Sample hinzufuegen" → leere Zeile erscheint sofort.
- [ ] Hersteller eintippen → Tab → Autosave-Indikator zeigt „Speichere…" → „Gespeichert".
- [ ] Qualitaet-Dropdown auf „Gut" → sofort gespeichert.
- [ ] 4. Stern klicken → Bewertung = 4, gefüllte gelbe Sterne.
- [ ] Status-Dropdown auf „Bestellt".
- [ ] Zweite Zeile hinzufügen → Reihenfolge stabil.
- [ ] Winner auf Zeile 2 setzen → Zeile 1 verliert Winner-Status.
- [ ] Sample löschen → Confirm-Modal → Zeile weg.
- [ ] Sektion zuklappen (Klick auf Header) → bleibt nach Reload zugeklappt.
- [ ] Sektion wieder aufklappen → Inhalt erscheint.
- [ ] Fehlerpfad: Backend stoppen, Hersteller tippen, Tab → Autosave-Indikator zeigt nach kurzer Zeit, dass etwas hängt; nach Backend-Start funktioniert erneuter Tab.

- [ ] **Step 4: Falls UAT-Punkt fehlschlaegt**

Zur betroffenen Task zurueckgehen, fixen, hier wieder abhaken. Falls alles gruen ist, kein zusaetzlicher Commit noetig.

---

## Selbstreview-Notizen

- **Spec-Coverage:** Alle in-Scope Items aus der Spec sind durch Tasks abgedeckt — Datenmodell (T1), Sourcing-GET/PATCH (T2), Sample-CRUD + Winner-Exklusivitaet + Mount (T3), Frontend-Types (T4), Hooks (T5), wiederverwendbarer Header (T6), Checkliste (T7), Tabelle/Row/Delete (T8), Section + Detail-Einbindung + AutosaveIndicator (T9), Tests/UAT (T10).
- **Out-of-Scope** bleibt explizit fuer Schritt 3+ liegen: Drag&Drop, weitere Sektionen, Status-Automatik, Export, Sample-Bilder.
- **Bekannte Falle aus Memory:** Stale-Backend nach Routen-Aenderung — T3 enthaelt `pkill -f "tsx watch"`-Reset und UAT verlangt Backend-Neustart.
- **Konsistenz:** Type-Namen `Sourcing`, `SourcingSample`, `SourcingPatch`, `SamplePatch` werden ueber alle Tasks identisch verwendet. Hook-Namen folgen `useSourcing` / `useUpdateSourcing` / `useCreateSample` / `useUpdateSample` / `useDeleteSample`. Backend-Response-Shape `{ sourcing, samples }` bzw. `{ sample }` ist ueberall einheitlich.
