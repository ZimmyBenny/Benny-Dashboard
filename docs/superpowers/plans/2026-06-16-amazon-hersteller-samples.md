# Amazon „Samples pro Hersteller" — Implementierungs-Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein „Samples"-Bereich pro Hersteller (Fotos, Bezeichnung, Erhalten-Datum, Bewertung, Status, Favorit, Notizen, Mängel, Kosten) auf der Hersteller-Detailseite, unter „Angebote".

**Architecture:** Spiegelt die bestehenden Hersteller-Angebote (offers). Backend: 2 neue Tabellen + Erweiterung von `amazon.manufacturers.routes.ts` (Sample-CRUD + Foto-Routen) + Samples in die GET-Liste verschachteln. Frontend: `ManufacturerSamples`-Komponente (wie `ManufacturerOffers`) mit Foto-Upload (AirDrop/Drag/Cmd+V), Hooks in `useManufacturers.ts`, eingebunden in `ManufacturerDetailPage`.

**Tech Stack:** Express 5, better-sqlite3, multer, React 19, TanStack Query, native Pointer-Events DnD.

**Branch:** `feature/amazon-hersteller-samples` (aktiv). Migration: **085**.

---

## Dateien-Übersicht

**Backend:**
- Create: `backend/src/db/migrations/085_amazon_manufacturer_samples.sql`
- Modify: `backend/src/routes/amazon.manufacturers.routes.ts` (Sample-Helfer + CRUD + Foto-Routen + GET-Liste erweitern)
- Create: `backend/test/integration.amazon_manufacturer_samples.test.ts`

**Frontend:**
- Modify: `frontend/src/api/amazon.api.ts` (Typen + Funktionen + `Manufacturer.samples`)
- Modify: `frontend/src/hooks/amazon/useManufacturers.ts` (Sample-Hooks)
- Create: `frontend/src/components/amazon/manufacturers/ManufacturerSamples.tsx`
- Modify: `frontend/src/pages/amazon/ManufacturerDetailPage.tsx` (einbinden)

---

## Task 1: Migration 085 — Tabellen

**Files:** Create `backend/src/db/migrations/085_amazon_manufacturer_samples.sql`

- [ ] **Step 1: Migration schreiben**

```sql
-- Samples pro Hersteller (Muster + Fotos einer Charge)
CREATE TABLE amazon_manufacturer_samples (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  manufacturer_id INTEGER NOT NULL REFERENCES amazon_manufacturers(id),
  sort_order      INTEGER NOT NULL DEFAULT 0,
  bezeichnung     TEXT    NOT NULL DEFAULT '',
  received_date   TEXT,
  rating          INTEGER NOT NULL DEFAULT 0,
  status          TEXT    NOT NULL DEFAULT 'erhalten',
  is_favorite     INTEGER NOT NULL DEFAULT 0,
  notizen         TEXT,
  maengel         TEXT,
  kosten          TEXT,
  currency        TEXT    NOT NULL DEFAULT 'USD',
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE amazon_manufacturer_sample_photos (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  sample_id     INTEGER NOT NULL REFERENCES amazon_manufacturer_samples(id),
  sort_order    INTEGER NOT NULL DEFAULT 0,
  file_path     TEXT    NOT NULL,
  original_name TEXT,
  mime          TEXT,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_mfr_samples_manufacturer ON amazon_manufacturer_samples(manufacturer_id);
CREATE INDEX idx_mfr_sample_photos_sample ON amazon_manufacturer_sample_photos(sample_id);
```

Kein `PRAGMA foreign_keys` (zentral in migrate.ts).

- [ ] **Step 2: Anwenden + verifizieren** — Benny startet sein Backend neu (sein Terminal) ODER Migration läuft beim nächsten Boot. Prüfen:
`sqlite3 ~/.local/share/benny-dashboard/dashboard.db "SELECT name FROM sqlite_master WHERE name LIKE 'amazon_manufacturer_sample%';"`
Expected: `amazon_manufacturer_sample_photos`, `amazon_manufacturer_samples`.

- [ ] **Step 3: Commit**
```bash
git add backend/src/db/migrations/085_amazon_manufacturer_samples.sql
git commit -m "feat(amazon-samples): Migration 085 — Hersteller-Samples + Fotos"
```

---

## Task 2: Backend — Sample-CRUD + GET-Liste erweitern

**Files:** Modify `backend/src/routes/amazon.manufacturers.routes.ts`; Test `backend/test/integration.amazon_manufacturer_samples.test.ts`

Vorhandene Helfer wiederverwenden: `ensureProduct`, `loadManufacturer`, `normText`, `db`, `OFFER_FILES_DIR`-Muster.

- [ ] **Step 1: Typen + Helfer ergänzen** (oben bei den anderen Interfaces/Helfern)

```ts
interface SampleRow {
  id: number; manufacturer_id: number; sort_order: number;
  bezeichnung: string; received_date: string | null; rating: number;
  status: string; is_favorite: number;
  notizen: string | null; maengel: string | null; kosten: string | null; currency: string;
  created_at: number; updated_at: number;
}
interface SamplePhotoRow { id: number; sample_id: number; sort_order: number; file_path: string; original_name: string | null; mime: string | null; created_at: number; }

function loadSamples(mId: number): SampleRow[] {
  return db.prepare(`SELECT * FROM amazon_manufacturer_samples WHERE manufacturer_id = ? ORDER BY sort_order, id`).all(mId) as SampleRow[];
}
function loadSample(mId: number, sId: number): SampleRow | undefined {
  return db.prepare(`SELECT * FROM amazon_manufacturer_samples WHERE id = ? AND manufacturer_id = ?`).get(sId, mId) as SampleRow | undefined;
}
function loadSamplePhotos(sampleId: number): SamplePhotoRow[] {
  return db.prepare(`SELECT * FROM amazon_manufacturer_sample_photos WHERE sample_id = ? ORDER BY sort_order, id`).all(sampleId) as SamplePhotoRow[];
}
function loadSamplePhoto(sampleId: number, photoId: number): SamplePhotoRow | undefined {
  return db.prepare(`SELECT * FROM amazon_manufacturer_sample_photos WHERE id = ? AND sample_id = ?`).get(photoId, sampleId) as SamplePhotoRow | undefined;
}
function samplesWithPhotos(mId: number) {
  return loadSamples(mId).map(s => ({ ...s, photos: loadSamplePhotos(s.id) }));
}
const SAMPLE_STATUS = new Set(['angefragt', 'bestellt', 'erhalten', 'abgelehnt']);
```

- [ ] **Step 2: Samples in die GET-Liste verschachteln**

In der bestehenden GET-Route `/products/:id/manufacturers` wird jeder Hersteller mit `offers` (inkl. files) angereichert. Dort `samples` analog ergänzen — finde die Stelle, wo das Ergebnis pro Hersteller gebaut wird (Muster `offers: ...`) und füge hinzu:
```ts
      samples: samplesWithPhotos(m.id),
```
(falls die Route ein gemapptes Objekt baut: `{ ...m, offers: ..., samples: samplesWithPhotos(m.id) }`).

- [ ] **Step 3: Sample-CRUD-Routen ergänzen** (vor `export default router`)

```ts
// POST create
router.post('/products/:id/manufacturers/:mId/samples', (req: Request, res: Response) => {
  const id = Number(req.params.id); const mId = Number(req.params.mId);
  if (![id, mId].every(Number.isInteger) || !ensureProduct(id) || !loadManufacturer(id, mId)) { res.status(404).json({ error: 'not found' }); return; }
  const maxOrder = (db.prepare(`SELECT COALESCE(MAX(sort_order),0) AS m FROM amazon_manufacturer_samples WHERE manufacturer_id = ?`).get(mId) as { m: number }).m;
  const r = db.prepare(`INSERT INTO amazon_manufacturer_samples (manufacturer_id, sort_order) VALUES (?, ?)`).run(mId, maxOrder + 1);
  const s = db.prepare(`SELECT * FROM amazon_manufacturer_samples WHERE id = ?`).get(r.lastInsertRowid) as SampleRow;
  res.status(201).json({ sample: { ...s, photos: [] } });
});

// PATCH reorder (vor :sId-Route mounten, damit 'reorder' nicht als sId gilt)
router.patch('/products/:id/manufacturers/:mId/samples/reorder', (req: Request, res: Response) => {
  const id = Number(req.params.id); const mId = Number(req.params.mId);
  if (![id, mId].every(Number.isInteger) || !ensureProduct(id) || !loadManufacturer(id, mId)) { res.status(404).json({ error: 'not found' }); return; }
  const order = (req.body as { order?: unknown })?.order;
  if (!Array.isArray(order) || order.some(x => !Number.isInteger(x))) { res.status(400).json({ error: 'invalid order' }); return; }
  const own = new Set(loadSamples(mId).map(s => s.id));
  if (order.length !== own.size || order.some((x: number) => !own.has(x))) { res.status(400).json({ error: 'order mismatch' }); return; }
  const upd = db.prepare(`UPDATE amazon_manufacturer_samples SET sort_order = ? WHERE id = ?`);
  db.transaction(() => { order.forEach((sid: number, idx: number) => upd.run(idx + 1, sid)); })();
  res.json({ samples: samplesWithPhotos(mId) });
});

// PATCH update
router.patch('/products/:id/manufacturers/:mId/samples/:sId', (req: Request, res: Response) => {
  const id = Number(req.params.id); const mId = Number(req.params.mId); const sId = Number(req.params.sId);
  if (![id, mId, sId].every(Number.isInteger) || !ensureProduct(id) || !loadManufacturer(id, mId) || !loadSample(mId, sId)) { res.status(404).json({ error: 'not found' }); return; }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const sets: string[] = []; const vals: unknown[] = [];
  for (const field of ['bezeichnung', 'received_date', 'notizen', 'maengel', 'kosten'] as const) {
    if (field in body) {
      const n = normText(body[field]);
      if ('error' in n) { res.status(400).json({ error: `invalid ${field}` }); return; }
      if (!n.skip) { sets.push(`${field} = ?`); vals.push(n.value); }
    }
  }
  if (body.currency !== undefined) {
    if (body.currency !== 'USD' && body.currency !== 'EUR') { res.status(400).json({ error: 'invalid currency' }); return; }
    sets.push('currency = ?'); vals.push(body.currency);
  }
  if (body.status !== undefined) {
    if (typeof body.status !== 'string' || !SAMPLE_STATUS.has(body.status)) { res.status(400).json({ error: 'invalid status' }); return; }
    sets.push('status = ?'); vals.push(body.status);
  }
  if (body.rating !== undefined) {
    const rt = Number(body.rating);
    if (!Number.isInteger(rt) || rt < 0 || rt > 5) { res.status(400).json({ error: 'invalid rating' }); return; }
    sets.push('rating = ?'); vals.push(rt);
  }
  if (body.is_favorite !== undefined) {
    if (body.is_favorite !== 0 && body.is_favorite !== 1) { res.status(400).json({ error: 'invalid is_favorite' }); return; }
    sets.push('is_favorite = ?'); vals.push(body.is_favorite);
  }
  if (sets.length === 0) { res.json({ sample: { ...(loadSample(mId, sId) as SampleRow), photos: loadSamplePhotos(sId) } }); return; }
  sets.push('updated_at = unixepoch()');
  db.prepare(`UPDATE amazon_manufacturer_samples SET ${sets.join(', ')} WHERE id = ?`).run(...vals, sId);
  res.json({ sample: { ...(loadSample(mId, sId) as SampleRow), photos: loadSamplePhotos(sId) } });
});

// DELETE
router.delete('/products/:id/manufacturers/:mId/samples/:sId', (req: Request, res: Response) => {
  const id = Number(req.params.id); const mId = Number(req.params.mId); const sId = Number(req.params.sId);
  if (![id, mId, sId].every(Number.isInteger) || !ensureProduct(id) || !loadManufacturer(id, mId) || !loadSample(mId, sId)) { res.status(404).json({ error: 'not found' }); return; }
  const photos = loadSamplePhotos(sId);
  db.transaction(() => {
    db.prepare(`DELETE FROM amazon_manufacturer_sample_photos WHERE sample_id = ?`).run(sId);
    db.prepare(`DELETE FROM amazon_manufacturer_samples WHERE id = ?`).run(sId);
  })();
  photos.forEach(p => deleteSamplePhotoFromDisk(p.file_path)); // aus Task 3
  res.status(204).end();
});
```

- [ ] **Step 4: Test schreiben** `backend/test/integration.amazon_manufacturer_samples.test.ts`

Setup wie `integration.amazon_manufacturers.test.ts` (createTestDb + Connection-Mock + Route mounten). Muster:
```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type Database from 'better-sqlite3';
import { createTestDb } from './setup';

vi.mock('../src/db/connection', () => { const mod: { default: Database.Database | null } = { default: null }; return mod; });

async function makeApp(db: Database.Database) {
  const conn = await import('../src/db/connection');
  // @ts-expect-error test injection
  conn.default = db;
  const routes = (await import('../src/routes/amazon.manufacturers.routes')).default;
  const app = express(); app.use(express.json()); app.use('/api/amazon', routes);
  return app;
}
function makeProductAndManufacturer(db: Database.Database): { pid: number; mId: number } {
  db.prepare(`INSERT INTO amazon_products (name) VALUES ('P')`).run();
  const pid = Number((db.prepare(`SELECT last_insert_rowid() AS id`).get() as { id: number }).id);
  db.prepare(`INSERT INTO amazon_manufacturers (product_id, name) VALUES (?, 'M')`).run(pid);
  const mId = Number((db.prepare(`SELECT last_insert_rowid() AS id`).get() as { id: number }).id);
  return { pid, mId };
}

describe('Manufacturer Samples API', () => {
  let db: Database.Database; let app: express.Express;
  beforeEach(async () => { db = createTestDb(); app = await makeApp(db); });

  it('legt Sample an, patcht Felder, liest verschachtelt in der Hersteller-Liste', async () => {
    const { pid, mId } = makeProductAndManufacturer(db);
    const c = await request(app).post(`/api/amazon/products/${pid}/manufacturers/${mId}/samples`).send({});
    expect(c.status).toBe(201);
    const sId = c.body.sample.id;
    expect(c.body.sample.photos).toEqual([]);

    await request(app).patch(`/api/amazon/products/${pid}/manufacturers/${mId}/samples/${sId}`)
      .send({ bezeichnung: 'Charge A', rating: 4, status: 'erhalten', is_favorite: 1, kosten: '40,23', currency: 'USD', maengel: 'Stangendicke' }).expect(200);

    const list = await request(app).get(`/api/amazon/products/${pid}/manufacturers`);
    expect(list.status).toBe(200);
    const m = list.body.manufacturers.find((x: { id: number }) => x.id === mId);
    expect(m.samples[0].bezeichnung).toBe('Charge A');
    expect(m.samples[0].rating).toBe(4);
    expect(m.samples[0].is_favorite).toBe(1);
  });

  it('weist ungültigen Status/Rating ab', async () => {
    const { pid, mId } = makeProductAndManufacturer(db);
    const sId = (await request(app).post(`/api/amazon/products/${pid}/manufacturers/${mId}/samples`).send({})).body.sample.id;
    await request(app).patch(`/api/amazon/products/${pid}/manufacturers/${mId}/samples/${sId}`).send({ status: 'xxx' }).expect(400);
    await request(app).patch(`/api/amazon/products/${pid}/manufacturers/${mId}/samples/${sId}`).send({ rating: 9 }).expect(400);
  });

  it('löscht Sample', async () => {
    const { pid, mId } = makeProductAndManufacturer(db);
    const sId = (await request(app).post(`/api/amazon/products/${pid}/manufacturers/${mId}/samples`).send({})).body.sample.id;
    await request(app).delete(`/api/amazon/products/${pid}/manufacturers/${mId}/samples/${sId}`).expect(204);
    expect((db.prepare(`SELECT COUNT(*) AS c FROM amazon_manufacturer_samples`).get() as { c: number }).c).toBe(0);
  });
});
```

- [ ] **Step 5: Test rot → grün** (Foto-Routen + `deleteSamplePhotoFromDisk` kommen in Task 3; bis dahin Delete-Test ohne Fotos grün). `npm --prefix backend test -- integration.amazon_manufacturer_samples`

- [ ] **Step 6: Commit**
```bash
git add backend/src/routes/amazon.manufacturers.routes.ts backend/test/integration.amazon_manufacturer_samples.test.ts
git commit -m "feat(amazon-samples): Backend Sample-CRUD + in Hersteller-Liste verschachtelt + Tests"
```

---

## Task 3: Backend — Sample-Fotos

**Files:** Modify `backend/src/routes/amazon.manufacturers.routes.ts`

- [ ] **Step 1: Foto-Speicher + Disk-Helfer ergänzen** (bei den anderen multer-Setups oben)

```ts
const SAMPLE_PHOTOS_DIR = path.join(os.homedir(), '.local', 'share', 'benny-dashboard', 'amazon-manufacturer-sample-photos');
if (!fs.existsSync(SAMPLE_PHOTOS_DIR)) fs.mkdirSync(SAMPLE_PHOTOS_DIR, { recursive: true });
const samplePhotoUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, SAMPLE_PHOTOS_DIR),
    filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname) || ''}`),
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
});
function deleteSamplePhotoFromDisk(filename: string | null | undefined) {
  if (!filename) return;
  const abs = path.resolve(SAMPLE_PHOTOS_DIR, filename);
  if (!abs.startsWith(path.resolve(SAMPLE_PHOTOS_DIR) + path.sep)) return;
  try { fs.unlinkSync(abs); } catch { /* schon weg */ }
}
```

- [ ] **Step 2: Foto-Routen ergänzen**

```ts
router.post('/products/:id/manufacturers/:mId/samples/:sId/photos', (req: Request, res: Response) => {
  const id = Number(req.params.id); const mId = Number(req.params.mId); const sId = Number(req.params.sId);
  if (![id, mId, sId].every(Number.isInteger) || !ensureProduct(id) || !loadManufacturer(id, mId) || !loadSample(mId, sId)) { res.status(404).json({ error: 'not found' }); return; }
  samplePhotoUpload.single('file')(req, res, (err: unknown) => {
    if (err) { res.status(400).json({ error: err instanceof Error ? err.message : 'upload failed' }); return; }
    const file = (req as Request & { file?: { filename: string; originalname: string; mimetype: string } }).file;
    if (!file) { res.status(400).json({ error: 'no file' }); return; }
    const maxOrder = (db.prepare(`SELECT COALESCE(MAX(sort_order),0) AS m FROM amazon_manufacturer_sample_photos WHERE sample_id = ?`).get(sId) as { m: number }).m;
    const r = db.prepare(`INSERT INTO amazon_manufacturer_sample_photos (sample_id, sort_order, file_path, original_name, mime) VALUES (?, ?, ?, ?, ?)`)
      .run(sId, maxOrder + 1, file.filename, Buffer.from(file.originalname, 'latin1').toString('utf8').slice(0, 300), file.mimetype.slice(0, 200));
    res.status(201).json({ photo: db.prepare(`SELECT * FROM amazon_manufacturer_sample_photos WHERE id = ?`).get(r.lastInsertRowid) as SamplePhotoRow });
  });
});

router.get('/products/:id/manufacturers/:mId/samples/:sId/photos/:photoId', (req: Request, res: Response) => {
  const id = Number(req.params.id); const mId = Number(req.params.mId); const sId = Number(req.params.sId); const photoId = Number(req.params.photoId);
  if (![id, mId, sId, photoId].every(Number.isInteger) || !ensureProduct(id) || !loadManufacturer(id, mId) || !loadSample(mId, sId)) { res.status(404).end(); return; }
  const p = loadSamplePhoto(sId, photoId);
  if (!p) { res.status(404).end(); return; }
  const abs = path.resolve(SAMPLE_PHOTOS_DIR, p.file_path);
  if (!abs.startsWith(path.resolve(SAMPLE_PHOTOS_DIR) + path.sep) || !fs.existsSync(abs)) { res.status(404).end(); return; }
  res.setHeader('Content-Type', p.mime || 'application/octet-stream');
  const ascii = (p.original_name ?? 'foto').replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
  res.setHeader('Content-Disposition', `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(p.original_name ?? 'foto')}`);
  fs.createReadStream(abs).pipe(res);
});

router.delete('/products/:id/manufacturers/:mId/samples/:sId/photos/:photoId', (req: Request, res: Response) => {
  const id = Number(req.params.id); const mId = Number(req.params.mId); const sId = Number(req.params.sId); const photoId = Number(req.params.photoId);
  if (![id, mId, sId, photoId].every(Number.isInteger) || !ensureProduct(id) || !loadManufacturer(id, mId) || !loadSample(mId, sId)) { res.status(404).json({ error: 'not found' }); return; }
  const p = loadSamplePhoto(sId, photoId);
  if (!p) { res.status(404).json({ error: 'not found' }); return; }
  db.prepare(`DELETE FROM amazon_manufacturer_sample_photos WHERE id = ?`).run(photoId);
  deleteSamplePhotoFromDisk(p.file_path);
  res.status(204).end();
});
```

- [ ] **Step 3: Test ergänzen** (Foto-Upload)
```ts
it('lädt ein Foto zu einem Sample hoch und liefert es aus', async () => {
  const { pid, mId } = makeProductAndManufacturer(db);
  const sId = (await request(app).post(`/api/amazon/products/${pid}/manufacturers/${mId}/samples`).send({})).body.sample.id;
  const up = await request(app).post(`/api/amazon/products/${pid}/manufacturers/${mId}/samples/${sId}/photos`)
    .attach('file', Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'foto.png');
  expect(up.status).toBe(201);
  const get = await request(app).get(`/api/amazon/products/${pid}/manufacturers/${mId}/samples/${sId}/photos/${up.body.photo.id}`);
  expect(get.status).toBe(200);
});
```

- [ ] **Step 4: Tests grün** `npm --prefix backend test -- integration.amazon_manufacturer_samples` → alle PASS. Typecheck: `npm --prefix backend run typecheck` → Exit 0.

- [ ] **Step 5: Commit**
```bash
git add backend/src/routes/amazon.manufacturers.routes.ts backend/test/integration.amazon_manufacturer_samples.test.ts
git commit -m "feat(amazon-samples): Sample-Fotos Upload/Anzeige/Löschen"
```

---

## Task 4: Frontend-API — Typen + Funktionen

**Files:** Modify `frontend/src/api/amazon.api.ts`

- [ ] **Step 1: `samples` zur Manufacturer-Typ-Definition ergänzen** — finde `export interface Manufacturer { ... offers: ManufacturerOffer[]; }` und ergänze `samples: ManufacturerSample[];`.

- [ ] **Step 2: Typen + Funktionen ergänzen** (bei den Offer-Funktionen)

```ts
export interface SamplePhoto { id: number; sample_id: number; sort_order: number; file_path: string; original_name: string | null; mime: string | null; created_at: number; }
export interface ManufacturerSample {
  id: number; manufacturer_id: number; sort_order: number;
  bezeichnung: string; received_date: string | null; rating: number;
  status: 'angefragt' | 'bestellt' | 'erhalten' | 'abgelehnt'; is_favorite: number;
  notizen: string | null; maengel: string | null; kosten: string | null; currency: 'USD' | 'EUR';
  created_at: number; updated_at: number; photos: SamplePhoto[];
}
export type SamplePatch = Partial<Pick<ManufacturerSample, 'bezeichnung' | 'received_date' | 'rating' | 'status' | 'is_favorite' | 'notizen' | 'maengel' | 'kosten' | 'currency'>>;

export async function createSampleM(productId: number, mId: number): Promise<ManufacturerSample> {
  return ((await apiClient.post(`/amazon/products/${productId}/manufacturers/${mId}/samples`, {})).data as { sample: ManufacturerSample }).sample;
}
export async function updateSampleM(productId: number, mId: number, sId: number, patch: SamplePatch): Promise<ManufacturerSample> {
  return ((await apiClient.patch(`/amazon/products/${productId}/manufacturers/${mId}/samples/${sId}`, patch)).data as { sample: ManufacturerSample }).sample;
}
export async function deleteSampleM(productId: number, mId: number, sId: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${productId}/manufacturers/${mId}/samples/${sId}`);
}
export async function reorderSamplesM(productId: number, mId: number, order: number[]): Promise<void> {
  await apiClient.patch(`/amazon/products/${productId}/manufacturers/${mId}/samples/reorder`, { order });
}
export async function uploadSamplePhoto(productId: number, mId: number, sId: number, file: File): Promise<SamplePhoto> {
  const fd = new FormData(); fd.append('file', file);
  return ((await apiClient.post(`/amazon/products/${productId}/manufacturers/${mId}/samples/${sId}/photos`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })).data as { photo: SamplePhoto }).photo;
}
export async function getSamplePhotoObjectUrl(productId: number, mId: number, sId: number, photoId: number): Promise<string> {
  const r = await apiClient.get(`/amazon/products/${productId}/manufacturers/${mId}/samples/${sId}/photos/${photoId}`, { responseType: 'blob' });
  return URL.createObjectURL(r.data as Blob);
}
export async function deleteSamplePhoto(productId: number, mId: number, sId: number, photoId: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${productId}/manufacturers/${mId}/samples/${sId}/photos/${photoId}`);
}
```

Hinweis: Namen `createSampleM` etc. mit `M`-Suffix, weil `createSample`/`updateSample` bereits für Sourcing-Samples existieren.

- [ ] **Step 3: Typecheck + Commit** `npm --prefix frontend run typecheck` → Exit 0.
```bash
git add frontend/src/api/amazon.api.ts
git commit -m "feat(amazon-samples): Frontend-API + Typen + Manufacturer.samples"
```

---

## Task 5: Frontend-Hooks

**Files:** Modify `frontend/src/hooks/amazon/useManufacturers.ts`

- [ ] **Step 1: Importe ergänzen** (`createSampleM, updateSampleM, deleteSampleM, reorderSamplesM, uploadSamplePhoto, deleteSamplePhoto, type SamplePatch` aus `../../api/amazon.api`).

- [ ] **Step 2: Hooks ergänzen** (Muster wie Offer-Hooks, `useInval` wiederverwenden)

```ts
export function useCreateSampleM(productId: number) {
  const inval = useInval(productId);
  return useMutation({ mutationFn: (mId: number) => createSampleM(productId, mId), onSettled: inval });
}
export function useUpdateSampleM(productId: number) {
  const inval = useInval(productId);
  return useMutation({ mutationFn: ({ mId, sId, patch }: { mId: number; sId: number; patch: SamplePatch }) => updateSampleM(productId, mId, sId, patch), onSettled: inval });
}
export function useDeleteSampleM(productId: number) {
  const inval = useInval(productId);
  return useMutation({ mutationFn: ({ mId, sId }: { mId: number; sId: number }) => deleteSampleM(productId, mId, sId), onSettled: inval });
}
export function useReorderSamplesM(productId: number) {
  const inval = useInval(productId);
  return useMutation({ mutationFn: ({ mId, order }: { mId: number; order: number[] }) => reorderSamplesM(productId, mId, order), onSettled: inval });
}
export function useUploadSamplePhoto(productId: number) {
  const inval = useInval(productId);
  return useMutation({ mutationFn: ({ mId, sId, file }: { mId: number; sId: number; file: File }) => uploadSamplePhoto(productId, mId, sId, file), onSettled: inval });
}
export function useDeleteSamplePhoto(productId: number) {
  const inval = useInval(productId);
  return useMutation({ mutationFn: ({ mId, sId, photoId }: { mId: number; sId: number; photoId: number }) => deleteSamplePhoto(productId, mId, sId, photoId), onSettled: inval });
}
```

- [ ] **Step 3: Typecheck + Commit**
```bash
git add frontend/src/hooks/amazon/useManufacturers.ts
git commit -m "feat(amazon-samples): Query-Hooks"
```

---

## Task 6: Frontend — ManufacturerSamples-Komponente

**Files:** Create `frontend/src/components/amazon/manufacturers/ManufacturerSamples.tsx`

Muster: `ManufacturerOffers` (onBlur-Autosave, Sterne, currency-Select, Thumbnail) + `ResearchCardAttachments` (Foto-Upload Klick/Drag/Cmd+V). Foto-Paste auf Sample-Block-Ebene mit `stopImmediatePropagation` (Standard seit Research).

- [ ] **Step 1: Komponente schreiben**

```tsx
import { useEffect, useRef, useState } from 'react';
import { getSamplePhotoObjectUrl, type ManufacturerSample, type SamplePhoto } from '../../../api/amazon.api';
import {
  useCreateSampleM, useUpdateSampleM, useDeleteSampleM,
  useUploadSamplePhoto, useDeleteSamplePhoto,
} from '../../../hooks/amazon/useManufacturers';

const INPUT_STYLE: React.CSSProperties = {
  background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)',
};
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 20 * 1024 * 1024;
const STATUS_OPTS: ManufacturerSample['status'][] = ['angefragt', 'bestellt', 'erhalten', 'abgelehnt'];

function PhotoThumb({ productId, mId, sId, photo, onDelete }: { productId: number; mId: number; sId: number; photo: SamplePhoto; onDelete: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let revoked = false; let url: string | null = null;
    getSamplePhotoObjectUrl(productId, mId, sId, photo.id).then(u => { if (revoked) { URL.revokeObjectURL(u); return; } url = u; setSrc(u); }).catch(() => setSrc(null));
    return () => { revoked = true; if (url) URL.revokeObjectURL(url); };
  }, [productId, mId, sId, photo.id]);
  return (
    <div className="relative group" style={{ width: 88, height: 88 }}>
      {src ? <a href={src} target="_blank" rel="noopener noreferrer"><img src={src} alt="" className="w-full h-full object-cover rounded-md" /></a>
           : <div className="w-full h-full rounded-md" style={{ background: 'var(--color-surface-container-low)' }} />}
      <button type="button" onClick={onDelete}
        className="absolute top-1 right-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity px-1"
        style={{ background: 'rgba(0,0,0,0.6)', color: '#fca5a5' }} aria-label="Foto entfernen">
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
      </button>
    </div>
  );
}

function SampleBlock({ productId, mId, sample }: { productId: number; mId: number; sample: ManufacturerSample }) {
  const update = useUpdateSampleM(productId);
  const del = useDeleteSampleM(productId);
  const upload = useUploadSamplePhoto(productId);
  const delPhoto = useDeleteSamplePhoto(productId);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [bez, setBez] = useState(sample.bezeichnung);
  const [datum, setDatum] = useState(sample.received_date ?? '');
  const [notizen, setNotizen] = useState(sample.notizen ?? '');
  const [maengel, setMaengel] = useState(sample.maengel ?? '');
  const [kosten, setKosten] = useState(sample.kosten ?? '');
  useEffect(() => { setBez(sample.bezeichnung); }, [sample.bezeichnung]);
  useEffect(() => { setDatum(sample.received_date ?? ''); }, [sample.received_date]);
  useEffect(() => { setNotizen(sample.notizen ?? ''); }, [sample.notizen]);
  useEffect(() => { setMaengel(sample.maengel ?? ''); }, [sample.maengel]);
  useEffect(() => { setKosten(sample.kosten ?? ''); }, [sample.kosten]);

  function save(patch: Parameters<typeof update.mutate>[0]['patch']) { update.mutate({ mId, sId: sample.id, patch }); }

  function pick(f: File | undefined | null) {
    if (!f) return;
    if (!ALLOWED.includes(f.type)) { setErr('Nur JPG, PNG oder WEBP.'); return; }
    if (f.size > MAX_BYTES) { setErr('Bild größer als 20 MB.'); return; }
    setErr(null);
    upload.mutate({ mId, sId: sample.id, file: f });
  }
  function onPaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items; if (!items) return;
    for (const it of items) if (it.kind === 'file') {
      const f = it.getAsFile();
      if (f && ALLOWED.includes(f.type) && f.size <= MAX_BYTES) {
        upload.mutate({ mId, sId: sample.id, file: f });
        e.preventDefault(); e.stopPropagation(); e.nativeEvent.stopImmediatePropagation();
      }
      break;
    }
  }

  return (
    <div className="rounded-lg p-3" onPaste={onPaste} data-card-paste
      style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" onClick={() => save({ is_favorite: sample.is_favorite ? 0 : 1 })}
          style={{ color: sample.is_favorite ? '#fbbf24' : 'var(--color-on-surface-variant)' }} title="Favorit/Gewinner">
          <span className="material-symbols-outlined" style={{ fontSize: 18, fontVariationSettings: sample.is_favorite ? "'FILL' 1" : "'FILL' 0" }}>star</span>
        </button>
        <input value={bez} onChange={(e) => setBez(e.target.value)} onBlur={() => { if (bez !== sample.bezeichnung) save({ bezeichnung: bez }); }}
          placeholder="Bezeichnung (z.B. Charge A)" className="flex-1 min-w-[160px] px-2 py-1 rounded text-sm font-semibold" style={INPUT_STYLE} />
        <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} onBlur={() => { if (datum !== (sample.received_date ?? '')) save({ received_date: datum }); }}
          className="px-2 py-1 rounded text-xs" style={INPUT_STYLE} title="Erhalten am" />
        {/* Sterne */}
        <div className="flex items-center">
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} type="button" onClick={() => save({ rating: sample.rating === n ? 0 : n })} aria-label={`${n} Sterne`}
              style={{ color: n <= sample.rating ? '#fbbf24' : 'var(--color-on-surface-variant)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, fontVariationSettings: n <= sample.rating ? "'FILL' 1" : "'FILL' 0" }}>star</span>
            </button>
          ))}
        </div>
        <select value={sample.status} onChange={(e) => save({ status: e.target.value as ManufacturerSample['status'] })}
          className="px-2 py-1 rounded text-xs" style={INPUT_STYLE}>
          {STATUS_OPTS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button type="button" onClick={() => { if (confirm(`Sample „${sample.bezeichnung || 'ohne Namen'}" wirklich löschen?`)) del.mutate({ mId, sId: sample.id }); }}
          aria-label="Sample löschen" className="p-1 rounded hover:bg-white/5" style={{ color: '#fca5a5' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
        </button>
      </div>

      {/* Fotos */}
      <div className="flex flex-wrap gap-2 items-center mt-2">
        {sample.photos.map(p => <PhotoThumb key={p.id} productId={productId} mId={mId} sId={sample.id} photo={p} onDelete={() => delPhoto.mutate({ mId, sId: sample.id, photoId: p.id })} />)}
        <button type="button" onClick={() => fileInput.current?.click()}
          onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files?.[0]); }}
          className="flex items-center justify-center rounded-md"
          style={{ width: 88, height: 88, border: '1px dashed rgba(255,255,255,0.2)', color: 'var(--color-on-surface-variant)' }}
          aria-label="Foto hinzufügen" title="Klick, Drag&Drop oder Cmd+V — AirDrop-Datei reinziehen">
          <span className="material-symbols-outlined">add_photo_alternate</span>
        </button>
      </div>
      <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
        onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
      {err && <p className="text-xs mt-1" style={{ color: '#fca5a5' }}>{err}</p>}

      {/* Notizen / Mängel / Kosten */}
      <div className="flex flex-col gap-2 mt-2">
        <textarea value={notizen} onChange={(e) => setNotizen(e.target.value)} onBlur={() => { if (notizen !== (sample.notizen ?? '')) save({ notizen }); }}
          placeholder="Notizen zur Charge …" rows={2} className="w-full px-2 py-1 rounded text-sm resize-y" style={INPUT_STYLE} />
        <textarea value={maengel} onChange={(e) => setMaengel(e.target.value)} onBlur={() => { if (maengel !== (sample.maengel ?? '')) save({ maengel }); }}
          placeholder="Mängel / Verbesserungspunkte …" rows={2} className="w-full px-2 py-1 rounded text-sm resize-y" style={INPUT_STYLE} />
        <div className="flex items-center gap-2">
          <input value={kosten} onChange={(e) => setKosten(e.target.value)} onBlur={() => { if (kosten !== (sample.kosten ?? '')) save({ kosten }); }}
            placeholder="Kosten" className="px-2 py-1 rounded text-sm w-32" style={INPUT_STYLE} />
          <select value={sample.currency} onChange={(e) => save({ currency: e.target.value as 'USD' | 'EUR' })}
            className="px-2 py-1 rounded text-sm" style={INPUT_STYLE}>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
          </select>
        </div>
      </div>
    </div>
  );
}

export function ManufacturerSamples({ productId, mId, samples }: { productId: number; mId: number; samples: ManufacturerSample[] }) {
  const create = useCreateSampleM(productId);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold tracking-wider" style={{ color: 'var(--color-on-surface-variant)' }}>SAMPLES</p>
      {samples.map(s => <SampleBlock key={s.id} productId={productId} mId={mId} sample={s} />)}
      <button type="button" onClick={() => create.mutate(mId)}
        className="self-start px-2 py-1 rounded-md text-xs flex items-center gap-1"
        style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span> Sample hinzufügen
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + Commit**
```bash
git add frontend/src/components/amazon/manufacturers/ManufacturerSamples.tsx
git commit -m "feat(amazon-samples): ManufacturerSamples-Komponente (Fotos/Bewertung/Status/Mängel/Kosten)"
```

---

## Task 7: Einbinden + Abschluss

**Files:** Modify `frontend/src/pages/amazon/ManufacturerDetailPage.tsx`

- [ ] **Step 1: Import + Einbindung** — nach `<ManufacturerOffers .../>`:
```tsx
import { ManufacturerSamples } from '../../components/amazon/manufacturers/ManufacturerSamples';
```
```tsx
        <ManufacturerOffers productId={productId} mId={manufacturer.id} offers={manufacturer.offers} />
        <ManufacturerSamples productId={productId} mId={manufacturer.id} samples={manufacturer.samples} />
```

- [ ] **Step 2: Typecheck** `npm --prefix frontend run typecheck` → Exit 0.

- [ ] **Step 3: Manuelle Verifikation** (Benny lädt hart neu). Sample anlegen → Bezeichnung/Datum/Bewertung/Status/Favorit/Notizen/Mängel/Kosten setzen → Foto per Klick + Cmd+V hochladen → Reload zeigt alles. Anderer Hersteller hat eigene Samples. Sourcing unverändert.

- [ ] **Step 4: Commit**
```bash
git add frontend/src/pages/amazon/ManufacturerDetailPage.tsx
git commit -m "feat(amazon-samples): Samples-Bereich in Hersteller-Detailseite einbinden"
```

---

## Abschluss
- [ ] Voller Backend-Test + beide Typechecks grün.
- [ ] UAT mit Benny anhand der Testkriterien aus der Spec.
- [ ] Merge nach `main` (`--no-ff`) nach Freigabe.

## Self-Review (gegen Spec)
- Ort: Samples-Bereich unter Angebote auf Hersteller-Seite ✓ (Task 7)
- Felder: Bezeichnung, Datum, Fotos, Bewertung, Status, Favorit, Notizen, Mängel, Kosten+Währung ✓ (Task 2, 6)
- Fotos Klick/Drag/Cmd+V, nur Bilder, Thumbnails, Vollansicht, löschen ✓ (Task 3, 6)
- Pro Hersteller getrennt (manufacturer_id) ✓; Sourcing unberührt ✓
- Auto-Save, Lösch-Bestätigung, echte Umlaute ✓
- Paste-Sicherheit (stopImmediatePropagation) ✓ (Task 6)
- Vergleich = Liste; keine separate Vergleichsansicht (YAGNI) ✓
