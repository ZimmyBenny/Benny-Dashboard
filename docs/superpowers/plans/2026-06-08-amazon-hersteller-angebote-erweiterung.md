# Amazon Hersteller — Angebote-Erweiterung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Angebote um Währung (USD/EUR) + Umrechnungskurs (pro Produkt) + EUR-Preis im Vergleich + Datei-Upload je Angebot + „Aktuellstes"-Markierung (exklusiv je Hersteller) + Machbarkeits-Spalte (aus USP) erweitern.

**Architecture:** Additive Spalten/Tabellen am bestehenden Hersteller-Modul. Phase A: Währung/Kurs/Aktuellstes + EUR-Spalte. Phase B: Dateien je Angebot. Phase C: Machbarkeit (read-only USP-Join).

**Tech Stack:** Express 5 + better-sqlite3; React 19 + TanStack Query + Tailwind v4; Vitest + supertest.

**Spec:** `docs/superpowers/specs/2026-06-08-amazon-hersteller-angebote-erweiterung-design.md`

---

## File Structure
- Create migrations `079_…`, `080_…` (Phase A), `081_…` (Phase B) in `backend/src/db/migrations/`.
- Modify `backend/src/routes/amazon.manufacturers.routes.ts` (alle Phasen).
- Modify `backend/test/integration.amazon_manufacturers.test.ts` (alle Phasen).
- Modify `frontend/src/api/amazon.api.ts`, `frontend/src/hooks/amazon/useManufacturers.ts` (A,B,C).
- Modify `frontend/src/components/amazon/manufacturers/ManufacturerOffers.tsx` (A,B),
  `ManufacturerComparison.tsx` (A,C), `ManufacturersSection.tsx` (A).

---

# PHASE A — Währung, Kurs, Aktuellstes, EUR-Spalte

### Task A1: Migrationen 079 + 080

- [ ] **Step 1:** `backend/src/db/migrations/079_amazon_manufacturer_offer_currency_latest.sql`:
```sql
ALTER TABLE amazon_manufacturer_offers
  ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD','EUR'));
ALTER TABLE amazon_manufacturer_offers
  ADD COLUMN is_latest INTEGER NOT NULL DEFAULT 0 CHECK (is_latest IN (0,1));
```
- [ ] **Step 2:** `backend/src/db/migrations/080_amazon_manufacturer_settings.sql`:
```sql
CREATE TABLE amazon_manufacturer_settings (
  product_id   INTEGER PRIMARY KEY REFERENCES amazon_products(id),
  usd_eur_rate TEXT,
  updated_at   INTEGER NOT NULL DEFAULT (unixepoch())
);
```
- [ ] **Step 3: Commit**
```bash
git add backend/src/db/migrations/079_amazon_manufacturer_offer_currency_latest.sql backend/src/db/migrations/080_amazon_manufacturer_settings.sql
git commit -m "feat(amazon-hersteller): Migr 079/080 — Angebot Waehrung/Aktuellstes + Kurs-Settings"
```

---

### Task A2: Backend Phase A (TDD)

**Files:** Modify `backend/src/routes/amazon.manufacturers.routes.ts`; Test `backend/test/integration.amazon_manufacturers.test.ts`.

- [ ] **Step 1: Failing-Tests anhängen** (in `describe('Amazon Hersteller — CRUD', …)` ergänzen):
```ts
  it('Offer-PATCH currency: USD/EUR ok, anderes -> 400', async () => {
    const pid = makeProduct(db);
    const mId = (await request(app).post(`/api/amazon/products/${pid}/manufacturers`).send({ name: 'A' })).body.manufacturer.id;
    const oId = (await request(app).post(`/api/amazon/products/${pid}/manufacturers/${mId}/offers`).send({})).body.offer.id;
    expect((await request(app).get(`/api/amazon/products/${pid}/manufacturers`)).body.manufacturers[0].offers[0].currency).toBe('USD');
    const ok = await request(app).patch(`/api/amazon/products/${pid}/manufacturers/${mId}/offers/${oId}`).send({ currency: 'EUR' });
    expect(ok.status).toBe(200);
    expect(ok.body.offer.currency).toBe('EUR');
    expect((await request(app).patch(`/api/amazon/products/${pid}/manufacturers/${mId}/offers/${oId}`).send({ currency: 'GBP' })).status).toBe(400);
  });

  it('is_latest exklusiv je Hersteller', async () => {
    const pid = makeProduct(db);
    const mId = (await request(app).post(`/api/amazon/products/${pid}/manufacturers`).send({ name: 'A' })).body.manufacturer.id;
    const o1 = (await request(app).post(`/api/amazon/products/${pid}/manufacturers/${mId}/offers`).send({})).body.offer.id;
    const o2 = (await request(app).post(`/api/amazon/products/${pid}/manufacturers/${mId}/offers`).send({})).body.offer.id;
    await request(app).patch(`/api/amazon/products/${pid}/manufacturers/${mId}/offers/${o1}`).send({ is_latest: 1 });
    await request(app).patch(`/api/amazon/products/${pid}/manufacturers/${mId}/offers/${o2}`).send({ is_latest: 1 });
    const offers = (await request(app).get(`/api/amazon/products/${pid}/manufacturers`)).body.manufacturers[0].offers as Array<{ id: number; is_latest: number }>;
    expect(offers.find(o => o.id === o1)!.is_latest).toBe(0);
    expect(offers.find(o => o.id === o2)!.is_latest).toBe(1);
    expect((await request(app).patch(`/api/amazon/products/${pid}/manufacturers/${mId}/offers/${o1}`).send({ is_latest: 2 })).status).toBe(400);
  });

  it('Settings: GET liefert settings, PATCH setzt/leert usd_eur_rate', async () => {
    const pid = makeProduct(db);
    const g = await request(app).get(`/api/amazon/products/${pid}/manufacturers`);
    expect(g.body.settings).toMatchObject({ usd_eur_rate: null });
    const p = await request(app).patch(`/api/amazon/products/${pid}/manufacturers/settings`).send({ usd_eur_rate: ' 0,92 ' });
    expect(p.status).toBe(200);
    expect(p.body.settings.usd_eur_rate).toBe('0,92');
    expect((await request(app).get(`/api/amazon/products/${pid}/manufacturers`)).body.settings.usd_eur_rate).toBe('0,92');
    const clr = await request(app).patch(`/api/amazon/products/${pid}/manufacturers/settings`).send({ usd_eur_rate: '' });
    expect(clr.body.settings.usd_eur_rate).toBeNull();
  });
```

- [ ] **Step 2: Run — MUST FAIL**
`cd backend && npx vitest run test/integration.amazon_manufacturers.test.ts`

- [ ] **Step 3: Implementierung** in `amazon.manufacturers.routes.ts`:

a) Nach `function ensureProduct` einen Settings-Helfer + Interface ergänzen:
```ts
interface SettingsRow { product_id: number; usd_eur_rate: string | null; updated_at: number; }
function getOrCreateSettings(productId: number): SettingsRow {
  let row = db.prepare(`SELECT * FROM amazon_manufacturer_settings WHERE product_id = ?`).get(productId) as SettingsRow | undefined;
  if (!row) {
    db.prepare(`INSERT INTO amazon_manufacturer_settings (product_id) VALUES (?)`).run(productId);
    row = db.prepare(`SELECT * FROM amazon_manufacturer_settings WHERE product_id = ?`).get(productId) as SettingsRow;
  }
  return row;
}
```
Außerdem `OfferRow` um `currency: string; is_latest: number;` erweitern (die `SELECT *`-Loader liefern die Spalten ohnehin).

b) In der GET-Route `/products/:id/manufacturers` die Antwort um `settings` erweitern:
```ts
  res.json({ manufacturers: rows.map(withOffers), settings: getOrCreateSettings(id) });
```

c) Neue Settings-Route — **VOR** `router.patch('/products/:id/manufacturers/:mId', …)` einfügen (sonst fängt `:mId` den Pfad „settings"):
```ts
router.patch('/products/:id/manufacturers/settings', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) { res.status(404).json({ error: 'not found' }); return; }
  const raw = (req.body as { usd_eur_rate?: unknown })?.usd_eur_rate;
  let value: string | null;
  if (raw === undefined || raw === null) value = null;
  else if (typeof raw !== 'string') { res.status(400).json({ error: 'invalid usd_eur_rate' }); return; }
  else { const t = raw.trim(); value = t.length === 0 ? null : t.slice(0, 50); }
  getOrCreateSettings(id);
  db.prepare(`UPDATE amazon_manufacturer_settings SET usd_eur_rate = ?, updated_at = unixepoch() WHERE product_id = ?`).run(value, id);
  res.json({ settings: getOrCreateSettings(id) });
});
```

d) In der Offer-PATCH-Route `/products/:id/manufacturers/:mId/offers/:oId` die Sonderfelder `currency` und `is_latest` ergänzen. Nach dem bestehenden Text-Felder-Loop (vor dem `if (sets.length === 0)`-Block) einfügen:
```ts
  if (body.currency !== undefined) {
    if (body.currency !== 'USD' && body.currency !== 'EUR') { res.status(400).json({ error: 'invalid currency' }); return; }
    sets.push('currency = ?'); vals.push(body.currency);
  }
  let setLatestExclusive = false;
  if (body.is_latest !== undefined) {
    if (body.is_latest !== 0 && body.is_latest !== 1) { res.status(400).json({ error: 'invalid is_latest' }); return; }
    sets.push('is_latest = ?'); vals.push(body.is_latest);
    if (body.is_latest === 1) setLatestExclusive = true;
  }
```
Und den Schreib-Teil so anpassen, dass bei `setLatestExclusive` die anderen Angebote desselben Herstellers in **einer Transaktion** entmarkiert werden. Ersetze den bestehenden Block
```ts
  if (sets.length === 0) { res.json({ offer: loadOffer(mId, oId) as OfferRow }); return; }
  sets.push('updated_at = unixepoch()');
  db.prepare(`UPDATE amazon_manufacturer_offers SET ${sets.join(', ')} WHERE id = ?`).run(...vals, oId);
  res.json({ offer: loadOffer(mId, oId) as OfferRow });
```
durch:
```ts
  if (sets.length === 0) { res.json({ offer: loadOffer(mId, oId) as OfferRow }); return; }
  sets.push('updated_at = unixepoch()');
  db.transaction(() => {
    db.prepare(`UPDATE amazon_manufacturer_offers SET ${sets.join(', ')} WHERE id = ?`).run(...vals, oId);
    if (setLatestExclusive) db.prepare(`UPDATE amazon_manufacturer_offers SET is_latest = 0 WHERE manufacturer_id = ? AND id != ?`).run(mId, oId);
  })();
  res.json({ offer: loadOffer(mId, oId) as OfferRow });
```
(`sets`/`vals` sind in dieser Route bereits `string[]`/`unknown[]`.)

- [ ] **Step 4: Run — MUST PASS** (`-t` für die drei neuen, dann volle Suite)
`cd backend && npx vitest run test/integration.amazon_manufacturers.test.ts` → grün.
`cd backend && npx vitest run` → alle grün.

- [ ] **Step 5: Commit**
```bash
git add backend/src/routes/amazon.manufacturers.routes.ts backend/test/integration.amazon_manufacturers.test.ts
git commit -m "feat(amazon-hersteller): Backend Waehrung/Aktuellstes/Kurs-Settings"
```

---

### Task A3: Frontend Phase A

**Files:** `frontend/src/api/amazon.api.ts`, `frontend/src/hooks/amazon/useManufacturers.ts`, `ManufacturerOffers.tsx`, `ManufacturersSection.tsx`, `ManufacturerComparison.tsx`.

- [ ] **Step 1: API** (`amazon.api.ts`)
  - `ManufacturerOffer` interface: Felder ergänzen `currency: 'USD' | 'EUR';` und `is_latest: number;`.
  - `Manufacturer`/Payload: `ManufacturersPayload` ändern zu:
    `export interface ManufacturersPayload { manufacturers: Manufacturer[]; settings: { usd_eur_rate: string | null }; }`
  - `OfferPatch` ergänzen: `currency` und `is_latest` aufnehmen — ändere
    `export type OfferPatch = Partial<Pick<ManufacturerOffer, 'menge_variante' | 'preis' | 'moq' | 'lieferzeit' | 'datum' | 'notiz'>>;`
    zu
    `export type OfferPatch = Partial<Pick<ManufacturerOffer, 'menge_variante' | 'preis' | 'moq' | 'lieferzeit' | 'datum' | 'notiz' | 'currency' | 'is_latest'>>;`
  - Neue Funktion:
    ```ts
    export async function updateManufacturerSettings(productId: number, usdEurRate: string): Promise<{ usd_eur_rate: string | null }> {
      return ((await apiClient.patch(`/amazon/products/${productId}/manufacturers/settings`, { usd_eur_rate: usdEurRate })).data as { settings: { usd_eur_rate: string | null } }).settings;
    }
    ```

- [ ] **Step 2: Hooks** (`useManufacturers.ts`)
  - `updateManufacturerSettings` zum Import aus `'../../api/amazon.api'` hinzufügen.
  - Hook ergänzen:
    ```ts
    export function useUpdateManufacturerSettings(productId: number) {
      const inval = useInval(productId);
      return useMutation({ mutationFn: (usdEurRate: string) => updateManufacturerSettings(productId, usdEurRate), onSettled: inval });
    }
    ```
  - EUR-Helfer ergänzen (nutzt das vorhandene `parsePreis`):
    ```ts
    export function eurPreis(offer: { preis: string | null; currency: 'USD' | 'EUR' }, rate: number | null): number | null {
      const p = parsePreis(offer.preis);
      if (p === null) return null;
      if (offer.currency === 'EUR') return p;
      if (rate === null) return null;
      return p * rate;
    }
    ```

- [ ] **Step 3: `ManufacturerOffers.tsx`** — Währungs-Dropdown + „Aktuell"-Stern je Zeile.

  Im `OfferRow` direkt **nach** dem Preis-`<input>` (das mit `placeholder="Preis"`) ein Währungs-Select einfügen:
  ```tsx
      <select
        value={offer.currency}
        onChange={(e) => update.mutate({ mId, oId: offer.id, patch: { currency: e.target.value as 'USD' | 'EUR' } })}
        className="px-2 py-1 rounded-md text-xs"
        style={inputStyle}
      >
        <option value="USD">USD</option>
        <option value="EUR">EUR</option>
      </select>
  ```
  Und direkt **vor** dem Lösch-Bereich (vor dem `{confirmDelete ? … }`) einen Stern-Toggle einfügen:
  ```tsx
      <button
        type="button"
        onClick={() => update.mutate({ mId, oId: offer.id, patch: { is_latest: offer.is_latest ? 0 : 1 } })}
        className="p-1 rounded-md flex-shrink-0"
        style={{ color: offer.is_latest ? '#fbbf24' : 'var(--color-on-surface-variant)' }}
        title={offer.is_latest ? 'Aktuellstes Angebot' : 'Als aktuellstes markieren'}
        aria-label="Aktuellstes Angebot"
      >
        <span className="material-symbols-outlined" style={{ fontSize: 18, fontVariationSettings: offer.is_latest ? "'FILL' 1" : "'FILL' 0" }}>star</span>
      </button>
  ```

- [ ] **Step 4: `ManufacturersSection.tsx`** — Kurs-Feld + Rate an Vergleich geben.

  a) Import ergänzen: `useUpdateManufacturerSettings` aus `'../../../hooks/amazon/useManufacturers'`, und `parsePreis` ebenfalls von dort.
  b) Im Component-Body (nach `const reorder = …`): `const updateSettings = useUpdateManufacturerSettings(productId);` und lokalen State für das Kurs-Feld:
     ```tsx
     const [rateInput, setRateInput] = useState<string | null>(null);
     ```
  c) Nach `const { manufacturers } = data;` ergänzen:
     ```tsx
     const rateValue = rateInput ?? (data.settings.usd_eur_rate ?? '');
     const rate = parsePreis(data.settings.usd_eur_rate);
     ```
  d) Im expandierten Bereich, **über** der Hersteller-Liste (vor `{ordered.map(…)}`), ein Kurs-Feld rendern:
     ```tsx
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>1 USD =</span>
            <input
              value={rateValue}
              onChange={(e) => setRateInput(e.target.value)}
              onBlur={() => { if (rateInput !== null && rateInput !== (data.settings.usd_eur_rate ?? '')) updateSettings.mutate(rateInput); setRateInput(null); }}
              placeholder="z. B. 0,92"
              className="px-2 py-1 rounded-md text-xs w-24"
              style={{ background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}
            />
            <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>€</span>
          </div>
     ```
  e) Den Vergleich mit der Rate aufrufen: `<ManufacturerComparison manufacturers={manufacturers} rate={rate} />`.

- [ ] **Step 5: `ManufacturerComparison.tsx`** — EUR-Spalte + Sortierung/Badge.

  a) Signatur/Props erweitern: `import { parsePreis, eurPreis } from '../../../hooks/amazon/useManufacturers';` und
     `interface Props { manufacturers: Manufacturer[]; rate: number | null; }` → `export function ManufacturerComparison({ manufacturers, rate }: Props)`.
  b) Sortierung auf EUR umstellen — ersetze die `sorted`-Berechnung so, dass nach `eurPreis(offer, rate)` aufsteigend sortiert wird (null ans Ende), und `cheapestId` = erste Zeile mit nicht-null EUR:
     ```tsx
     const eurOf = (o: { preis: string | null; currency: 'USD' | 'EUR' }) => eurPreis(o, rate);
     const sorted = [...rows].sort((a, b) => {
       const pa = eurOf(a.offer); const pb = eurOf(b.offer);
       if (pa !== null && pb !== null) return pa - pb;
       if (pa !== null) return -1;
       if (pb !== null) return 1;
       return 0;
     });
     const cheapestId = (() => { for (const r of sorted) if (eurOf(r.offer) !== null) return r.offer.id; return null; })();
     const fmtEur = (n: number | null) => n === null ? '—' : n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
     ```
  c) Im `<thead>`: nach der „Preis"-Spalte eine `<th>EUR-Preis</th>` ergänzen (gleiche Klassen).
  d) In der Preis-Zelle die Währung mit anzeigen: `{offer.preis ? `${offer.preis} ${offer.currency}` : '—'}`. Direkt danach eine EUR-Zelle: `<td className="px-3 py-2 text-xs" style={{ color: isCheapest ? '#34d399' : 'var(--color-on-surface)' }}>{fmtEur(eurOf(offer))}</td>`.
  e) Im Hersteller-Zellen-Text ein „Aktuell"-Badge anhängen, wenn `offer.is_latest`:
     ```tsx
        {herstellerName}{offer.is_latest ? <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px]" style={{ background: '#fbbf24', color: '#08131f' }}>Aktuell</span> : null}
     ```

- [ ] **Step 6: Typecheck + Build**
`cd frontend && npx tsc --noEmit` → PASS. `cd frontend && npx vite build` → PASS.

- [ ] **Step 7: Commit**
```bash
git add frontend/src/api/amazon.api.ts frontend/src/hooks/amazon/useManufacturers.ts frontend/src/components/amazon/manufacturers/
git commit -m "feat(amazon-hersteller): Frontend Waehrung/Kurs/EUR-Vergleich/Aktuellstes"
```

---

# PHASE B — Dateien je Angebot

### Task B1: Migration 081 + Backend Offer-Files (TDD)

**Files:** Create `081_…`; Modify `amazon.manufacturers.routes.ts`; Test erweitern.

- [ ] **Step 1:** `backend/src/db/migrations/081_amazon_manufacturer_offer_files.sql`:
```sql
CREATE TABLE amazon_manufacturer_offer_files (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  offer_id      INTEGER NOT NULL REFERENCES amazon_manufacturer_offers(id),
  sort_order    INTEGER NOT NULL DEFAULT 0,
  file_path     TEXT    NOT NULL,
  original_name TEXT,
  mime          TEXT,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);
```

- [ ] **Step 2: Failing-Tests** (in den CRUD-describe ergänzen):
```ts
  it('Angebots-Datei: Upload + GET-Liste + Loeschen; fremdes Angebot 404', async () => {
    const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    const pid = makeProduct(db);
    const mId = (await request(app).post(`/api/amazon/products/${pid}/manufacturers`).send({ name: 'A' })).body.manufacturer.id;
    const oId = (await request(app).post(`/api/amazon/products/${pid}/manufacturers/${mId}/offers`).send({})).body.offer.id;
    const up = await request(app).post(`/api/amazon/products/${pid}/manufacturers/${mId}/offers/${oId}/files`).attach('file', PNG, { filename: 'angebot.png', contentType: 'image/png' });
    expect(up.status).toBe(201);
    const fId = up.body.file.id;
    const list = await request(app).get(`/api/amazon/products/${pid}/manufacturers`);
    expect(list.body.manufacturers[0].offers[0].files.map((f: { id: number }) => f.id)).toEqual([fId]);
    const get = await request(app).get(`/api/amazon/products/${pid}/manufacturers/${mId}/offers/${oId}/files/${fId}`);
    expect(get.status).toBe(200);
    const del = await request(app).delete(`/api/amazon/products/${pid}/manufacturers/${mId}/offers/${oId}/files/${fId}`);
    expect(del.status).toBe(204);
    expect((await request(app).get(`/api/amazon/products/${pid}/manufacturers`)).body.manufacturers[0].offers[0].files).toEqual([]);
    // fremdes Angebot
    const mId2 = (await request(app).post(`/api/amazon/products/${pid}/manufacturers`).send({ name: 'B' })).body.manufacturer.id;
    expect((await request(app).post(`/api/amazon/products/${pid}/manufacturers/${mId2}/offers/${oId}/files`).attach('file', PNG, { filename: 'x.png', contentType: 'image/png' })).status).toBe(404);
  });
```

- [ ] **Step 3: Run — MUST FAIL.**
`cd backend && npx vitest run test/integration.amazon_manufacturers.test.ts -t "Angebots-Datei"`

- [ ] **Step 4: Implementierung** in `amazon.manufacturers.routes.ts`.

  a) Oben Imports/Storage ergänzen (Muster aus `amazon.usp.routes.ts` `fileUpload`/`deleteFilesFile`):
  ```ts
  import multer from 'multer';
  import path from 'path';
  import os from 'os';
  import fs from 'fs';
  import crypto from 'crypto';

  const OFFER_FILES_DIR = path.join(os.homedir(), '.local', 'share', 'benny-dashboard', 'amazon-manufacturer-offer-files');
  if (!fs.existsSync(OFFER_FILES_DIR)) fs.mkdirSync(OFFER_FILES_DIR, { recursive: true });
  const offerFileUpload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, OFFER_FILES_DIR),
      filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname) || ''}`),
    }),
    limits: { fileSize: 20 * 1024 * 1024 },
  });
  function deleteOfferFileFromDisk(filename: string | null | undefined) {
    if (!filename) return;
    const abs = path.resolve(OFFER_FILES_DIR, filename);
    if (!abs.startsWith(path.resolve(OFFER_FILES_DIR) + path.sep)) return;
    try { fs.unlinkSync(abs); } catch { /* schon weg */ }
  }
  interface OfferFileRow { id: number; offer_id: number; sort_order: number; file_path: string; original_name: string | null; mime: string | null; created_at: number; }
  function loadOfferFiles(offerId: number): OfferFileRow[] {
    return db.prepare(`SELECT * FROM amazon_manufacturer_offer_files WHERE offer_id = ? ORDER BY sort_order, id`).all(offerId) as OfferFileRow[];
  }
  function loadOfferFile(offerId: number, fId: number): OfferFileRow | undefined {
    return db.prepare(`SELECT * FROM amazon_manufacturer_offer_files WHERE id = ? AND offer_id = ?`).get(fId, offerId) as OfferFileRow | undefined;
  }
  ```
  b) `withOffers`/`loadOffers` so anpassen, dass jedes Offer `files` enthält. Ersetze `function withOffers(m)` so, dass die Offers jeweils `{ ...offer, files: loadOfferFiles(offer.id) }` bekommen — konkret: in `withOffers` `offers: loadOffers(m.id).map(o => ({ ...o, files: loadOfferFiles(o.id) }))`.
  c) Routen ergänzen (Ownership-Kette Produkt→Hersteller→Angebot→Datei). **Die `…/files`-POST/GET/DELETE** sind eindeutige Sub-Pfade; reorder gibt es hier nicht:
  ```ts
  router.post('/products/:id/manufacturers/:mId/offers/:oId/files', (req: Request, res: Response) => {
    const id = Number(req.params.id); const mId = Number(req.params.mId); const oId = Number(req.params.oId);
    if (![id, mId, oId].every(Number.isInteger) || !ensureProduct(id) || !loadManufacturer(id, mId) || !loadOffer(mId, oId)) { res.status(404).json({ error: 'not found' }); return; }
    offerFileUpload.single('file')(req, res, (err: unknown) => {
      if (err) { res.status(400).json({ error: err instanceof Error ? err.message : 'upload failed' }); return; }
      const file = (req as Request & { file?: { filename: string; originalname: string; mimetype: string } }).file;
      if (!file) { res.status(400).json({ error: 'no file' }); return; }
      const maxOrder = (db.prepare(`SELECT COALESCE(MAX(sort_order),0) AS m FROM amazon_manufacturer_offer_files WHERE offer_id = ?`).get(oId) as { m: number }).m;
      const r = db.prepare(`INSERT INTO amazon_manufacturer_offer_files (offer_id, sort_order, file_path, original_name, mime) VALUES (?, ?, ?, ?, ?)`)
        .run(oId, maxOrder + 1, file.filename, file.originalname.slice(0, 300), file.mimetype.slice(0, 200));
      res.status(201).json({ file: db.prepare(`SELECT * FROM amazon_manufacturer_offer_files WHERE id = ?`).get(r.lastInsertRowid) as OfferFileRow });
    });
  });

  router.get('/products/:id/manufacturers/:mId/offers/:oId/files/:fId', (req: Request, res: Response) => {
    const id = Number(req.params.id); const mId = Number(req.params.mId); const oId = Number(req.params.oId); const fId = Number(req.params.fId);
    if (![id, mId, oId, fId].every(Number.isInteger) || !ensureProduct(id) || !loadManufacturer(id, mId) || !loadOffer(mId, oId)) { res.status(404).end(); return; }
    const f = loadOfferFile(oId, fId);
    if (!f) { res.status(404).end(); return; }
    const abs = path.resolve(OFFER_FILES_DIR, f.file_path);
    if (!abs.startsWith(path.resolve(OFFER_FILES_DIR) + path.sep) || !fs.existsSync(abs)) { res.status(404).end(); return; }
    res.setHeader('Content-Type', f.mime || 'application/octet-stream');
    const ascii = (f.original_name ?? 'datei').replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
    res.setHeader('Content-Disposition', `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(f.original_name ?? 'datei')}`);
    fs.createReadStream(abs).pipe(res);
  });

  router.delete('/products/:id/manufacturers/:mId/offers/:oId/files/:fId', (req: Request, res: Response) => {
    const id = Number(req.params.id); const mId = Number(req.params.mId); const oId = Number(req.params.oId); const fId = Number(req.params.fId);
    if (![id, mId, oId, fId].every(Number.isInteger) || !ensureProduct(id) || !loadManufacturer(id, mId) || !loadOffer(mId, oId)) { res.status(404).json({ error: 'not found' }); return; }
    const f = loadOfferFile(oId, fId);
    if (!f) { res.status(404).json({ error: 'not found' }); return; }
    db.prepare(`DELETE FROM amazon_manufacturer_offer_files WHERE id = ?`).run(fId);
    deleteOfferFileFromDisk(f.file_path);
    res.status(204).end();
  });
  ```
  d) Beim Löschen eines Angebots (`DELETE …/offers/:oId`) müssen dessen Dateien mitgelöscht werden. In der bestehenden Offer-DELETE-Route die Zeile `db.prepare(\`DELETE FROM amazon_manufacturer_offers WHERE id = ?\`).run(oId);` ersetzen durch:
  ```ts
    const ofiles = loadOfferFiles(oId);
    db.transaction(() => {
      db.prepare(`DELETE FROM amazon_manufacturer_offer_files WHERE offer_id = ?`).run(oId);
      db.prepare(`DELETE FROM amazon_manufacturer_offers WHERE id = ?`).run(oId);
    })();
    ofiles.forEach(f => deleteOfferFileFromDisk(f.file_path));
  ```
  Ebenso beim Hersteller-DELETE: dort werden Angebote via `DELETE … WHERE manufacturer_id = ?` entfernt — vorher die zugehörigen Offer-Dateien (Zeilen + Platte) löschen. Erweitere die Hersteller-DELETE-Transaktion: zuerst
  ```ts
    const offerIds = (db.prepare(`SELECT id FROM amazon_manufacturer_offers WHERE manufacturer_id = ?`).all(mId) as Array<{ id: number }>).map(o => o.id);
    const fileRows = offerIds.flatMap(oid => loadOfferFiles(oid));
    db.prepare(`DELETE FROM amazon_manufacturer_offer_files WHERE offer_id IN (${offerIds.map(() => '?').join(',') || 'NULL'})`).run(...offerIds);
  ```
  (innerhalb der bestehenden Transaktion, vor dem `DELETE FROM amazon_manufacturer_offers`), und nach der Transaktion `fileRows.forEach(f => deleteOfferFileFromDisk(f.file_path));`.

- [ ] **Step 5: Run — MUST PASS** (targeted + volle Suite).

- [ ] **Step 6: Commit**
```bash
git add backend/src/db/migrations/081_amazon_manufacturer_offer_files.sql backend/src/routes/amazon.manufacturers.routes.ts backend/test/integration.amazon_manufacturers.test.ts
git commit -m "feat(amazon-hersteller): Backend Datei-Upload je Angebot"
```

---

### Task B2: Frontend Offer-Files

**Files:** `amazon.api.ts`, `useManufacturers.ts`, `ManufacturerOffers.tsx`.

- [ ] **Step 1: API** (`amazon.api.ts`)
  - Typ ergänzen:
    ```ts
    export interface OfferFile { id: number; offer_id: number; sort_order: number; file_path: string; original_name: string | null; mime: string | null; created_at: number; }
    ```
  - `ManufacturerOffer` interface: `files: OfferFile[];` ergänzen.
  - Funktionen:
    ```ts
    export async function uploadOfferFile(productId: number, mId: number, oId: number, file: File): Promise<OfferFile> {
      const fd = new FormData(); fd.append('file', file);
      return ((await apiClient.post(`/amazon/products/${productId}/manufacturers/${mId}/offers/${oId}/files`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })).data as { file: OfferFile }).file;
    }
    export async function getOfferFileObjectUrl(productId: number, mId: number, oId: number, fId: number): Promise<string> {
      const r = await apiClient.get(`/amazon/products/${productId}/manufacturers/${mId}/offers/${oId}/files/${fId}`, { responseType: 'blob' });
      return URL.createObjectURL(r.data as Blob);
    }
    export async function deleteOfferFile(productId: number, mId: number, oId: number, fId: number): Promise<void> {
      await apiClient.delete(`/amazon/products/${productId}/manufacturers/${mId}/offers/${oId}/files/${fId}`);
    }
    ```

- [ ] **Step 2: Hooks** (`useManufacturers.ts`)
  - Importe ergänzen (`uploadOfferFile`, `deleteOfferFile`).
  - Hooks:
    ```ts
    export function useUploadOfferFile(productId: number) {
      const inval = useInval(productId);
      return useMutation({ mutationFn: ({ mId, oId, file }: { mId: number; oId: number; file: File }) => uploadOfferFile(productId, mId, oId, file), onSettled: inval });
    }
    export function useDeleteOfferFile(productId: number) {
      const inval = useInval(productId);
      return useMutation({ mutationFn: ({ mId, oId, fId }: { mId: number; oId: number; fId: number }) => deleteOfferFile(productId, mId, oId, fId), onSettled: inval });
    }
    ```

- [ ] **Step 3: `ManufacturerOffers.tsx`** — Datei-Bereich je Angebot.
  Anforderungen (Muster aus `frontend/src/components/amazon/usp/UspFiles.tsx` übernehmen — Object-URL-Revoke, Download via temporärem `<a>`, Bestätigung vor Löschen):
  - Im `OfferRow` unter der Eingabe-Zeile einen kompakten Dateibereich rendern: Liste der `offer.files` (Dateiname, Download-Button, Lösch-Button mit Inline-Bestätigung), plus „Datei hochladen" (verstecktes `<input type="file">`, `onChange` → `useUploadOfferFile().mutate({ mId, oId: offer.id, file })`, max 20 MB → sonst Fehlertext).
  - Download/Anzeige über `getOfferFileObjectUrl(productId, mId, offer.id, file.id)`; Object-URL nach Gebrauch via `setTimeout(() => URL.revokeObjectURL(url), 0)` freigeben.
  - `useDeleteOfferFile().mutate({ mId, oId: offer.id, fId: file.id })` mit Inline-Bestätigung („Wirklich löschen? Ja/Nein").
  - Echte Umlaute.

- [ ] **Step 4: Typecheck + Build** → PASS.
- [ ] **Step 5: Commit**
```bash
git add frontend/src/api/amazon.api.ts frontend/src/hooks/amazon/useManufacturers.ts frontend/src/components/amazon/manufacturers/ManufacturerOffers.tsx
git commit -m "feat(amazon-hersteller): Frontend Datei-Upload je Angebot"
```

---

# PHASE C — Machbarkeits-Spalte im Vergleich

### Task C1: Backend Machbarkeit (TDD)

**Files:** Modify `amazon.manufacturers.routes.ts`; Test erweitern.

- [ ] **Step 1: Failing-Test** (in CRUD-describe; nutzt die USP-Routen → makeApp dieser Datei mountet bisher nur Manufacturers; ergänze in **diesem** Test eine lokale App, die USP + Manufacturers mountet, ODER erweitere die Datei-`makeApp` so, dass sie auch `amazon.usp.routes` mountet. Empfehlung: makeApp dieser Datei zusätzlich USP mounten — additiv, stört bestehende Tests nicht):
```ts
  it('machbarkeit aus USP fuer uebernommenen Hersteller; sonst null', async () => {
    const pid = makeProduct(db);
    // USP: zwei Punkte + ein USP-Hersteller
    await request(app).get(`/api/amazon/products/${pid}/usp`);
    const p1 = (await request(app).post(`/api/amazon/products/${pid}/usp/points`).send({ title: 'P1' })).body.point.id;
    const p2 = (await request(app).post(`/api/amazon/products/${pid}/usp/points`).send({ title: 'P2' })).body.point.id;
    const uspMan = (await request(app).post(`/api/amazon/products/${pid}/usp/manufacturers`).send({ name: 'Acme' })).body.manufacturer.id;
    // Feasibility: p1 umsetzbar, p2 teilweise
    await request(app).put(`/api/amazon/products/${pid}/usp/feasibility`).send({ point_id: p1, manufacturer_id: uspMan, status: 'umsetzbar' });
    await request(app).put(`/api/amazon/products/${pid}/usp/feasibility`).send({ point_id: p2, manufacturer_id: uspMan, status: 'teilweise' });
    // uebernehmen -> Stammeintrag verknuepft
    await request(app).post(`/api/amazon/products/${pid}/usp/manufacturers/${uspMan}/uebernehmen`).send({});
    const list = await request(app).get(`/api/amazon/products/${pid}/manufacturers`);
    const m = list.body.manufacturers[0];
    expect(m.machbarkeit).toMatchObject({ umsetzbar: 1, teilweise: 1, nicht: 0, offen: 0, total: 2 });
    // direkt angelegter Hersteller -> null
    await request(app).post(`/api/amazon/products/${pid}/manufacturers`).send({ name: 'Direkt' });
    const list2 = await request(app).get(`/api/amazon/products/${pid}/manufacturers`);
    const direkt = (list2.body.manufacturers as Array<{ name: string; machbarkeit: unknown }>).find(x => x.name === 'Direkt');
    expect(direkt!.machbarkeit).toBeNull();
  });
```
Hinweis: Prüfe die exakte USP-Feasibility-Route (`PUT /products/:id/usp/feasibility` mit `{ point_id, manufacturer_id, status }`) durch kurzes Lesen von `amazon.usp.routes.ts`; passe Methode/Body bei Bedarf an. Falls eine Default-Hersteller-Zeile beim USP-GET lazy angelegt wird, ist `manufacturers[0]` ggf. dieser Default — verwende daher den per POST erzeugten `uspMan` (ID) konsistent.

- [ ] **Step 2: Run — MUST FAIL.**

- [ ] **Step 3: Implementierung** — in `amazon.manufacturers.routes.ts` eine `loadMachbarkeit(productId, masterId)` ergänzen und in `withOffers`/der GET-Antwort je Hersteller einbetten:
```ts
function loadMachbarkeit(productId: number, masterId: number): { umsetzbar: number; teilweise: number; nicht: number; offen: number; total: number } | null {
  const uspMan = db.prepare(`SELECT id FROM amazon_usp_manufacturers WHERE manufacturer_id = ? ORDER BY id LIMIT 1`).get(masterId) as { id: number } | undefined;
  if (!uspMan) return null;
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM amazon_usp_points WHERE product_id = ?`).get(productId) as { c: number }).c;
  if (total === 0) return null;
  const countByStatus = (status: string) => (db.prepare(
    `SELECT COUNT(*) AS c FROM amazon_usp_feasibility f JOIN amazon_usp_points p ON p.id = f.point_id
     WHERE p.product_id = ? AND f.manufacturer_id = ? AND f.status = ?`
  ).get(productId, uspMan.id, status) as { c: number }).c;
  const umsetzbar = countByStatus('umsetzbar');
  const teilweise = countByStatus('teilweise');
  const nicht = countByStatus('nicht');
  const offen = total - umsetzbar - teilweise - nicht;
  return { umsetzbar, teilweise, nicht, offen, total };
}
```
Und in der GET-Route die Hersteller mit `machbarkeit` anreichern. Da `withOffers` keinen `productId` kennt, erweitere die GET-Route so:
```ts
  res.json({ manufacturers: rows.map(m => ({ ...withOffers(m), machbarkeit: loadMachbarkeit(id, m.id) })), settings: getOrCreateSettings(id) });
```
(Die Reihenfolge der Felder ist egal; `machbarkeit` ergänzt das Hersteller-Objekt.)

- [ ] **Step 4: Run — MUST PASS** (targeted + volle Suite). Falls die makeApp-Erweiterung nötig war (USP mounten), sicherstellen dass alle bestehenden Manufacturers-Tests weiter grün sind.

- [ ] **Step 5: Commit**
```bash
git add backend/src/routes/amazon.manufacturers.routes.ts backend/test/integration.amazon_manufacturers.test.ts
git commit -m "feat(amazon-hersteller): Backend Machbarkeit je Hersteller (aus USP)"
```

---

### Task C2: Frontend Machbarkeits-Spalte

**Files:** `amazon.api.ts`, `ManufacturerComparison.tsx`.

- [ ] **Step 1: API** — `Manufacturer` interface ergänzen:
  `machbarkeit: { umsetzbar: number; teilweise: number; nicht: number; offen: number; total: number } | null;`

- [ ] **Step 2: `ManufacturerComparison.tsx`** — Machbarkeits-Spalte.
  - Pro Zeile den Hersteller des Angebots kennen: erweitere die `rows`-Erzeugung um `machbarkeit`:
    `rows.push({ herstellerName: m.name, machbarkeit: m.machbarkeit, offer: o });` und den Row-Typ entsprechend.
  - Im `<thead>` eine `<th>Machbarkeit</th>` als letzte Spalte ergänzen.
  - In der Zeile eine Zelle:
    ```tsx
      <td className="px-3 py-2 text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>
        {machbarkeit ? `${machbarkeit.umsetzbar} umsetzbar · ${machbarkeit.teilweise} teilweise · ${machbarkeit.nicht} nicht · ${machbarkeit.offen} offen` : '—'}
      </td>
    ```
  (Destrukturiere `machbarkeit` aus dem `sorted.map`-Element analog zu `herstellerName`/`offer`.)

- [ ] **Step 3: Typecheck + Build** → PASS.
- [ ] **Step 4: Commit**
```bash
git add frontend/src/api/amazon.api.ts frontend/src/components/amazon/manufacturers/ManufacturerComparison.tsx
git commit -m "feat(amazon-hersteller): Machbarkeits-Spalte im Vergleich"
```

---

## Manuelles UAT (nach allen Phasen)
1. Backend neu starten (Migr. 079–081). Produkt → Hersteller-Bereich.
2. Kurs „1 USD = 0,92 €" setzen; Angebot USD/1000 → Vergleich EUR „920,00 €"; EUR-Angebot direkt; günstigstes (EUR) hervorgehoben.
3. „Aktuell"-Stern exklusiv je Hersteller; Badge im Vergleich.
4. Datei an Angebot hochladen/herunterladen/löschen (Bestätigung).
5. Aus USP übernommener Hersteller mit gesetzter Machbarkeit → Spalte zeigt Aufschlüsselung; direkt angelegter → „—".
```
