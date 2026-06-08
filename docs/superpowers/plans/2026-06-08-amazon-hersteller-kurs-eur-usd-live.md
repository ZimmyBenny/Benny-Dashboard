# Amazon Hersteller — Kurs EUR→USD + Live-Kurs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Kurs-Feld dreht auf „1 EUR = X $" (EUR→USD), EUR-Umrechnung = USD-Preis ÷ Kurs; plus ein „↻ Aktuell holen"-Button (EZB-Kurs via frankfurter.app) mit „Stand: <Datum>".

**Architecture:** `usd_eur_rate` wird als EUR→USD interpretiert (kein Rename). Neue Spalte `rate_date` (Migration 082). Backend `GET /amazon/fx/eur-usd` holt den Live-Kurs. Frontend: Label/Mathe drehen + Button.

**Tech Stack:** Express 5 + better-sqlite3; React 19 + TanStack Query + Tailwind v4; Vitest.

**Spec:** `docs/superpowers/specs/2026-06-08-amazon-hersteller-kurs-eur-usd-live-design.md`

---

### Task 1: Migration 082

- [ ] **Step 1:** `backend/src/db/migrations/082_amazon_manufacturer_settings_rate_date.sql`:
```sql
ALTER TABLE amazon_manufacturer_settings ADD COLUMN rate_date TEXT;
```
- [ ] **Step 2: Commit**
```bash
git add backend/src/db/migrations/082_amazon_manufacturer_settings_rate_date.sql
git commit -m "feat(amazon-hersteller): Migration 082 — rate_date in Settings"
```

---

### Task 2: Backend — FX-Route + Settings rate_date (TDD)

**Files:** Modify `backend/src/routes/amazon.manufacturers.routes.ts`; Test `backend/test/integration.amazon_manufacturers.test.ts`.

- [ ] **Step 1: Failing-Tests** — im Test-Import `afterEach` ergänzen (Zeile 1: `import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';`), dann diesen describe-Block am Dateiende anhängen:
```ts
describe('Amazon Hersteller — Kurs/FX', () => {
  let db: Database.Database; let app: express.Express;
  beforeEach(async () => { db = createTestDb(); app = await makeApp(db); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('GET /fx/eur-usd liefert rate+date (gemockt)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ rates: { USD: 1.0865 }, date: '2026-06-06' }) })));
    const r = await request(app).get('/api/amazon/fx/eur-usd');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ rate: 1.0865, date: '2026-06-06' });
  });

  it('GET /fx/eur-usd 502 bei Fehler', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    expect((await request(app).get('/api/amazon/fx/eur-usd')).status).toBe(502);
  });

  it('Settings rate_date setzen + manuell loeschen', async () => {
    const pid = makeProduct(db);
    const p = await request(app).patch(`/api/amazon/products/${pid}/manufacturers/settings`).send({ usd_eur_rate: '1,15', rate_date: '2026-06-06' });
    expect(p.body.settings).toMatchObject({ usd_eur_rate: '1,15', rate_date: '2026-06-06' });
    const m = await request(app).patch(`/api/amazon/products/${pid}/manufacturers/settings`).send({ usd_eur_rate: '1,20' });
    expect(m.body.settings).toMatchObject({ usd_eur_rate: '1,20', rate_date: null });
  });
});
```
(`makeProduct`, `makeApp`, `createTestDb` existieren bereits in der Datei; `vi` ist importiert.)

- [ ] **Step 2: Run — MUST FAIL**
`cd backend && npx vitest run test/integration.amazon_manufacturers.test.ts -t "Kurs/FX"`

- [ ] **Step 3: Implementierung** in `amazon.manufacturers.routes.ts`:

a) `SettingsRow`-Interface um `rate_date: string | null;` erweitern.

b) FX-Route ergänzen (oben, distinct path — keine Shadowing-Sorge):
```ts
router.get('/fx/eur-usd', async (_req: Request, res: Response) => {
  try {
    const r = await fetch('https://api.frankfurter.app/latest?from=EUR&to=USD');
    if (!r.ok) { res.status(502).json({ error: 'fx unavailable' }); return; }
    const data = await r.json() as { rates?: { USD?: number }; date?: string };
    const rate = data?.rates?.USD; const date = data?.date;
    if (typeof rate !== 'number' || typeof date !== 'string') { res.status(502).json({ error: 'fx unavailable' }); return; }
    res.json({ rate, date });
  } catch {
    res.status(502).json({ error: 'fx unavailable' });
  }
});
```

c) Settings-PATCH ersetzen durch die Variante mit `rate_date`:
```ts
router.patch('/products/:id/manufacturers/settings', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) { res.status(404).json({ error: 'not found' }); return; }
  const body = (req.body ?? {}) as { usd_eur_rate?: unknown; rate_date?: unknown };
  const raw = body.usd_eur_rate;
  let value: string | null;
  if (raw === undefined || raw === null) value = null;
  else if (typeof raw !== 'string') { res.status(400).json({ error: 'invalid usd_eur_rate' }); return; }
  else { const t = raw.trim(); value = t.length === 0 ? null : t.slice(0, 50); }
  let dateValue: string | null = null;
  if ('rate_date' in body) {
    const rd = body.rate_date;
    if (rd === undefined || rd === null) dateValue = null;
    else if (typeof rd !== 'string') { res.status(400).json({ error: 'invalid rate_date' }); return; }
    else { const t = rd.trim(); dateValue = t.length === 0 ? null : t.slice(0, 30); }
  }
  getOrCreateSettings(id);
  db.prepare(`UPDATE amazon_manufacturer_settings SET usd_eur_rate = ?, rate_date = ?, updated_at = unixepoch() WHERE product_id = ?`).run(value, dateValue, id);
  res.json({ settings: getOrCreateSettings(id) });
});
```

- [ ] **Step 4: Run — MUST PASS** (targeted + volle Suite).
`cd backend && npx vitest run test/integration.amazon_manufacturers.test.ts` → grün.
`cd backend && npx vitest run` → alle grün.

- [ ] **Step 5: Commit**
```bash
git add backend/src/routes/amazon.manufacturers.routes.ts backend/test/integration.amazon_manufacturers.test.ts
git commit -m "feat(amazon-hersteller): FX-Route (EZB EUR->USD) + Settings rate_date"
```

---

### Task 3: Frontend — Richtung drehen + Live-Button

**Files:** `frontend/src/api/amazon.api.ts`, `frontend/src/hooks/amazon/useManufacturers.ts`, `frontend/src/components/amazon/manufacturers/ManufacturersSection.tsx`.

- [ ] **Step 1: API** (`amazon.api.ts`)
  - Settings-Typ erweitern. `ManufacturersPayload` ändern zu:
    `export interface ManufacturersPayload { manufacturers: Manufacturer[]; settings: { usd_eur_rate: string | null; rate_date: string | null }; }`
  - `updateManufacturerSettings` ersetzen:
    ```ts
    export async function updateManufacturerSettings(productId: number, usdEurRate: string, rateDate?: string | null): Promise<{ usd_eur_rate: string | null; rate_date: string | null }> {
      const body = rateDate !== undefined ? { usd_eur_rate: usdEurRate, rate_date: rateDate } : { usd_eur_rate: usdEurRate };
      return ((await apiClient.patch(`/amazon/products/${productId}/manufacturers/settings`, body)).data as { settings: { usd_eur_rate: string | null; rate_date: string | null } }).settings;
    }
    ```
  - Neue Funktion:
    ```ts
    export async function fetchEurUsdRate(): Promise<{ rate: number; date: string }> {
      return (await apiClient.get(`/amazon/fx/eur-usd`)).data as { rate: number; date: string };
    }
    ```

- [ ] **Step 2: Hooks** (`useManufacturers.ts`)
  - `eurPreis` ersetzen (Kurs ist jetzt EUR→USD; USD-Preis ÷ Kurs):
    ```ts
    export function eurPreis(offer: { preis: string | null; currency: 'USD' | 'EUR' }, rate: number | null): number | null {
      const p = parsePreis(offer.preis);
      if (p === null) return null;
      if (offer.currency === 'EUR') return p;
      if (rate === null || rate === 0) return null;
      return p / rate;
    }
    ```
  - `useUpdateManufacturerSettings` ersetzen (Objekt-Argument):
    ```ts
    export function useUpdateManufacturerSettings(productId: number) {
      const inval = useInval(productId);
      return useMutation({ mutationFn: ({ usdEurRate, rateDate }: { usdEurRate: string; rateDate?: string | null }) => updateManufacturerSettings(productId, usdEurRate, rateDate), onSettled: inval });
    }
    ```

- [ ] **Step 3: `ManufacturersSection.tsx`** — Label/Button/Stand.
  - Importe: `fetchEurUsdRate` aus `'../../../api/amazon.api'` ergänzen; `useState` ist vorhanden.
  - Nach den bestehenden States zwei neue ergänzen:
    ```tsx
    const [fxLoading, setFxLoading] = useState(false);
    const [fxError, setFxError] = useState(false);
    ```
  - Live-Holen-Funktion im Component-Body (vor `return`):
    ```tsx
    async function holeAktuellenKurs() {
      setFxError(false); setFxLoading(true);
      try {
        const { rate, date } = await fetchEurUsdRate();
        await updateSettings.mutateAsync({ usdEurRate: String(rate), rateDate: date });
      } catch { setFxError(true); }
      finally { setFxLoading(false); }
    }
    ```
  - Das bestehende Kurs-Feld-`<div className="flex items-center gap-2">…</div>` (mit „1 USD =" … „€") ersetzen durch:
    ```tsx
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>1 EUR =</span>
            <input
              value={rateValue}
              onChange={(e) => setRateInput(e.target.value)}
              onBlur={() => { if (rateInput !== null && rateInput !== (data.settings.usd_eur_rate ?? '')) updateSettings.mutate({ usdEurRate: rateInput }); setRateInput(null); }}
              placeholder="z. B. 1,15"
              className="px-2 py-1 rounded-md text-xs w-24"
              style={{ background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}
            />
            <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>$</span>
            <button
              type="button"
              onClick={holeAktuellenKurs}
              disabled={fxLoading}
              className="px-2 py-1 rounded-md text-xs flex items-center gap-1"
              style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)', opacity: fxLoading ? 0.6 : 1 }}
              title="Aktuellen EZB-Kurs holen"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>sync</span>{fxLoading ? 'Lädt …' : 'Aktuell holen'}
            </button>
            {data.settings.rate_date ? <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>Stand: {data.settings.rate_date}</span> : null}
            {fxError ? <span className="text-xs" style={{ color: '#fca5a5' }}>Kurs nicht erreichbar (offline?)</span> : null}
          </div>
    ```
  (Hinweis: `updateSettings` ist bereits `useUpdateManufacturerSettings(productId)` — jetzt mit Objekt-Argument aufrufen, wie oben.)

- [ ] **Step 4: Typecheck + Build**
`cd frontend && npx tsc --noEmit` → PASS. `cd frontend && npx vite build` → PASS.

- [ ] **Step 5: Commit**
```bash
git add frontend/src/api/amazon.api.ts frontend/src/hooks/amazon/useManufacturers.ts frontend/src/components/amazon/manufacturers/ManufacturersSection.tsx
git commit -m "feat(amazon-hersteller): Kurs 1 EUR = X USD + Live-Kurs-Button (EZB)"
```

---

## Manuelles UAT
1. Kurs-Feld zeigt „1 EUR = [1,15] $". Vergleich: USD-Angebot 1000 → EUR-Spalte 869,57 € (1000 ÷ 1,15).
2. „↻ Aktuell holen" füllt aktuellen Kurs + „Stand: <Datum>". Offline → „Kurs nicht erreichbar".
3. Manuelles Überschreiben des Kurses → „Stand"-Anzeige verschwindet (Quelle gelöscht).
```
