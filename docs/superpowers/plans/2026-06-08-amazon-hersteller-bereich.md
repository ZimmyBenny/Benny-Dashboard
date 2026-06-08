# Amazon Hersteller-Bereich Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein zentraler „Hersteller"-Bereich pro Amazon-Produkt (Stammdaten + mehrere Angebote + Preis-Vergleich), plus ein „In Hersteller übernehmen"-Button am USP-Hersteller, der einen Stammeintrag und eine Sourcing-Muster-Zeile anlegt.

**Architecture:** Neue Tabellen `amazon_manufacturers` (+ `amazon_manufacturer_offers`) als Master-Liste je Produkt; eigene Routen-Datei + neue verschiebbare Frontend-Sektion. USP-Hersteller erhalten eine nullable `manufacturer_id`-Verknüpfung; ein Übernehmen-Endpoint legt Stammeintrag + Sourcing-Muster in einer Transaktion an.

**Tech Stack:** Express 5 + better-sqlite3 (Backend), React 19 + TanStack Query + Tailwind v4 (Frontend), Vitest + supertest (Backend-Tests).

**Spec:** `docs/superpowers/specs/2026-06-08-amazon-hersteller-bereich-design.md`

**Reihenfolge:** Phase A (Tasks A1–A5) zuerst — eigenständig nutzbar. Dann Phase B (Tasks B1–B3).

---

## File Structure

**Phase A**
- Create `backend/src/db/migrations/077_amazon_manufacturers.sql` — zwei Tabellen.
- Create `backend/src/routes/amazon.manufacturers.routes.ts` — CRUD Hersteller + Angebote.
- Modify `backend/src/app.ts` — Route importieren + mounten.
- Create `backend/test/integration.amazon_manufacturers.test.ts` — Routen-Tests.
- Modify `frontend/src/api/amazon.api.ts` — Typen + API-Funktionen.
- Create `frontend/src/hooks/amazon/useManufacturers.ts` — Query + Mutationen.
- Create `frontend/src/components/amazon/manufacturers/ManufacturersSection.tsx` — Sektion.
- Create `frontend/src/components/amazon/manufacturers/ManufacturerCard.tsx` — Stammdaten + Angebote je Hersteller.
- Create `frontend/src/components/amazon/manufacturers/ManufacturerOffers.tsx` — Angebots-Liste.
- Create `frontend/src/components/amazon/manufacturers/ManufacturerComparison.tsx` — Vergleichstabelle.
- Modify `frontend/src/hooks/amazon/useDetailSectionOrder.ts` — `'manufacturers'` ergänzen.
- Modify `frontend/src/pages/amazon/AmazonProductDetailPage.tsx` — Sektion rendern.

**Phase B**
- Create `backend/src/db/migrations/078_amazon_usp_manufacturer_link.sql` — Link-Spalte.
- Modify `backend/src/routes/amazon.usp.routes.ts` — Übernehmen-Route; `manufacturer_id` im Payload.
- Modify `backend/test/integration.amazon_usp.test.ts` — Übernehmen-Tests.
- Modify `frontend/src/api/amazon.api.ts` — `uebernehmeUspManufacturer` + `UspManufacturer.manufacturer_id`.
- Modify `frontend/src/hooks/amazon/useUsp.ts` — `useUebernehmeUspManufacturer`.
- Modify `frontend/src/components/amazon/usp/UspManufacturers.tsx` — Button + Zustand.

---

# PHASE A

### Task A1: Migration 077 — Tabellen

**Files:**
- Create: `backend/src/db/migrations/077_amazon_manufacturers.sql`

- [ ] **Step 1: Migration schreiben**

Inhalt von `backend/src/db/migrations/077_amazon_manufacturers.sql`:
```sql
CREATE TABLE amazon_manufacturers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id      INTEGER NOT NULL REFERENCES amazon_products(id),
  sort_order      INTEGER NOT NULL DEFAULT 0,
  name            TEXT    NOT NULL DEFAULT '',
  ansprechpartner TEXT,
  adresse         TEXT,
  email           TEXT,
  webseite        TEXT,
  notizen         TEXT,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE amazon_manufacturer_offers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  manufacturer_id INTEGER NOT NULL REFERENCES amazon_manufacturers(id),
  sort_order      INTEGER NOT NULL DEFAULT 0,
  menge_variante  TEXT,
  preis           TEXT,
  moq             TEXT,
  lieferzeit      TEXT,
  datum           TEXT,
  notiz           TEXT,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
);
```
Kein `PRAGMA foreign_keys` in der Migration (wird zentral in migrate.ts gesteuert).

- [ ] **Step 2: Commit**
```bash
git add backend/src/db/migrations/077_amazon_manufacturers.sql
git commit -m "feat(amazon-hersteller): Migration 077 — Hersteller + Angebote Tabellen"
```
(Die Migration wird in Task A2 durch die Tests via `createTestDb` angewendet; lokal greift sie beim nächsten Backend-Start.)

---

### Task A2: Backend-Routen + Mount (TDD)

**Files:**
- Create: `backend/src/routes/amazon.manufacturers.routes.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/test/integration.amazon_manufacturers.test.ts`

- [ ] **Step 1: Failing-Tests schreiben** — Inhalt von `backend/test/integration.amazon_manufacturers.test.ts`:

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
  const routes = (await import('../src/routes/amazon.manufacturers.routes')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/amazon', routes);
  return app;
}

function makeProduct(db: Database.Database, name = 'P'): number {
  db.prepare(`INSERT INTO amazon_products (name) VALUES (?)`).run(name);
  return Number((db.prepare(`SELECT last_insert_rowid() AS id`).get() as { id: number }).id);
}

describe('Amazon Hersteller — CRUD', () => {
  let db: Database.Database; let app: express.Express;
  beforeEach(async () => { db = createTestDb(); app = await makeApp(db); });

  it('GET leere Liste; 404 unbekanntes Produkt', async () => {
    const pid = makeProduct(db);
    const r = await request(app).get(`/api/amazon/products/${pid}/manufacturers`);
    expect(r.status).toBe(200);
    expect(r.body.manufacturers).toEqual([]);
    expect((await request(app).get('/api/amazon/products/9999/manufacturers')).status).toBe(404);
  });

  it('Hersteller anlegen, patchen (trim, leer->null), Angebote enthalten', async () => {
    const pid = makeProduct(db);
    const c = await request(app).post(`/api/amazon/products/${pid}/manufacturers`).send({ name: 'Acme' });
    expect(c.status).toBe(201);
    expect(c.body.manufacturer).toMatchObject({ name: 'Acme', sort_order: 1 });
    expect(c.body.manufacturer.offers).toEqual([]);
    const mId = c.body.manufacturer.id;
    const p = await request(app).patch(`/api/amazon/products/${pid}/manufacturers/${mId}`)
      .send({ ansprechpartner: '  Herr X ', adresse: '', email: 'a@b.de' });
    expect(p.status).toBe(200);
    expect(p.body.manufacturer).toMatchObject({ ansprechpartner: 'Herr X', adresse: null, email: 'a@b.de' });
  });

  it('Angebot-CRUD + im GET eingebettet', async () => {
    const pid = makeProduct(db);
    const mId = (await request(app).post(`/api/amazon/products/${pid}/manufacturers`).send({ name: 'Acme' })).body.manufacturer.id;
    const o = await request(app).post(`/api/amazon/products/${pid}/manufacturers/${mId}/offers`).send({});
    expect(o.status).toBe(201);
    const oId = o.body.offer.id;
    const up = await request(app).patch(`/api/amazon/products/${pid}/manufacturers/${mId}/offers/${oId}`)
      .send({ preis: '12,50 €', menge_variante: '500 Stk', moq: '300' });
    expect(up.status).toBe(200);
    expect(up.body.offer).toMatchObject({ preis: '12,50 €', menge_variante: '500 Stk', moq: '300' });
    const list = await request(app).get(`/api/amazon/products/${pid}/manufacturers`);
    expect(list.body.manufacturers[0].offers.map((x: { id: number }) => x.id)).toEqual([oId]);
    const del = await request(app).delete(`/api/amazon/products/${pid}/manufacturers/${mId}/offers/${oId}`);
    expect(del.status).toBe(204);
    expect((await request(app).get(`/api/amazon/products/${pid}/manufacturers`)).body.manufacturers[0].offers).toEqual([]);
  });

  it('Hersteller löschen entfernt seine Angebote', async () => {
    const pid = makeProduct(db);
    const mId = (await request(app).post(`/api/amazon/products/${pid}/manufacturers`).send({ name: 'Acme' })).body.manufacturer.id;
    await request(app).post(`/api/amazon/products/${pid}/manufacturers/${mId}/offers`).send({});
    expect((await request(app).delete(`/api/amazon/products/${pid}/manufacturers/${mId}`)).status).toBe(204);
    expect((db.prepare(`SELECT COUNT(*) AS c FROM amazon_manufacturer_offers WHERE manufacturer_id=?`).get(mId) as { c: number }).c).toBe(0);
    expect((await request(app).get(`/api/amazon/products/${pid}/manufacturers`)).body.manufacturers).toEqual([]);
  });

  it('Reorder Hersteller; fremde IDs -> 400', async () => {
    const pid = makeProduct(db);
    const a = (await request(app).post(`/api/amazon/products/${pid}/manufacturers`).send({ name: 'A' })).body.manufacturer.id;
    const b = (await request(app).post(`/api/amazon/products/${pid}/manufacturers`).send({ name: 'B' })).body.manufacturer.id;
    const ro = await request(app).patch(`/api/amazon/products/${pid}/manufacturers/reorder`).send({ order: [b, a] });
    expect(ro.status).toBe(200);
    expect((await request(app).get(`/api/amazon/products/${pid}/manufacturers`)).body.manufacturers.map((m: { id: number }) => m.id)).toEqual([b, a]);
    expect((await request(app).patch(`/api/amazon/products/${pid}/manufacturers/reorder`).send({ order: [99999] })).status).toBe(400);
  });

  it('Ownership: Hersteller/Angebot eines anderen Produkts -> 404', async () => {
    const pA = makeProduct(db, 'A'); const pB = makeProduct(db, 'B');
    const mA = (await request(app).post(`/api/amazon/products/${pA}/manufacturers`).send({ name: 'A' })).body.manufacturer.id;
    expect((await request(app).patch(`/api/amazon/products/${pB}/manufacturers/${mA}`).send({ name: 'X' })).status).toBe(404);
    expect((await request(app).post(`/api/amazon/products/${pB}/manufacturers/${mA}/offers`).send({})).status).toBe(404);
  });
});
```

- [ ] **Step 2: Tests laufen lassen — müssen fehlschlagen**

Run: `cd backend && npx vitest run test/integration.amazon_manufacturers.test.ts`
Expected: FAIL — Routen-Datei existiert noch nicht.

- [ ] **Step 3: Routen-Datei implementieren** — Inhalt von `backend/src/routes/amazon.manufacturers.routes.ts`:

```ts
import { Router, type Request, type Response } from 'express';
import db from '../db/connection';

const router = Router();
const MAX_TEXT_LEN = 2000;

function ensureProduct(id: number): boolean {
  return db.prepare(`SELECT 1 FROM amazon_products WHERE id = ?`).get(id) !== undefined;
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
  created_at: number; updated_at: number;
}

function loadManufacturer(productId: number, mId: number): ManufacturerRow | undefined {
  return db.prepare(`SELECT * FROM amazon_manufacturers WHERE id = ? AND product_id = ?`).get(mId, productId) as ManufacturerRow | undefined;
}
function loadOffers(mId: number): OfferRow[] {
  return db.prepare(`SELECT * FROM amazon_manufacturer_offers WHERE manufacturer_id = ? ORDER BY sort_order, id`).all(mId) as OfferRow[];
}
function loadOffer(mId: number, oId: number): OfferRow | undefined {
  return db.prepare(`SELECT * FROM amazon_manufacturer_offers WHERE id = ? AND manufacturer_id = ?`).get(oId, mId) as OfferRow | undefined;
}
function withOffers(m: ManufacturerRow) {
  return { ...m, offers: loadOffers(m.id) };
}
// Text normalisieren: undefined => "nicht setzen"; null/'' => null; sonst getrimmt (max len)
function normText(raw: unknown): { skip: true } | { skip: false; value: string | null } | { error: true } {
  if (raw === undefined) return { skip: true };
  if (raw === null) return { skip: false, value: null };
  if (typeof raw !== 'string') return { error: true };
  const t = raw.trim();
  if (t.length === 0) return { skip: false, value: null };
  if (t.length > MAX_TEXT_LEN) return { error: true };
  return { skip: false, value: t };
}

// GET Liste
router.get('/products/:id/manufacturers', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) { res.status(404).json({ error: 'product not found' }); return; }
  const rows = db.prepare(`SELECT * FROM amazon_manufacturers WHERE product_id = ? ORDER BY sort_order, id`).all(id) as ManufacturerRow[];
  res.json({ manufacturers: rows.map(withOffers) });
});

// Hersteller anlegen
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

// Hersteller patchen
router.patch('/products/:id/manufacturers/:mId', (req: Request, res: Response) => {
  const id = Number(req.params.id); const mId = Number(req.params.mId);
  if (!Number.isInteger(id) || !Number.isInteger(mId)) { res.status(404).json({ error: 'not found' }); return; }
  if (!ensureProduct(id) || !loadManufacturer(id, mId)) { res.status(404).json({ error: 'not found' }); return; }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const sets: string[] = []; const vals: unknown[] = [];
  // name: Sonderfall (NOT NULL, leer => '')
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim().length > MAX_TEXT_LEN) { res.status(400).json({ error: 'invalid name' }); return; }
    sets.push('name = ?'); vals.push(body.name.trim());
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

// Hersteller löschen (+ Angebote; USP-Verknüpfung lösen)
router.delete('/products/:id/manufacturers/:mId', (req: Request, res: Response) => {
  const id = Number(req.params.id); const mId = Number(req.params.mId);
  if (!Number.isInteger(id) || !Number.isInteger(mId) || !ensureProduct(id) || !loadManufacturer(id, mId)) { res.status(404).json({ error: 'not found' }); return; }
  db.transaction(() => {
    db.prepare(`DELETE FROM amazon_manufacturer_offers WHERE manufacturer_id = ?`).run(mId);
    // USP-Verknüpfungen lösen, falls die Tabelle/Spalte existiert (Phase B); defensiv per try
    try { db.prepare(`UPDATE amazon_usp_manufacturers SET manufacturer_id = NULL WHERE manufacturer_id = ?`).run(mId); } catch { /* Spalte evtl. noch nicht da (Phase A) */ }
    db.prepare(`DELETE FROM amazon_manufacturers WHERE id = ?`).run(mId);
  })();
  res.status(204).end();
});

// Hersteller reorder
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

// Angebot anlegen
router.post('/products/:id/manufacturers/:mId/offers', (req: Request, res: Response) => {
  const id = Number(req.params.id); const mId = Number(req.params.mId);
  if (!Number.isInteger(id) || !Number.isInteger(mId) || !ensureProduct(id) || !loadManufacturer(id, mId)) { res.status(404).json({ error: 'not found' }); return; }
  const maxOrder = (db.prepare(`SELECT COALESCE(MAX(sort_order),0) AS m FROM amazon_manufacturer_offers WHERE manufacturer_id = ?`).get(mId) as { m: number }).m;
  const r = db.prepare(`INSERT INTO amazon_manufacturer_offers (manufacturer_id, sort_order) VALUES (?, ?)`).run(mId, maxOrder + 1);
  res.status(201).json({ offer: db.prepare(`SELECT * FROM amazon_manufacturer_offers WHERE id = ?`).get(r.lastInsertRowid) as OfferRow });
});

// Angebot patchen
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
  if (sets.length === 0) { res.json({ offer: loadOffer(mId, oId) as OfferRow }); return; }
  sets.push('updated_at = unixepoch()');
  db.prepare(`UPDATE amazon_manufacturer_offers SET ${sets.join(', ')} WHERE id = ?`).run(...vals, oId);
  res.json({ offer: loadOffer(mId, oId) as OfferRow });
});

// Angebot löschen
router.delete('/products/:id/manufacturers/:mId/offers/:oId', (req: Request, res: Response) => {
  const id = Number(req.params.id); const mId = Number(req.params.mId); const oId = Number(req.params.oId);
  if (![id, mId, oId].every(Number.isInteger) || !ensureProduct(id) || !loadManufacturer(id, mId) || !loadOffer(mId, oId)) { res.status(404).json({ error: 'not found' }); return; }
  db.prepare(`DELETE FROM amazon_manufacturer_offers WHERE id = ?`).run(oId);
  res.status(204).end();
});

// Angebote reorder
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

export default router;
```

Wichtig zur Routen-Reihenfolge: `/manufacturers/reorder` (PATCH) und `/manufacturers/:mId` (PATCH) sind in Express 5 unterschiedliche Pfade — kein Konflikt. `reorder` steht oben definiert; das ist ok.

- [ ] **Step 4: Route in `backend/src/app.ts` mounten**

a) Bei den anderen Amazon-Imports (nach Zeile 27 `import amazonUspRoutes ...`) ergänzen:
```ts
import amazonManufacturersRoutes from './routes/amazon.manufacturers.routes';
```
b) Bei den Mounts (nach Zeile 75 `app.use('/api/amazon', amazonUspRoutes);`) ergänzen:
```ts
  app.use('/api/amazon', amazonManufacturersRoutes);
```

- [ ] **Step 5: Tests laufen lassen — müssen grün sein**

Run: `cd backend && npx vitest run test/integration.amazon_manufacturers.test.ts`
Expected: 6 passing.

- [ ] **Step 6: Volle Suite (keine Regression)**

Run: `cd backend && npx vitest run`
Expected: alle grün.

- [ ] **Step 7: Commit**
```bash
git add backend/src/routes/amazon.manufacturers.routes.ts backend/src/app.ts backend/test/integration.amazon_manufacturers.test.ts
git commit -m "feat(amazon-hersteller): Backend-Routen Hersteller + Angebote"
```

---

### Task A3: Frontend API-Typen + Funktionen

**Files:**
- Modify: `frontend/src/api/amazon.api.ts` (am Ende anhängen, nach den USP/Brand-Funktionen)

- [ ] **Step 1: Typen + Funktionen ergänzen** — am Ende von `frontend/src/api/amazon.api.ts` anhängen:

```ts
// ===== Amazon Hersteller =====
export interface ManufacturerOffer {
  id: number; manufacturer_id: number; sort_order: number;
  menge_variante: string | null; preis: string | null; moq: string | null;
  lieferzeit: string | null; datum: string | null; notiz: string | null;
  created_at: number; updated_at: number;
}
export interface Manufacturer {
  id: number; product_id: number; sort_order: number; name: string;
  ansprechpartner: string | null; adresse: string | null; email: string | null;
  webseite: string | null; notizen: string | null; created_at: number; updated_at: number;
  offers: ManufacturerOffer[];
}
export interface ManufacturersPayload { manufacturers: Manufacturer[]; }
export type ManufacturerPatch = Partial<Pick<Manufacturer, 'name' | 'ansprechpartner' | 'adresse' | 'email' | 'webseite' | 'notizen'>>;
export type OfferPatch = Partial<Pick<ManufacturerOffer, 'menge_variante' | 'preis' | 'moq' | 'lieferzeit' | 'datum' | 'notiz'>>;

export async function fetchManufacturers(productId: number): Promise<ManufacturersPayload> {
  return (await apiClient.get(`/amazon/products/${productId}/manufacturers`)).data as ManufacturersPayload;
}
export async function createManufacturer(productId: number, name?: string): Promise<Manufacturer> {
  return ((await apiClient.post(`/amazon/products/${productId}/manufacturers`, name !== undefined ? { name } : {})).data as { manufacturer: Manufacturer }).manufacturer;
}
export async function updateManufacturer(productId: number, mId: number, patch: ManufacturerPatch): Promise<Manufacturer> {
  return ((await apiClient.patch(`/amazon/products/${productId}/manufacturers/${mId}`, patch)).data as { manufacturer: Manufacturer }).manufacturer;
}
export async function deleteManufacturer(productId: number, mId: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${productId}/manufacturers/${mId}`);
}
export async function reorderManufacturers(productId: number, order: number[]): Promise<void> {
  await apiClient.patch(`/amazon/products/${productId}/manufacturers/reorder`, { order });
}
export async function createOffer(productId: number, mId: number): Promise<ManufacturerOffer> {
  return ((await apiClient.post(`/amazon/products/${productId}/manufacturers/${mId}/offers`, {})).data as { offer: ManufacturerOffer }).offer;
}
export async function updateOffer(productId: number, mId: number, oId: number, patch: OfferPatch): Promise<ManufacturerOffer> {
  return ((await apiClient.patch(`/amazon/products/${productId}/manufacturers/${mId}/offers/${oId}`, patch)).data as { offer: ManufacturerOffer }).offer;
}
export async function deleteOffer(productId: number, mId: number, oId: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${productId}/manufacturers/${mId}/offers/${oId}`);
}
export async function reorderOffers(productId: number, mId: number, order: number[]): Promise<void> {
  await apiClient.patch(`/amazon/products/${productId}/manufacturers/${mId}/offers/reorder`, { order });
}
```
(`apiClient` ist der Default-Import oben in der Datei — bereits vorhanden.)

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**
```bash
git add frontend/src/api/amazon.api.ts
git commit -m "feat(amazon-hersteller): Frontend-API Typen + Funktionen"
```

---

### Task A4: Frontend-Hooks

**Files:**
- Create: `frontend/src/hooks/amazon/useManufacturers.ts`

- [ ] **Step 1: Hook-Datei schreiben** — Inhalt von `frontend/src/hooks/amazon/useManufacturers.ts`:

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  type ManufacturersPayload, type ManufacturerPatch, type OfferPatch,
  fetchManufacturers, createManufacturer, updateManufacturer, deleteManufacturer, reorderManufacturers,
  createOffer, updateOffer, deleteOffer, reorderOffers,
} from '../../api/amazon.api';

export const manufacturersKey = (productId: number) =>
  ['amazon', 'products', productId, 'manufacturers'] as const;

function useInval(productId: number) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: manufacturersKey(productId) });
}

export function useManufacturers(productId: number) {
  return useQuery({
    queryKey: manufacturersKey(productId),
    queryFn: () => fetchManufacturers(productId),
    enabled: Number.isInteger(productId) && productId > 0,
  });
}
export function useCreateManufacturer(productId: number) {
  const inval = useInval(productId);
  return useMutation({ mutationFn: (name?: string) => createManufacturer(productId, name), onSettled: inval });
}
export function useUpdateManufacturer(productId: number) {
  const inval = useInval(productId);
  return useMutation({ mutationFn: ({ mId, patch }: { mId: number; patch: ManufacturerPatch }) => updateManufacturer(productId, mId, patch), onSettled: inval });
}
export function useDeleteManufacturer(productId: number) {
  const inval = useInval(productId);
  return useMutation({ mutationFn: (mId: number) => deleteManufacturer(productId, mId), onSettled: inval });
}
export function useReorderManufacturers(productId: number) {
  const inval = useInval(productId);
  return useMutation({ mutationFn: (order: number[]) => reorderManufacturers(productId, order), onSettled: inval });
}
export function useCreateOffer(productId: number) {
  const inval = useInval(productId);
  return useMutation({ mutationFn: (mId: number) => createOffer(productId, mId), onSettled: inval });
}
export function useUpdateOffer(productId: number) {
  const inval = useInval(productId);
  return useMutation({ mutationFn: ({ mId, oId, patch }: { mId: number; oId: number; patch: OfferPatch }) => updateOffer(productId, mId, oId, patch), onSettled: inval });
}
export function useDeleteOffer(productId: number) {
  const inval = useInval(productId);
  return useMutation({ mutationFn: ({ mId, oId }: { mId: number; oId: number }) => deleteOffer(productId, mId, oId), onSettled: inval });
}
export function useReorderOffers(productId: number) {
  const inval = useInval(productId);
  return useMutation({ mutationFn: ({ mId, order }: { mId: number; order: number[] }) => reorderOffers(productId, mId, order), onSettled: inval });
}

// Preis bestmöglich in Zahl wandeln (für „günstigstes" hervorheben). Nicht parsebar -> null.
export function parsePreis(s: string | null | undefined): number | null {
  if (!s) return null;
  const cleaned = s.replace(/[^0-9.,]/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}
```

- [ ] **Step 2: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**
```bash
git add frontend/src/hooks/amazon/useManufacturers.ts
git commit -m "feat(amazon-hersteller): Frontend-Hooks Hersteller + Angebote"
```

---

### Task A5: Frontend-Sektion + Einhängen

**Files:**
- Create: `frontend/src/components/amazon/manufacturers/ManufacturerOffers.tsx`
- Create: `frontend/src/components/amazon/manufacturers/ManufacturerComparison.tsx`
- Create: `frontend/src/components/amazon/manufacturers/ManufacturerCard.tsx`
- Create: `frontend/src/components/amazon/manufacturers/ManufacturersSection.tsx`
- Modify: `frontend/src/hooks/amazon/useDetailSectionOrder.ts`
- Modify: `frontend/src/pages/amazon/AmazonProductDetailPage.tsx`

**Vorlagen zum Spiegeln (Stil/Token/Patterns — vorher lesen):**
`frontend/src/components/amazon/SourcingSection.tsx` (Sektion + SectionHeader), `frontend/src/components/amazon/usp/UspManufacturers.tsx` (Karten mit Inline-Edit), `frontend/src/components/amazon/usp/UspPointList.tsx` (Drag-Reorder via native Pointer-Events), `frontend/src/components/amazon/usp/UspFiles.tsx` + `DeleteUspFileDialog` (Lösch-Bestätigung).

- [ ] **Step 1: `ManufacturerOffers.tsx`** — Angebots-Liste je Hersteller.

Anforderungen (vollständig umsetzen, Stil aus den Vorlagen übernehmen, CSS-Variablen wie `var(--color-surface-container)` etc., echte Umlaute):
- Props: `{ productId: number; mId: number; offers: ManufacturerOffer[] }`.
- Hooks: `useCreateOffer`, `useUpdateOffer`, `useDeleteOffer` (aus `useManufacturers`).
- Pro Angebot eine Zeile mit Inline-Edit-Feldern (Pattern wie USP: lokaler State je Feld, `onBlur` → `update.mutate` nur wenn geändert): **Menge/Variante** (Text), **Preis** (Text), **MOQ** (Text), **Lieferzeit** (Text), **Datum** (Text-Input; einfaches Textfeld reicht, kein Date-Picker nötig), **Notiz** (Text). Felder kompakt nebeneinander/umbrechend (`flex flex-wrap gap-2`).
- Lösch-Button je Zeile **mit Bestätigung** (kleiner Confirm-Dialog wie `DeleteUspFileDialog` oder ein `window.confirm`-freier Inline-Confirm; Projektregel „Confirm vor Löschen" — KEIN direktes Löschen ohne Rückfrage). Du darfst einen einfachen Inline-Bestätigungszustand nutzen (Button wird zu „Wirklich löschen?").
- Button „Angebot hinzufügen" (`create.mutate(mId)`).
- Datei muss `import { type ManufacturerOffer } from '../../../api/amazon.api'` verwenden.

- [ ] **Step 2: `ManufacturerComparison.tsx`** — Vergleichstabelle.

Anforderungen:
- Props: `{ manufacturers: Manufacturer[] }`.
- Baut eine flache Liste aller Angebote: für jeden Hersteller jedes Angebot → `{ herstellerName, offer }`.
- Tabelle mit Spalten: **Hersteller · Menge/Variante · Preis · MOQ · Lieferzeit · Datum**.
- Sortierung: nach `parsePreis(offer.preis)` aufsteigend; Angebote ohne parsebaren Preis ans Ende.
- Die **günstigste** Zeile (kleinster geparster Preis) hervorheben (z. B. Hintergrund grünlich `rgba(52,211,153,0.18)` + grüner linker Rand). Wenn kein Angebot einen parsebaren Preis hat, nichts hervorheben.
- Leerer Zustand: Hinweistext „Noch keine Angebote erfasst." wenn gar keine Angebote existieren.
- Verwendet `parsePreis` aus `../../../hooks/amazon/useManufacturers` und `type Manufacturer` aus der API.

- [ ] **Step 3: `ManufacturerCard.tsx`** — ein Hersteller (Stammdaten + Angebote).

Anforderungen:
- Props: `{ productId: number; manufacturer: Manufacturer; dragHandleProps: React.HTMLAttributes<HTMLDivElement>; index: number; onRequestDelete: (m: Manufacturer) => void }`.
- Stammdaten-Inline-Edit (lokaler State je Feld, `onBlur` → `useUpdateManufacturer().mutate({ mId, patch })` nur bei Änderung): **Name** (oben, fett, größer), **Ansprechpartner**, **Adresse** (mehrzeiliges `textarea`), **E-Mail**, **Webseite**, **Notizen** (`textarea`).
- Drag-Handle (Nummer wie bei USP-Punkten) via `dragHandleProps`.
- Lösch-Button ruft `onRequestDelete(manufacturer)` (Bestätigung übernimmt die Sektion).
- Bettet `<ManufacturerOffers productId={productId} mId={manufacturer.id} offers={manufacturer.offers} />` ein.

- [ ] **Step 4: `ManufacturersSection.tsx`** — Sektion-Wrapper.

Anforderungen:
- Props: `{ productId: number }`.
- Lädt via `useManufacturers(productId)`; Lade-/Fehlerzustand wie in `SourcingSection`.
- `SectionHeader`/Rahmen analog `SourcingSection` (gleiche Tokens), Titel **„Hersteller"** mit passendem material-symbols-Icon (z. B. `factory`).
- Liste der `ManufacturerCard` mit **Drag-Reorder** (native Pointer-Events, Muster exakt aus `UspPointList.tsx` übernehmen: lokaler `order`-State, `down/enter/up`, `useReorderManufacturers().mutate(order, { onSettled: () => setOrder(null) })`).
- Lösch-Bestätigungsdialog auf Sektionsebene (State `pendingDelete: Manufacturer | null`; ein Dialog wie `DeleteUspFileDialog` mit Name; bei Bestätigung `useDeleteManufacturer().mutate(pendingDelete.id)`).
- Button „Hersteller hinzufügen" (`useCreateManufacturer().mutate(undefined)`).
- Unter der Liste die `<ManufacturerComparison manufacturers={data.manufacturers} />`.

- [ ] **Step 5: Sektion in `useDetailSectionOrder.ts` registrieren**

Ändere Zeile 4 von:
```ts
const DEFAULT_ORDER = ['sourcing', 'checklist', 'usp'] as const;
```
zu:
```ts
const DEFAULT_ORDER = ['sourcing', 'checklist', 'usp', 'manufacturers'] as const;
```
(Die `readOrder`-Merge-Logik ergänzt fehlende IDs automatisch ans Ende — gespeicherte Reihenfolgen bleiben gültig und bekommen `'manufacturers'` hinten angehängt.)

- [ ] **Step 6: In `AmazonProductDetailPage.tsx` rendern**

a) Import ergänzen (bei den anderen Section-Imports, nach Zeile 20):
```ts
import { ManufacturersSection } from '../../components/amazon/manufacturers/ManufacturersSection';
```
b) Im `DraggableSectionList` (Zeilen 253–257) den Render-Switch erweitern. Aus:
```tsx
            render: () => {
              if (id === 'sourcing') return <SourcingSection productId={product.id} />;
              if (id === 'usp') return <UspSection productId={product.id} productName={product.name} />;
              return <ChecklistSection productId={product.id} />;
            },
```
wird:
```tsx
            render: () => {
              if (id === 'sourcing') return <SourcingSection productId={product.id} />;
              if (id === 'usp') return <UspSection productId={product.id} productName={product.name} />;
              if (id === 'manufacturers') return <ManufacturersSection productId={product.id} />;
              return <ChecklistSection productId={product.id} />;
            },
```

- [ ] **Step 7: Typecheck + Build**

Run: `cd frontend && npx tsc --noEmit` → PASS
Run: `cd frontend && npx vite build` → PASS

- [ ] **Step 8: Commit**
```bash
git add frontend/src/components/amazon/manufacturers/ frontend/src/hooks/amazon/useDetailSectionOrder.ts frontend/src/pages/amazon/AmazonProductDetailPage.tsx
git commit -m "feat(amazon-hersteller): Sektion Hersteller (Karten, Angebote, Vergleich) + eingehaengt"
```

---

# PHASE B

### Task B1: Migration 078 + USP-Übernehmen-Route (TDD)

**Files:**
- Create: `backend/src/db/migrations/078_amazon_usp_manufacturer_link.sql`
- Modify: `backend/src/routes/amazon.usp.routes.ts`
- Test: `backend/test/integration.amazon_usp.test.ts` (neuer describe-Block am Ende)

- [ ] **Step 1: Migration schreiben** — `backend/src/db/migrations/078_amazon_usp_manufacturer_link.sql`:
```sql
ALTER TABLE amazon_usp_manufacturers
  ADD COLUMN manufacturer_id INTEGER REFERENCES amazon_manufacturers(id);
```

- [ ] **Step 2: Failing-Tests** — am Ende von `backend/test/integration.amazon_usp.test.ts` anhängen:

```ts
describe('USP API — In Hersteller übernehmen', () => {
  let db: Database.Database; let app: express.Express;
  beforeEach(async () => { db = createTestDb(); app = await makeApp(db); });

  async function makeUspMan(pid: number, name: string, ansprech?: string): Promise<number> {
    await request(app).get(`/api/amazon/products/${pid}/usp`);
    const c = await request(app).post(`/api/amazon/products/${pid}/usp/manufacturers`).send({ name });
    const mId = c.body.manufacturer.id;
    if (ansprech !== undefined) await request(app).patch(`/api/amazon/products/${pid}/usp/manufacturers/${mId}`).send({ ansprechpartner: ansprech });
    return mId;
  }

  it('übernehmen legt Stammeintrag + Sourcing-Muster an und verknüpft', async () => {
    const pid = makeProduct(db);
    const mId = await makeUspMan(pid, 'Acme', 'Herr X');
    const r = await request(app).post(`/api/amazon/products/${pid}/usp/manufacturers/${mId}/uebernehmen`).send({});
    expect(r.status).toBe(201);
    // Stammeintrag
    const stamm = db.prepare(`SELECT * FROM amazon_manufacturers WHERE product_id=?`).all(pid) as Array<{ id: number; name: string; ansprechpartner: string | null }>;
    expect(stamm).toHaveLength(1);
    expect(stamm[0]).toMatchObject({ name: 'Acme', ansprechpartner: 'Herr X' });
    // Verknüpfung gesetzt
    const link = db.prepare(`SELECT manufacturer_id FROM amazon_usp_manufacturers WHERE id=?`).get(mId) as { manufacturer_id: number | null };
    expect(link.manufacturer_id).toBe(stamm[0].id);
    // Sourcing-Muster
    const samples = db.prepare(`SELECT hersteller, notizen FROM amazon_sourcing_samples WHERE product_id=?`).all(pid) as Array<{ hersteller: string | null; notizen: string | null }>;
    expect(samples).toHaveLength(1);
    expect(samples[0].hersteller).toBe('Acme');
    expect(samples[0].notizen ?? '').toContain('Herr X');
  });

  it('zweiter Aufruf -> 409, nichts doppelt', async () => {
    const pid = makeProduct(db);
    const mId = await makeUspMan(pid, 'Acme', 'Herr X');
    await request(app).post(`/api/amazon/products/${pid}/usp/manufacturers/${mId}/uebernehmen`).send({});
    const r2 = await request(app).post(`/api/amazon/products/${pid}/usp/manufacturers/${mId}/uebernehmen`).send({});
    expect(r2.status).toBe(409);
    expect((db.prepare(`SELECT COUNT(*) AS c FROM amazon_manufacturers WHERE product_id=?`).get(pid) as { c: number }).c).toBe(1);
    expect((db.prepare(`SELECT COUNT(*) AS c FROM amazon_sourcing_samples WHERE product_id=?`).get(pid) as { c: number }).c).toBe(1);
  });

  it('übernehmen ohne Namen -> 400', async () => {
    const pid = makeProduct(db);
    const mId = await makeUspMan(pid, '');
    const r = await request(app).post(`/api/amazon/products/${pid}/usp/manufacturers/${mId}/uebernehmen`).send({});
    expect(r.status).toBe(400);
  });

  it('Stammeintrag löschen löst USP-Verknüpfung (manufacturer_id -> NULL)', async () => {
    const pid = makeProduct(db);
    const mId = await makeUspMan(pid, 'Acme', 'Herr X');
    await request(app).post(`/api/amazon/products/${pid}/usp/manufacturers/${mId}/uebernehmen`).send({});
    const stammId = (db.prepare(`SELECT id FROM amazon_manufacturers WHERE product_id=?`).get(pid) as { id: number }).id;
    expect((await request(app).delete(`/api/amazon/products/${pid}/manufacturers/${stammId}`)).status).toBe(204);
    const link = db.prepare(`SELECT manufacturer_id FROM amazon_usp_manufacturers WHERE id=?`).get(mId) as { manufacturer_id: number | null };
    expect(link.manufacturer_id).toBeNull();
  });

  it('GET USP liefert manufacturer_id der Hersteller', async () => {
    const pid = makeProduct(db);
    const mId = await makeUspMan(pid, 'Acme');
    await request(app).post(`/api/amazon/products/${pid}/usp/manufacturers/${mId}/uebernehmen`).send({});
    const usp = await request(app).get(`/api/amazon/products/${pid}/usp`);
    const man = (usp.body.manufacturers as Array<{ id: number; manufacturer_id: number | null }>).find(m => m.id === mId);
    expect(man?.manufacturer_id).not.toBeNull();
  });
});
```
Hinweis: Das letzte Test (`GET USP liefert manufacturer_id`) und das Lösch-Test brauchen, dass die Manufacturers-Routen im selben App-Objekt gemountet sind. Falls `makeApp` in dieser Test-Datei nur die USP-Routen mountet, ergänze in dieser Test-Datei eine lokale App, die **beide** Router mountet — ODER mounte in dem Test, der `DELETE /manufacturers/...` braucht, zusätzlich `amazon.manufacturers.routes`. Konkret: erweitere die `makeApp`-Hilfsfunktion dieser Test-Datei so, dass sie sowohl `amazon.usp.routes` als auch `amazon.manufacturers.routes` unter `/api/amazon` mountet. (Wenn die bestehende `makeApp` nur USP mountet, passe sie an: beide `app.use('/api/amazon', uspRouter)` und `app.use('/api/amazon', manufacturersRouter)`.)

- [ ] **Step 3: Tests laufen lassen — müssen fehlschlagen**

Run: `cd backend && npx vitest run test/integration.amazon_usp.test.ts -t "In Hersteller übernehmen"`
Expected: FAIL — Route + Spalte fehlen.

- [ ] **Step 4: Übernehmen-Route implementieren** — in `backend/src/routes/amazon.usp.routes.ts`.

a) Falls noch nicht vorhanden: Sicherstellen, dass der USP-Hersteller-Row-Typ (`ManufacturerRow`/wie auch immer er in dieser Datei heißt) das Feld `manufacturer_id: number | null` enthält bzw. `SELECT *` es ohnehin mitliefert (Frontend-Payload bekommt es automatisch).

b) Eine neue Route ergänzen (nach den bestehenden USP-Hersteller-Routen). Verwende die in der Datei vorhandenen Helfer `ensureProduct` und den Loader für einen einzelnen USP-Hersteller (heißt z. B. `loadManufacturerForProduct` / analog `loadPointForProduct`; falls nicht vorhanden, inline per SQL laden). Implementierung:

```ts
router.post('/products/:id/usp/manufacturers/:mId/uebernehmen', (req: Request, res: Response) => {
  const id = Number(req.params.id); const mId = Number(req.params.mId);
  if (!Number.isInteger(id) || !Number.isInteger(mId) || !ensureProduct(id)) { res.status(404).json({ error: 'not found' }); return; }
  const uspMan = db.prepare(`SELECT * FROM amazon_usp_manufacturers WHERE id = ? AND product_id = ?`).get(mId, id) as { id: number; name: string; ansprechpartner: string | null; manufacturer_id: number | null } | undefined;
  if (!uspMan) { res.status(404).json({ error: 'not found' }); return; }
  if (uspMan.manufacturer_id != null) { res.status(409).json({ error: 'bereits übernommen' }); return; }
  const name = (uspMan.name ?? '').trim();
  if (name.length === 0) { res.status(400).json({ error: 'kein name' }); return; }
  const ansprech = (uspMan.ansprechpartner ?? '').trim();

  const result = db.transaction(() => {
    // Stammeintrag
    const maxM = (db.prepare(`SELECT COALESCE(MAX(sort_order),0) AS m FROM amazon_manufacturers WHERE product_id = ?`).get(id) as { m: number }).m;
    const ins = db.prepare(`INSERT INTO amazon_manufacturers (product_id, sort_order, name, ansprechpartner) VALUES (?, ?, ?, ?)`).run(id, maxM + 1, name, ansprech || null);
    const newManId = Number(ins.lastInsertRowid);
    // Verknüpfung
    db.prepare(`UPDATE amazon_usp_manufacturers SET manufacturer_id = ?, updated_at = unixepoch() WHERE id = ?`).run(newManId, mId);
    // Sourcing sicherstellen + Muster
    const hasSourcing = db.prepare(`SELECT 1 FROM amazon_sourcing WHERE product_id = ?`).get(id);
    if (!hasSourcing) db.prepare(`INSERT INTO amazon_sourcing (product_id) VALUES (?)`).run(id);
    const maxS = (db.prepare(`SELECT COALESCE(MAX(sort_order),0) AS m FROM amazon_sourcing_samples WHERE product_id = ?`).get(id) as { m: number }).m;
    const notizen = ansprech ? `Ansprechpartner: ${ansprech}` : null;
    db.prepare(`INSERT INTO amazon_sourcing_samples (product_id, sort_order, hersteller, notizen) VALUES (?, ?, ?, ?)`).run(id, maxS + 1, name, notizen);
    return newManId;
  })();

  const manufacturer = db.prepare(`SELECT * FROM amazon_manufacturers WHERE id = ?`).get(result);
  res.status(201).json({ manufacturer, usp_manufacturer_id: mId, manufacturer_id: result });
});
```

Hinweis: Diese Datei importiert `db` bereits. `req`/`res`-Typen ebenso. Falls ein Längen-Limit für `name` in der Datei existiert, beachten (Name kommt aus bestehendem USP-Hersteller, ist also bereits begrenzt).

- [ ] **Step 5: Tests grün**

Run: `cd backend && npx vitest run test/integration.amazon_usp.test.ts -t "In Hersteller übernehmen"`
Expected: 5 passing.

- [ ] **Step 6: Volle Suite**

Run: `cd backend && npx vitest run`
Expected: alle grün.

- [ ] **Step 7: Commit**
```bash
git add backend/src/db/migrations/078_amazon_usp_manufacturer_link.sql backend/src/routes/amazon.usp.routes.ts backend/test/integration.amazon_usp.test.ts
git commit -m "feat(amazon-hersteller): USP 'In Hersteller uebernehmen' (Stammeintrag + Sourcing-Muster)"
```

---

### Task B2: Frontend-API + Hook für Übernehmen

**Files:**
- Modify: `frontend/src/api/amazon.api.ts`
- Modify: `frontend/src/hooks/amazon/useUsp.ts`

- [ ] **Step 1: API**

a) Den Typ `UspManufacturer` in `frontend/src/api/amazon.api.ts` um `manufacturer_id: number | null` erweitern (suche `interface UspManufacturer` und ergänze das Feld).

b) Funktion ergänzen (bei den anderen USP-Funktionen):
```ts
export async function uebernehmeUspManufacturer(productId: number, mId: number): Promise<{ manufacturer_id: number }> {
  return (await apiClient.post(`/amazon/products/${productId}/usp/manufacturers/${mId}/uebernehmen`, {})).data as { manufacturer_id: number };
}
```

- [ ] **Step 2: Hook** — in `frontend/src/hooks/amazon/useUsp.ts`:

a) `uebernehmeUspManufacturer` zum bestehenden Import aus `'../../api/amazon.api'` hinzufügen.
b) Den Manufacturers-Key importieren: `import { manufacturersKey } from './useManufacturers';` (neue Import-Zeile).
c) Hook ergänzen (invalidiert USP + Manufacturers + Sourcing):
```ts
export function useUebernehmeUspManufacturer(productId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mId: number) => uebernehmeUspManufacturer(productId, mId),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key(productId) });
      qc.invalidateQueries({ queryKey: manufacturersKey(productId) });
      qc.invalidateQueries({ queryKey: ['amazon', 'products', productId, 'sourcing'] });
    },
  });
}
```
(`key(productId)` ist der vorhandene USP-Query-Key-Helfer in dieser Datei; `useQueryClient`/`useMutation` sind bereits importiert.)

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**
```bash
git add frontend/src/api/amazon.api.ts frontend/src/hooks/amazon/useUsp.ts
git commit -m "feat(amazon-hersteller): Frontend-API + Hook fuer USP-Uebernehmen"
```

---

### Task B3: USP-Button „In Hersteller übernehmen"

**Files:**
- Modify: `frontend/src/components/amazon/usp/UspManufacturers.tsx`

- [ ] **Step 1: Button + Zustand** (vorher Datei lesen, Stil übernehmen)

Anforderungen:
- Import `useUebernehmeUspManufacturer` aus `'../../../hooks/amazon/useUsp'`.
- Pro USP-Hersteller-Karte einen Button:
  - `manufacturer.manufacturer_id != null` → Button zeigt **„✓ übernommen"**, deaktiviert (grünlicher Stil).
  - sonst, wenn `manufacturer.name.trim()` leer → Button **„In Hersteller übernehmen"** deaktiviert (Tooltip „erst Namen eingeben").
  - sonst aktiv → Klick `uebernehmen.mutate(manufacturer.id)`.
- Echte Umlaute; Stil/Token wie die übrigen Buttons in der Datei.

- [ ] **Step 2: Typecheck + Build**

Run: `cd frontend && npx tsc --noEmit` → PASS
Run: `cd frontend && npx vite build` → PASS

- [ ] **Step 3: Commit**
```bash
git add frontend/src/components/amazon/usp/UspManufacturers.tsx
git commit -m "feat(amazon-hersteller): USP-Button 'In Hersteller uebernehmen'"
```

---

## Manuelles UAT (nach allen Tasks)

1. Backend neu starten (Migrationen 077/078 anwenden): `pkill -f "tsx watch"`; `cd backend && npm run dev`; `curl http://localhost:3001/api/health`.
2. Produkt öffnen → neuer Bereich **Hersteller** am Ende (verschiebbar). Hersteller anlegen, Stammdaten + mehrere Angebote → Vergleichstabelle zeigt sie, günstigstes hervorgehoben.
3. Hersteller löschen (mit Bestätigung) → Hersteller + Angebote weg.
4. USP: Hersteller mit Name + Ansprechpartner → „In Hersteller übernehmen" → erscheint im Hersteller-Bereich **und** als Muster im Sourcing; Button zeigt „✓ übernommen"; zweiter Klick legt nichts doppelt an.
5. Übernommenen Stammeintrag löschen → USP-Button wieder aktiv.
```
