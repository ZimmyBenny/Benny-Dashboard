# Amazon USP Phase 3 — Persönlicher Arbeitsbereich — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein aufklappbarer „Persönlich"-Block je Produkt mit Beispiele-&-Links-Feldern, sortierbaren finalen Kaufgründen und einem Upload-Bereich für beliebige Dateien — alles nur für den Nutzer, nicht im PDF.

**Architecture:** 4 neue Spalten an `amazon_usp` (Beispiele/Differenzierung) + 2 neue Tabellen (`amazon_usp_kaufgruende`, `amazon_usp_files`), Migration 075. Backend erweitert Meta-PATCH und GET-Payload, ergänzt Kaufgründe-CRUD/Reorder und Datei-Upload/Serve/Delete (Multer, beliebiger Typ). Frontend: TanStack-Query-Hooks + aufklappbarer `UspPersonal`-Block. Rein additiv.

**Tech Stack:** Express 5, better-sqlite3, multer; React 19, TanStack Query 5, Tailwind v4. Vitest+supertest.

---

## Datensicherheit
Nur neue Spalten/Tabellen + neues Datei-Verzeichnis → Auto-Backup der Migration genügt. Kein `PRAGMA foreign_keys` in der Migration.

## Vorbedingung — Branch (Orchestrator, vor Task 1)
```bash
cd "/Users/benny/Library/Mobile Documents/com~apple~CloudDocs/B E N N Y 👨🏽‍💻/09 - Benny Dashboard"
git checkout main && git checkout -b feat/amazon-usp-phase3
```

## Pfade
- Repo `<repo>` = `/Users/benny/Library/Mobile Documents/com~apple~CloudDocs/B E N N Y 👨🏽‍💻/09 - Benny Dashboard`
- Backend: `cd "<repo>/backend" && npx vitest run … ; npx tsc --noEmit`
- Frontend: `cd "<repo>/frontend" && npx tsc --noEmit && npx vite build`

## File Structure
- Create `backend/src/db/migrations/075_amazon_usp_personal.sql`
- Modify `backend/src/routes/amazon.usp.routes.ts` (Meta-Felder, Kaufgründe, Dateien, Payload)
- Modify `backend/test/integration.amazon_usp.test.ts`
- Modify `frontend/src/api/amazon.api.ts`, `frontend/src/hooks/amazon/useUsp.ts`
- Create `frontend/src/components/amazon/usp/UspPersonal.tsx`, `UspBeispiele.tsx`, `UspKaufgruende.tsx`, `UspKaufgrundRow.tsx`, `UspFiles.tsx`, `DeleteUspFileDialog.tsx`
- Modify `frontend/src/components/amazon/usp/UspSection.tsx`

---

### Task 1: Migration 075 — Felder + Tabellen

**Files:** Create `backend/src/db/migrations/075_amazon_usp_personal.sql`

- [ ] **Step 1: Migration schreiben**

```sql
-- Migration 075: USP persoenlicher Bereich (2026-06-08)
-- WICHTIG: Kein FK-Pragma setzen. Rein additiv. Auto-Backup via migrate.ts.

ALTER TABLE amazon_usp ADD COLUMN bsp_amazon      TEXT;
ALTER TABLE amazon_usp ADD COLUMN bsp_alibaba     TEXT;
ALTER TABLE amazon_usp ADD COLUMN bsp_pinterest   TEXT;
ALTER TABLE amazon_usp ADD COLUMN differenzierung TEXT;

CREATE TABLE amazon_usp_kaufgruende (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL REFERENCES amazon_products(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  text        TEXT    NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX amazon_usp_kaufgruende_product_idx
  ON amazon_usp_kaufgruende (product_id, sort_order, id);

CREATE TABLE amazon_usp_files (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id    INTEGER NOT NULL REFERENCES amazon_products(id) ON DELETE CASCADE,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  file_path     TEXT    NOT NULL,
  original_name TEXT    NOT NULL DEFAULT '',
  mime          TEXT    NOT NULL DEFAULT '',
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX amazon_usp_files_product_idx
  ON amazon_usp_files (product_id, sort_order, id);
```

- [ ] **Step 2: Smoke**

Run: `cd "<repo>/backend" && npx vitest run test/integration.amazon_usp.test.ts 2>&1 | tail -4`
Expected: bestehende USP-Tests grün, kein SQL-Fehler beim Setup.

- [ ] **Step 3: Commit**
```bash
git add "backend/src/db/migrations/075_amazon_usp_personal.sql"
git commit -m "feat(amazon-usp): Migration 075 — persoenliche Felder + Tabellen" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Backend — Meta-Felder + Kaufgründe (CRUD/Reorder) + Payload + Tests

**Files:** Modify `backend/src/routes/amazon.usp.routes.ts`, `backend/test/integration.amazon_usp.test.ts`

- [ ] **Step 1: Tests ergänzen** (neue describe-Suite am Dateiende)

```ts
describe('USP API — Persoenlich: Meta-Felder + Kaufgruende', () => {
  let db: Database.Database; let app: express.Express;
  beforeEach(async () => { db = createTestDb(); app = await makeApp(db); });

  it('Meta-PATCH setzt Beispiel-Felder (Trim, Leer->null)', async () => {
    const pid = makeProduct(db);
    await request(app).get(`/api/amazon/products/${pid}/usp`);
    const r = await request(app).patch(`/api/amazon/products/${pid}/usp`).send({
      bsp_amazon: '  A ', bsp_alibaba: 'B', bsp_pinterest: 'C', differenzierung: 'D',
    });
    expect(r.status).toBe(200);
    expect(r.body.meta).toMatchObject({ bsp_amazon: 'A', bsp_alibaba: 'B', bsp_pinterest: 'C', differenzierung: 'D' });
    const empty = await request(app).patch(`/api/amazon/products/${pid}/usp`).send({ bsp_amazon: '' });
    expect(empty.body.meta.bsp_amazon).toBeNull();
  });

  it('Kaufgrund CRUD + Reorder + im Payload', async () => {
    const pid = makeProduct(db);
    await request(app).get(`/api/amazon/products/${pid}/usp`);
    const a = await request(app).post(`/api/amazon/products/${pid}/usp/kaufgruende`).send({ text: 'A' });
    expect(a.status).toBe(201);
    expect(a.body.kaufgrund).toMatchObject({ text: 'A', sort_order: 1, product_id: pid });
    const b = await request(app).post(`/api/amazon/products/${pid}/usp/kaufgruende`).send({ text: 'B' });
    expect(b.body.kaufgrund.sort_order).toBe(2);
    const patch = await request(app).patch(`/api/amazon/products/${pid}/usp/kaufgruende/${a.body.kaufgrund.id}`).send({ text: 'A2' });
    expect(patch.body.kaufgrund.text).toBe('A2');
    const ro = await request(app).patch(`/api/amazon/products/${pid}/usp/kaufgruende/reorder`).send({ order: [b.body.kaufgrund.id, a.body.kaufgrund.id] });
    expect(ro.status).toBe(200);
    const list = await request(app).get(`/api/amazon/products/${pid}/usp`);
    expect(list.body.kaufgruende.map((k: { text: string }) => k.text)).toEqual(['B', 'A2']);
    const del = await request(app).delete(`/api/amazon/products/${pid}/usp/kaufgruende/${a.body.kaufgrund.id}`);
    expect(del.status).toBe(204);
  });

  it('Kaufgrund Cross-Produkt -> 404; Cascade beim Produkt-Loeschen', async () => {
    const pA = makeProduct(db, 'A'); const pB = makeProduct(db, 'B');
    await request(app).get(`/api/amazon/products/${pA}/usp`);
    await request(app).get(`/api/amazon/products/${pB}/usp`);
    const a = await request(app).post(`/api/amazon/products/${pA}/usp/kaufgruende`).send({ text: 'X' });
    expect((await request(app).delete(`/api/amazon/products/${pB}/usp/kaufgruende/${a.body.kaufgrund.id}`)).status).toBe(404);
    db.prepare(`DELETE FROM amazon_products WHERE id=?`).run(pA);
    expect((db.prepare(`SELECT COUNT(*) AS c FROM amazon_usp_kaufgruende WHERE id=?`).get(a.body.kaufgrund.id) as { c: number }).c).toBe(0);
  });
});
```

- [ ] **Step 2: Tests laufen — FAIL**

Run: `cd "<repo>/backend" && npx vitest run test/integration.amazon_usp.test.ts 2>&1 | tail -15`
Expected: neue Tests rot.

- [ ] **Step 3: `amazon.usp.routes.ts` — Meta erweitern**

(a) `MetaRow`-Interface (aktuell `interface MetaRow { product_id: number; marke: string | null; hauptfokus: string | null; logo_path: string | null; status: string; updated_at: number; }`) ersetzen durch:
```ts
interface MetaRow { product_id: number; marke: string | null; hauptfokus: string | null; logo_path: string | null; status: string; bsp_amazon: string | null; bsp_alibaba: string | null; bsp_pinterest: string | null; differenzierung: string | null; updated_at: number; }
```

(b) Konstante ergänzen: in der Zeile `const MAX_MARKE = 200, MAX_HAUPTFOKUS = 2000, …` am Ende `, MAX_BSP = 2000` hinzufügen.

(c) Im Meta-PATCH-Handler die Feld-Schleife erweitern. Ersetze
```ts
  for (const [col, max] of [['marke', MAX_MARKE], ['hauptfokus', MAX_HAUPTFOKUS]] as const) {
```
durch
```ts
  for (const [col, max] of [['marke', MAX_MARKE], ['hauptfokus', MAX_HAUPTFOKUS], ['bsp_amazon', MAX_BSP], ['bsp_alibaba', MAX_BSP], ['bsp_pinterest', MAX_BSP], ['differenzierung', MAX_BSP]] as const) {
```

- [ ] **Step 4: `amazon.usp.routes.ts` — Kaufgründe-Helfer + Payload**

Bei den anderen `load…`-Helfern ergänzen:
```ts
interface KaufgrundRow { id: number; product_id: number; sort_order: number; text: string; created_at: number; updated_at: number; }
function loadKaufgruende(productId: number): KaufgrundRow[] {
  return db.prepare(`SELECT * FROM amazon_usp_kaufgruende WHERE product_id = ? ORDER BY sort_order, id`).all(productId) as KaufgrundRow[];
}
function loadKaufgrundForProduct(productId: number, kId: number): KaufgrundRow | undefined {
  return db.prepare(`SELECT * FROM amazon_usp_kaufgruende WHERE id = ? AND product_id = ?`).get(kId, productId) as KaufgrundRow | undefined;
}
```

GET-Payload erweitern — ersetze
```ts
  res.json({ meta, points: loadPoints(id), manufacturers: loadManufacturers(id), feasibility: loadFeasibility(id) });
```
durch
```ts
  res.json({ meta, points: loadPoints(id), manufacturers: loadManufacturers(id), feasibility: loadFeasibility(id), kaufgruende: loadKaufgruende(id), files: loadFiles(id) });
```
(Die Funktion `loadFiles` wird in Task 3 ergänzt; damit dieser Schritt allein typecheckt, füge in DIESEM Task einen Platzhalter direkt vor dem GET-Handler ein, der in Task 3 ersetzt wird:
```ts
function loadFiles(_productId: number): unknown[] { return []; }
```
)

- [ ] **Step 5: Kaufgründe-Routen** (vor `export default router;`). REIHENFOLGE: `reorder` VOR `:kId`.
```ts
const MAX_KAUFGRUND = 500;
router.post('/products/:id/usp/kaufgruende', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) { res.status(404).json({ error: 'product not found' }); return; }
  const textRaw = (req.body as { text?: unknown })?.text;
  let text = '';
  if (textRaw !== undefined && textRaw !== null) {
    if (typeof textRaw !== 'string' || textRaw.trim().length > MAX_KAUFGRUND) { res.status(400).json({ error: 'invalid text' }); return; }
    text = textRaw.trim();
  }
  const maxOrder = (db.prepare(`SELECT COALESCE(MAX(sort_order),0) AS m FROM amazon_usp_kaufgruende WHERE product_id = ?`).get(id) as { m: number }).m;
  const r = db.prepare(`INSERT INTO amazon_usp_kaufgruende (product_id, sort_order, text) VALUES (?, ?, ?)`).run(id, maxOrder + 1, text);
  res.status(201).json({ kaufgrund: db.prepare(`SELECT * FROM amazon_usp_kaufgruende WHERE id = ?`).get(r.lastInsertRowid) as KaufgrundRow });
});

router.patch('/products/:id/usp/kaufgruende/reorder', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) { res.status(404).json({ error: 'product not found' }); return; }
  const order = (req.body as { order?: unknown })?.order;
  if (!Array.isArray(order) || order.some(x => !Number.isInteger(x))) { res.status(400).json({ error: 'invalid order' }); return; }
  const own = db.prepare(`SELECT id FROM amazon_usp_kaufgruende WHERE product_id = ?`).all(id) as Array<{ id: number }>;
  const ownIds = new Set(own.map(o => o.id));
  if (order.length !== ownIds.size || order.some((x: number) => !ownIds.has(x))) { res.status(400).json({ error: 'order mismatch' }); return; }
  const upd = db.prepare(`UPDATE amazon_usp_kaufgruende SET sort_order = ?, updated_at = unixepoch() WHERE id = ?`);
  db.transaction(() => { order.forEach((kid: number, idx: number) => upd.run(idx + 1, kid)); })();
  res.json({ kaufgruende: loadKaufgruende(id) });
});

router.patch('/products/:id/usp/kaufgruende/:kId', (req: Request, res: Response) => {
  const id = Number(req.params.id); const kId = Number(req.params.kId);
  if (!Number.isInteger(id) || !Number.isInteger(kId)) { res.status(404).json({ error: 'not found' }); return; }
  if (!ensureProduct(id) || !loadKaufgrundForProduct(id, kId)) { res.status(404).json({ error: 'not found' }); return; }
  const textRaw = (req.body as { text?: unknown })?.text;
  if (textRaw !== undefined) {
    if (typeof textRaw !== 'string' || textRaw.trim().length > MAX_KAUFGRUND) { res.status(400).json({ error: 'invalid text' }); return; }
    db.prepare(`UPDATE amazon_usp_kaufgruende SET text = ?, updated_at = unixepoch() WHERE id = ?`).run(textRaw.trim(), kId);
  }
  res.json({ kaufgrund: db.prepare(`SELECT * FROM amazon_usp_kaufgruende WHERE id = ?`).get(kId) as KaufgrundRow });
});

router.delete('/products/:id/usp/kaufgruende/:kId', (req: Request, res: Response) => {
  const id = Number(req.params.id); const kId = Number(req.params.kId);
  if (!Number.isInteger(id) || !Number.isInteger(kId)) { res.status(404).json({ error: 'not found' }); return; }
  if (!ensureProduct(id) || !loadKaufgrundForProduct(id, kId)) { res.status(404).json({ error: 'not found' }); return; }
  db.prepare(`DELETE FROM amazon_usp_kaufgruende WHERE id = ?`).run(kId);
  res.status(204).end();
});
```

- [ ] **Step 6: Tests grün + Typecheck**

Run: `cd "<repo>/backend" && npx vitest run test/integration.amazon_usp.test.ts && npx tsc --noEmit`
Expected: alle USP-Tests PASS, tsc PASS.

- [ ] **Step 7: Commit**
```bash
git add "backend/src/routes/amazon.usp.routes.ts" "backend/test/integration.amazon_usp.test.ts"
git commit -m "feat(amazon-usp): Meta-Beispielfelder + Kaufgruende (CRUD/Reorder) + Payload + Tests" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Backend — Dateien (Upload/Serve/Delete) + Payload + Tests

**Files:** Modify `backend/src/routes/amazon.usp.routes.ts`, `backend/test/integration.amazon_usp.test.ts`

- [ ] **Step 1: Tests ergänzen** (neue describe-Suite)

```ts
describe('USP API — Persoenlich: Dateien', () => {
  let db: Database.Database; let app: express.Express;
  beforeEach(async () => { db = createTestDb(); app = await makeApp(db); });
  const BIN = Buffer.from('hello world pdf-ish', 'latin1');

  it('Upload + im Payload + GET serve + DELETE', async () => {
    const pid = makeProduct(db);
    const up = await request(app).post(`/api/amazon/products/${pid}/usp/files`)
      .attach('file', BIN, { filename: 'doku.pdf', contentType: 'application/pdf' });
    expect(up.status).toBe(201);
    expect(up.body.file).toMatchObject({ product_id: pid, original_name: 'doku.pdf', mime: 'application/pdf', sort_order: 1 });
    const list = await request(app).get(`/api/amazon/products/${pid}/usp`);
    expect(list.body.files).toHaveLength(1);
    const get = await request(app).get(`/api/amazon/products/${pid}/usp/files/${up.body.file.id}`);
    expect(get.status).toBe(200);
    expect(get.headers['content-type']).toContain('application/pdf');
    const del = await request(app).delete(`/api/amazon/products/${pid}/usp/files/${up.body.file.id}`);
    expect(del.status).toBe(204);
  });

  it('Datei Cross-Produkt -> 404; Cascade beim Produkt-Loeschen', async () => {
    const pA = makeProduct(db, 'A'); const pB = makeProduct(db, 'B');
    const up = await request(app).post(`/api/amazon/products/${pA}/usp/files`).attach('file', BIN, { filename: 'a.bin', contentType: 'application/octet-stream' });
    expect((await request(app).delete(`/api/amazon/products/${pB}/usp/files/${up.body.file.id}`)).status).toBe(404);
    db.prepare(`DELETE FROM amazon_products WHERE id=?`).run(pA);
    expect((db.prepare(`SELECT COUNT(*) AS c FROM amazon_usp_files WHERE id=?`).get(up.body.file.id) as { c: number }).c).toBe(0);
  });
});
```

- [ ] **Step 2: Tests laufen — FAIL**

Run: `cd "<repo>/backend" && npx vitest run test/integration.amazon_usp.test.ts 2>&1 | tail -15`
Expected: neue Datei-Tests rot.

- [ ] **Step 3: Datei-Uploader + Helfer** (nach dem bestehenden Bild-`upload`-Block / bei den anderen Multer-Konstanten)

```ts
const FILES_DIR = path.join(os.homedir(), '.local', 'share', 'benny-dashboard', 'amazon-usp-files');
if (!fs.existsSync(FILES_DIR)) fs.mkdirSync(FILES_DIR, { recursive: true });
const fileUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, FILES_DIR),
    filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname) || ''}`),
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
});
function deleteFilesFile(filename: string | null | undefined) {
  if (!filename) return;
  const abs = path.resolve(FILES_DIR, filename);
  if (!abs.startsWith(path.resolve(FILES_DIR) + path.sep)) return;
  try { fs.unlinkSync(abs); } catch { /* schon weg */ }
}
interface FileRow { id: number; product_id: number; sort_order: number; file_path: string; original_name: string; mime: string; created_at: number; }
function loadFileForProduct(productId: number, fId: number): FileRow | undefined {
  return db.prepare(`SELECT * FROM amazon_usp_files WHERE id = ? AND product_id = ?`).get(fId, productId) as FileRow | undefined;
}
```

Den in Task 2 eingefügten Platzhalter `function loadFiles(_productId: number): unknown[] { return []; }` ERSETZEN durch:
```ts
function loadFiles(productId: number): FileRow[] {
  return db.prepare(`SELECT * FROM amazon_usp_files WHERE product_id = ? ORDER BY sort_order, id`).all(productId) as FileRow[];
}
```

- [ ] **Step 4: Datei-Routen** (vor `export default router;`)
```ts
router.post('/products/:id/usp/files', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) { res.status(404).json({ error: 'product not found' }); return; }
  fileUpload.single('file')(req, res, (err: unknown) => {
    if (err) { res.status(400).json({ error: err instanceof Error ? err.message : 'upload failed' }); return; }
    const file = (req as Request & { file?: { filename: string; originalname: string; mimetype: string } }).file;
    if (!file) { res.status(400).json({ error: 'no file' }); return; }
    const maxOrder = (db.prepare(`SELECT COALESCE(MAX(sort_order),0) AS m FROM amazon_usp_files WHERE product_id = ?`).get(id) as { m: number }).m;
    const r = db.prepare(`INSERT INTO amazon_usp_files (product_id, sort_order, file_path, original_name, mime) VALUES (?, ?, ?, ?, ?)`)
      .run(id, maxOrder + 1, file.filename, file.originalname.slice(0, 300), file.mimetype.slice(0, 200));
    res.status(201).json({ file: db.prepare(`SELECT * FROM amazon_usp_files WHERE id = ?`).get(r.lastInsertRowid) as FileRow });
  });
});

router.get('/products/:id/usp/files/:fId', (req: Request, res: Response) => {
  const id = Number(req.params.id); const fId = Number(req.params.fId);
  if (!Number.isInteger(id) || !Number.isInteger(fId) || !ensureProduct(id)) { res.status(404).end(); return; }
  const f = loadFileForProduct(id, fId);
  if (!f) { res.status(404).end(); return; }
  const abs = path.resolve(FILES_DIR, f.file_path);
  if (!abs.startsWith(path.resolve(FILES_DIR) + path.sep) || !fs.existsSync(abs)) { res.status(404).end(); return; }
  res.setHeader('Content-Type', f.mime || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${f.original_name.replace(/"/g, '')}"`);
  fs.createReadStream(abs).pipe(res);
});

router.delete('/products/:id/usp/files/:fId', (req: Request, res: Response) => {
  const id = Number(req.params.id); const fId = Number(req.params.fId);
  if (!Number.isInteger(id) || !Number.isInteger(fId) || !ensureProduct(id)) { res.status(404).json({ error: 'not found' }); return; }
  const f = loadFileForProduct(id, fId);
  if (!f) { res.status(404).json({ error: 'not found' }); return; }
  db.prepare(`DELETE FROM amazon_usp_files WHERE id = ?`).run(fId);
  deleteFilesFile(f.file_path);
  res.status(204).end();
});
```

- [ ] **Step 5: USP-Tests + volle Suite + Typecheck**

Run: `cd "<repo>/backend" && npx vitest run test/integration.amazon_usp.test.ts && npx vitest run && npx tsc --noEmit`
Expected: alles PASS.

- [ ] **Step 6: Commit**
```bash
git add "backend/src/routes/amazon.usp.routes.ts" "backend/test/integration.amazon_usp.test.ts"
git commit -m "feat(amazon-usp): Datei-Upload/Serve/Delete + Payload + Tests" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Frontend-API — Typen + Funktionen

**Files:** Modify `frontend/src/api/amazon.api.ts`

- [ ] **Step 1: `UspMeta` + `UspMetaPatch` + `UspPayload` erweitern**

`UspMeta`-Interface: vor `updated_at` die 4 Felder ergänzen:
```ts
  bsp_amazon: string | null; bsp_alibaba: string | null; bsp_pinterest: string | null; differenzierung: string | null;
```
`UspMetaPatch` ändern auf:
```ts
export type UspMetaPatch = Partial<Pick<UspMeta, 'marke' | 'hauptfokus' | 'status' | 'bsp_amazon' | 'bsp_alibaba' | 'bsp_pinterest' | 'differenzierung'>>;
```
Im `UspPayload`-Interface `kaufgruende: UspKaufgrund[];` und `files: UspFile[];` ergänzen.

- [ ] **Step 2: Typen + Funktionen ans USP-Ende anfügen**

```ts
export interface UspKaufgrund { id: number; product_id: number; sort_order: number; text: string; created_at: number; updated_at: number; }
export interface UspFile { id: number; product_id: number; sort_order: number; file_path: string; original_name: string; mime: string; created_at: number; }

export async function createUspKaufgrund(productId: number, text?: string): Promise<UspKaufgrund> {
  return ((await apiClient.post(`/amazon/products/${productId}/usp/kaufgruende`, text !== undefined ? { text } : {})).data as { kaufgrund: UspKaufgrund }).kaufgrund;
}
export async function updateUspKaufgrund(productId: number, kId: number, text: string): Promise<UspKaufgrund> {
  return ((await apiClient.patch(`/amazon/products/${productId}/usp/kaufgruende/${kId}`, { text })).data as { kaufgrund: UspKaufgrund }).kaufgrund;
}
export async function deleteUspKaufgrund(productId: number, kId: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${productId}/usp/kaufgruende/${kId}`);
}
export async function reorderUspKaufgruende(productId: number, order: number[]): Promise<void> {
  await apiClient.patch(`/amazon/products/${productId}/usp/kaufgruende/reorder`, { order });
}
export async function uploadUspFile(productId: number, file: File): Promise<UspFile> {
  const fd = new FormData(); fd.append('file', file);
  return ((await apiClient.post(`/amazon/products/${productId}/usp/files`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })).data as { file: UspFile }).file;
}
export async function deleteUspFile(productId: number, fId: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${productId}/usp/files/${fId}`);
}
export async function getUspFileObjectUrl(productId: number, fId: number): Promise<string> {
  const r = await apiClient.get(`/amazon/products/${productId}/usp/files/${fId}`, { responseType: 'blob' });
  return URL.createObjectURL(r.data as Blob);
}
```

- [ ] **Step 3: Typecheck + Commit**

Run: `cd "<repo>/frontend" && npx tsc --noEmit` → clean.
```bash
git add "frontend/src/api/amazon.api.ts"
git commit -m "feat(amazon-usp): API Typen + Funktionen (Beispiele/Kaufgruende/Dateien)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Hooks

**Files:** Modify `frontend/src/hooks/amazon/useUsp.ts`

- [ ] **Step 1: Imports + Hooks**

Importe aus `'../../api/amazon.api'` ergänzen:
```ts
  createUspKaufgrund, updateUspKaufgrund, deleteUspKaufgrund, reorderUspKaufgruende,
  uploadUspFile, deleteUspFile,
```
Hooks am Dateiende anfügen (nutzt vorhandenes `key`/`inval`-Muster im File):
```ts
export function useCreateUspKaufgrund(productId: number) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (text?: string) => createUspKaufgrund(productId, text), onSettled: inval(productId, qc) });
}
export function useUpdateUspKaufgrund(productId: number) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ kId, text }: { kId: number; text: string }) => updateUspKaufgrund(productId, kId, text), onSettled: inval(productId, qc) });
}
export function useDeleteUspKaufgrund(productId: number) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (kId: number) => deleteUspKaufgrund(productId, kId), onSettled: inval(productId, qc) });
}
export function useReorderUspKaufgruende(productId: number) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (order: number[]) => reorderUspKaufgruende(productId, order), onSettled: inval(productId, qc) });
}
export function useUploadUspFile(productId: number) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (file: File) => uploadUspFile(productId, file), onSettled: inval(productId, qc) });
}
export function useDeleteUspFile(productId: number) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (fId: number) => deleteUspFile(productId, fId), onSettled: inval(productId, qc) });
}
```
Falls `inval(productId, qc)` im File nicht existiert (prüfen!), verwende stattdessen `onSettled: () => qc.invalidateQueries({ queryKey: key(productId) })` mit der vorhandenen `key`-Funktion.

- [ ] **Step 2: Typecheck + Commit**

Run: `cd "<repo>/frontend" && npx tsc --noEmit` → clean.
```bash
git add "frontend/src/hooks/amazon/useUsp.ts"
git commit -m "feat(amazon-usp): Hooks fuer Kaufgruende + Dateien" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Komponenten — Beispiele + Kaufgründe

**Files:** Create `frontend/src/components/amazon/usp/UspBeispiele.tsx`, `UspKaufgrundRow.tsx`, `UspKaufgruende.tsx`

- [ ] **Step 1: `UspBeispiele.tsx`** (4 Autosave-Felder; Field-Muster wie `UspMetaForm`)
```tsx
import { useEffect, useState } from 'react';
import { type UspMeta } from '../../../api/amazon.api';
import { useUpdateUspMeta } from '../../../hooks/amazon/useUsp';

function Field({ label, value, onSave }: { label: string; value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => { setV(value); }, [value]);
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>{label}</span>
      <textarea rows={2} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => { if (v !== value) onSave(v); }}
        className="w-full px-2 py-1.5 rounded-md text-sm"
        style={{ background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }} />
    </label>
  );
}

export function UspBeispiele({ productId, meta }: { productId: number; meta: UspMeta }) {
  const update = useUpdateUspMeta(productId);
  return (
    <div className="flex flex-col gap-3">
      <span className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-on-surface-variant)' }}>Beispiele & Links</span>
      <Field label="Amazon USP Beispiel" value={meta.bsp_amazon ?? ''} onSave={(v) => update.mutate({ bsp_amazon: v })} />
      <Field label="Alibaba USP Beispiel" value={meta.bsp_alibaba ?? ''} onSave={(v) => update.mutate({ bsp_alibaba: v })} />
      <Field label="Pinterest USP Beispiel" value={meta.bsp_pinterest ?? ''} onSave={(v) => update.mutate({ bsp_pinterest: v })} />
      <Field label="Bedeutungsvolle Differenzierung" value={meta.differenzierung ?? ''} onSave={(v) => update.mutate({ differenzierung: v })} />
    </div>
  );
}
```

- [ ] **Step 2: `UspKaufgrundRow.tsx`**
```tsx
import { useEffect, useState } from 'react';
import { type UspKaufgrund } from '../../../api/amazon.api';
import { useUpdateUspKaufgrund, useDeleteUspKaufgrund } from '../../../hooks/amazon/useUsp';

interface Props {
  productId: number; index: number; kaufgrund: UspKaufgrund;
  dragHandleProps: React.HTMLAttributes<HTMLDivElement>;
}
export function UspKaufgrundRow({ productId, index, kaufgrund, dragHandleProps }: Props) {
  const update = useUpdateUspKaufgrund(productId);
  const del = useDeleteUspKaufgrund(productId);
  const [text, setText] = useState(kaufgrund.text);
  useEffect(() => { setText(kaufgrund.text); }, [kaufgrund.text]);
  return (
    <div className="flex items-center gap-2">
      <div {...dragHandleProps} className="flex items-center justify-center rounded-md cursor-grab select-none flex-shrink-0"
        style={{ width: 24, height: 24, background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface-variant)' }} title="Zum Sortieren ziehen">
        <span style={{ fontSize: 11, fontWeight: 700 }}>{index + 1}</span>
      </div>
      <input value={text} onChange={(e) => setText(e.target.value)}
        onBlur={() => { if (text !== kaufgrund.text) update.mutate({ kId: kaufgrund.id, text }); }}
        placeholder="Kaufgrund …" className="flex-1 px-2 py-1 rounded-md text-sm"
        style={{ background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }} />
      <button type="button" onClick={() => del.mutate(kaufgrund.id)} className="p-1 rounded-md" style={{ color: '#fca5a5' }} aria-label="Kaufgrund löschen">
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
      </button>
    </div>
  );
}
```

- [ ] **Step 3: `UspKaufgruende.tsx`** (Drag-Reorder wie `UspPointList`)
```tsx
import { useRef, useState } from 'react';
import { type UspKaufgrund } from '../../../api/amazon.api';
import { useCreateUspKaufgrund, useReorderUspKaufgruende } from '../../../hooks/amazon/useUsp';
import { UspKaufgrundRow } from './UspKaufgrundRow';

export function UspKaufgruende({ productId, kaufgruende }: { productId: number; kaufgruende: UspKaufgrund[] }) {
  const create = useCreateUspKaufgrund(productId);
  const reorder = useReorderUspKaufgruende(productId);
  const [order, setOrder] = useState<number[] | null>(null);
  const dragIndex = useRef<number | null>(null);
  const ids = order ?? kaufgruende.map(k => k.id);
  const byId = new Map(kaufgruende.map(k => [k.id, k]));
  const ordered = ids.map(id => byId.get(id)).filter(Boolean) as UspKaufgrund[];
  function down(idx: number, e: React.PointerEvent<HTMLDivElement>) {
    dragIndex.current = idx; (e.target as HTMLElement).setPointerCapture(e.pointerId);
    if (!order) setOrder(kaufgruende.map(k => k.id));
  }
  function enter(idx: number) {
    if (dragIndex.current === null || dragIndex.current === idx) return;
    setOrder(prev => { const arr = [...(prev ?? kaufgruende.map(k => k.id))]; const [m] = arr.splice(dragIndex.current as number, 1); arr.splice(idx, 0, m); dragIndex.current = idx; return arr; });
  }
  function up() { if (dragIndex.current !== null && order) reorder.mutate(order); dragIndex.current = null; }
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-on-surface-variant)' }}>Finale Kaufgründe</span>
      <div className="flex flex-col gap-1.5">
        {ordered.map((k, idx) => (
          <UspKaufgrundRow key={k.id} productId={productId} index={idx} kaufgrund={k}
            dragHandleProps={{ onPointerDown: (e) => down(idx, e), onPointerEnter: () => enter(idx), onPointerUp: up }} />
        ))}
      </div>
      <button type="button" onClick={() => create.mutate(undefined)} className="self-start px-2.5 py-1 rounded-md text-xs flex items-center gap-1.5"
        style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>Kaufgrund
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck + Commit**

Run: `cd "<repo>/frontend" && npx tsc --noEmit` → clean.
```bash
git add "frontend/src/components/amazon/usp/UspBeispiele.tsx" "frontend/src/components/amazon/usp/UspKaufgrundRow.tsx" "frontend/src/components/amazon/usp/UspKaufgruende.tsx"
git commit -m "feat(amazon-usp): Beispiele-Formular + Kaufgruende-Liste" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Komponenten — Dateien

**Files:** Create `frontend/src/components/amazon/usp/UspFiles.tsx`, `DeleteUspFileDialog.tsx`

- [ ] **Step 1: `DeleteUspFileDialog.tsx`**
```tsx
interface Props { name: string; onConfirm: () => void; onClose: () => void; }
export function DeleteUspFileDialog({ name, onConfirm, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="rounded-xl p-5 w-[90%] max-w-sm" style={{ background: 'var(--color-surface-container-high)', border: '1px solid rgba(255,255,255,0.08)' }} onClick={(e) => e.stopPropagation()}>
        <p className="mb-4" style={{ color: 'var(--color-on-surface)' }}>Datei „{name || 'Datei'}" wird dauerhaft gelöscht.</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-md text-sm" style={{ background: 'var(--color-surface-container)', color: 'var(--color-on-surface)' }}>Abbrechen</button>
          <button type="button" onClick={() => { onConfirm(); onClose(); }} className="px-3 py-1.5 rounded-md text-sm" style={{ background: '#7f1d1d', color: '#fecaca' }}>Löschen</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `UspFiles.tsx`**
```tsx
import { useEffect, useRef, useState } from 'react';
import { getUspFileObjectUrl, type UspFile } from '../../../api/amazon.api';
import { useUploadUspFile, useDeleteUspFile } from '../../../hooks/amazon/useUsp';
import { DeleteUspFileDialog } from './DeleteUspFileDialog';

const MAX_BYTES = 20 * 1024 * 1024;

function FileCard({ productId, file, onRequestDelete }: { productId: number; file: UspFile; onRequestDelete: () => void }) {
  const isImage = file.mime.startsWith('image/');
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!isImage) return;
    let revoked = false; let url: string | null = null;
    getUspFileObjectUrl(productId, file.id).then(u => { if (revoked) { URL.revokeObjectURL(u); return; } url = u; setSrc(u); }).catch(() => setSrc(null));
    return () => { revoked = true; if (url) URL.revokeObjectURL(url); };
  }, [isImage, productId, file.id]);
  async function download() {
    const url = await getUspFileObjectUrl(productId, file.id);
    const a = document.createElement('a'); a.href = url; a.download = file.original_name || 'datei'; a.click();
  }
  return (
    <div className="rounded-lg p-2 flex flex-col gap-1.5" style={{ width: 140, background: 'var(--color-surface-container)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="rounded-md flex items-center justify-center overflow-hidden" style={{ height: 90, background: 'var(--color-surface-container-low)' }}>
        {isImage && src
          ? <img src={src} alt="" className="w-full h-full object-cover" />
          : <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'var(--color-on-surface-variant)' }}>description</span>}
      </div>
      <span className="text-xs truncate" style={{ color: 'var(--color-on-surface)' }} title={file.original_name}>{file.original_name || 'Datei'}</span>
      <div className="flex items-center gap-1">
        <button type="button" onClick={download} className="flex-1 px-2 py-1 rounded-md text-xs flex items-center justify-center gap-1"
          style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>download</span>Laden
        </button>
        <button type="button" onClick={onRequestDelete} className="p-1 rounded-md" style={{ color: '#fca5a5' }} aria-label="Datei löschen">
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
        </button>
      </div>
    </div>
  );
}

export function UspFiles({ productId, files }: { productId: number; files: UspFile[] }) {
  const upload = useUploadUspFile(productId);
  const del = useDeleteUspFile(productId);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<UspFile | null>(null);
  function pick(f: File | undefined | null) {
    if (!f) return;
    if (f.size > MAX_BYTES) { setError('Datei ist größer als 20 MB.'); return; }
    setError(null); upload.mutate(f);
  }
  return (
    <div className="flex flex-col gap-2"
      onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files?.[0]); }}>
      <span className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-on-surface-variant)' }}>Dateien & Bild-Ideen</span>
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {files.map(f => <FileCard key={f.id} productId={productId} file={f} onRequestDelete={() => setPendingDelete(f)} />)}
        </div>
      )}
      <button type="button" onClick={() => fileInput.current?.click()} className="self-start px-2.5 py-1 rounded-md text-xs flex items-center gap-1.5"
        style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>upload_file</span>Datei hochladen
      </button>
      <input ref={fileInput} type="file" className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
      {error && <p className="text-xs" style={{ color: '#fca5a5' }}>{error}</p>}
      {pendingDelete && (
        <DeleteUspFileDialog name={pendingDelete.original_name} onConfirm={() => del.mutate(pendingDelete.id)} onClose={() => setPendingDelete(null)} />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + Commit**

Run: `cd "<repo>/frontend" && npx tsc --noEmit` → clean.
```bash
git add "frontend/src/components/amazon/usp/UspFiles.tsx" "frontend/src/components/amazon/usp/DeleteUspFileDialog.tsx"
git commit -m "feat(amazon-usp): Dateien-Bereich (Upload/Vorschau/Download/Loeschen)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: `UspPersonal`-Block + Einbindung in `UspSection`

**Files:** Create `frontend/src/components/amazon/usp/UspPersonal.tsx`; Modify `frontend/src/components/amazon/usp/UspSection.tsx`

- [ ] **Step 1: `UspPersonal.tsx`**
```tsx
import { useState } from 'react';
import { type UspPayload } from '../../../api/amazon.api';
import { UspBeispiele } from './UspBeispiele';
import { UspKaufgruende } from './UspKaufgruende';
import { UspFiles } from './UspFiles';

function expandKey(p: number) { return `amazon.usp.personal.${p}`; }
function readExpanded(p: number): boolean { try { return localStorage.getItem(expandKey(p)) === '1'; } catch { return false; } }

export function UspPersonal({ productId, data }: { productId: number; data: UspPayload }) {
  const [expanded, setExpanded] = useState(() => readExpanded(productId));
  function toggle() {
    setExpanded(prev => { const next = !prev; try { localStorage.setItem(expandKey(productId), next ? '1' : '0'); } catch { /* ignore */ } return next; });
  }
  return (
    <div className="mt-5 rounded-lg" style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'var(--color-surface-container-low)' }}>
      <button type="button" onClick={toggle} className="w-full flex items-center gap-2 px-3 py-2 text-left">
        <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--color-on-surface-variant)' }}>{expanded ? 'expand_more' : 'chevron_right'}</span>
        <span className="text-sm font-semibold" style={{ color: 'var(--color-on-surface)' }}>Persönlich</span>
        <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>nur für dich · nicht im PDF</span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 flex flex-col gap-5">
          <UspBeispiele productId={productId} meta={data.meta} />
          <UspKaufgruende productId={productId} kaufgruende={data.kaufgruende} />
          <UspFiles productId={productId} files={data.files} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: In `UspSection.tsx` einbinden**

Import ergänzen (bei den anderen `./Usp*`-Imports):
```ts
import { UspPersonal } from './UspPersonal';
```
Unmittelbar nach `<UspVersions productId={productId} />` ergänzen:
```tsx
              <UspPersonal productId={productId} data={data} />
```
(`data` ist im `{data && ( … )}`-Block verfügbar.)

- [ ] **Step 3: Typecheck + Build**

Run: `cd "<repo>/frontend" && npx tsc --noEmit && npx vite build`
Expected: PASS + Build erfolgreich.

- [ ] **Step 4: Commit**
```bash
git add "frontend/src/components/amazon/usp/UspPersonal.tsx" "frontend/src/components/amazon/usp/UspSection.tsx"
git commit -m "feat(amazon-usp): aufklappbarer Persoenlich-Block in der USP-Sektion" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Verifikation (UAT)

- [ ] **Step 1:** Backend neu starten (Migration 075 + Auto-Backup). Stale Backend: `lsof -i :3001`, `pkill -f "tsx watch"`, neu starten.
- [ ] **Step 2:** „Persönlich"-Block aufklappen (Zustand bleibt nach Reload).
- [ ] **Step 3:** Beispiele-Felder ausfüllen → bleibt nach Reload.
- [ ] **Step 4:** Kaufgrund anlegen/bearbeiten/per Drag sortieren/löschen → bleibt.
- [ ] **Step 5:** Bild **und** PDF hochladen → Bild mit Vorschau, PDF mit Symbol+Name; herunterladen lädt Original; löschen entfernt.
- [ ] **Step 6:** Hersteller-PDF exportieren → nichts vom Persönlich-Block ist drin.
- [ ] **Step 7:** Abschluss; bei Abweichung → systematic-debugging.

---

## Self-Review

**Spec coverage:** Migration (4 Felder + 2 Tabellen) → T1 ✅ · Meta-Felder + Kaufgründe CRUD/Reorder + Payload → T2 ✅ · Dateien Upload/Serve/Delete + Payload → T3 ✅ · API → T4 ✅ · Hooks → T5 ✅ · Beispiele + Kaufgründe-Komponenten → T6 ✅ · Dateien-Komponenten → T7 ✅ · Persönlich-Block + Einbindung → T8 ✅ · UAT → T9 ✅. Datensicherheit additiv → T1.

**Placeholder scan:** keine TBD/TODO. Der temporäre `loadFiles`-Platzhalter in T2 ist bewusst und wird in T3 ersetzt (explizit beschrieben).

**Type consistency:** `UspKaufgrund`/`UspFile`/`UspMeta`(+4 Felder)/`UspPayload`(+kaufgruende/files) einheitlich über API (T4), Hooks (T5), Komponenten (T6–8). Endpunkt-Pfade Backend (T2/T3) ↔ API (T4) identisch. Reorder-Routen-Reihenfolge (`reorder` vor `:kId`) beachtet. `inval`/`key`-Hilfen in T5 mit Fallback-Hinweis abgesichert.
