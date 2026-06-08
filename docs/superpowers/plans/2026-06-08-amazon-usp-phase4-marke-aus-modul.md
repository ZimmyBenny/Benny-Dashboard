# Amazon USP Phase 4 — Marke aus Markenname-Modul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Im Markenname-Modul genau einen Kandidaten als „finale Marke" markieren; das USP zeigt diese Marke automatisch im Feld „Marke" und im PDF an (überschreibbar).

**Architecture:** Neue Spalte `is_final` an `amazon_brand_name_candidates` (Migration 076), exklusiv per Produkt im Brand-PATCH. Das USP-GET liefert zusätzlich `final_marke` (Name des markierten Kandidaten); USP-Marke-Feld + PDF nutzen die effektive Marke = Eingabe → finale Marke → „wird nachgereicht". Rein additiv.

**Tech Stack:** Express 5, better-sqlite3; React 19, TanStack Query 5, jsPDF. Vitest+supertest.

---

## Datensicherheit
Nur eine neue Spalte → Auto-Backup der Migration genügt. Kein `PRAGMA foreign_keys` in der Migration.

## Vorbedingung — Branch (Orchestrator, vor Task 1)
```bash
cd "/Users/benny/Library/Mobile Documents/com~apple~CloudDocs/B E N N Y 👨🏽‍💻/09 - Benny Dashboard"
git checkout main && git checkout -b feat/amazon-usp-phase4
```

## Pfade
- Repo `<repo>` = `/Users/benny/Library/Mobile Documents/com~apple~CloudDocs/B E N N Y 👨🏽‍💻/09 - Benny Dashboard`
- Backend: `cd "<repo>/backend" && npx vitest run … ; npx tsc --noEmit` · Frontend: `cd "<repo>/frontend" && npx tsc --noEmit && npx vite build`

## File Structure
- Create `backend/src/db/migrations/076_amazon_brand_is_final.sql`
- Modify `backend/src/routes/amazon.brand.routes.ts` (CandidateRow + PATCH is_final + Exklusivität)
- Modify `backend/test/integration.amazon_brand.test.ts`
- Modify `backend/src/routes/amazon.usp.routes.ts` (GET payload final_marke)
- Modify `backend/test/integration.amazon_usp.test.ts`
- Modify `frontend/src/api/amazon.api.ts` (BrandCandidate + CandidatePatch is_final; UspPayload final_marke)
- Modify `frontend/src/components/amazon/BrandNameRow.tsx`, `frontend/src/components/amazon/BrandNameTable.tsx` (Marke-Spalte)
- Modify `frontend/src/components/amazon/usp/UspMetaForm.tsx` (Marke-Feld), `frontend/src/lib/amazon/exportUspPdf.ts`, `frontend/src/components/amazon/usp/UspSection.tsx`

---

### Task 1: Migration 076 — Brand `is_final`

**Files:** Create `backend/src/db/migrations/076_amazon_brand_is_final.sql`

- [ ] **Step 1: Migration schreiben**
```sql
-- Migration 076: finale Marke je Produkt im Markenname-Modul (2026-06-08)
-- WICHTIG: Kein FK-Pragma setzen. Rein additiv (eine Spalte, Default 0).

ALTER TABLE amazon_brand_name_candidates
  ADD COLUMN is_final INTEGER NOT NULL DEFAULT 0 CHECK (is_final IN (0,1));
```

- [ ] **Step 2: Smoke**

Run: `cd "<repo>/backend" && npx vitest run test/integration.amazon_brand.test.ts 2>&1 | tail -4`
Expected: bestehende Brand-Tests grün, kein SQL-Fehler.

- [ ] **Step 3: Commit**
```bash
git add "backend/src/db/migrations/076_amazon_brand_is_final.sql"
git commit -m "feat(amazon-brand): Migration 076 — is_final (finale Marke)" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Backend Brand — `is_final` (exklusiv) + Tests

**Files:** Modify `backend/src/routes/amazon.brand.routes.ts`, `backend/test/integration.amazon_brand.test.ts`

- [ ] **Step 1: Test ergänzen** (neue Suite am Dateiende; nutzt vorhandene `makeApp`/`makeProduct`)
```ts
describe('Brand API — finale Marke (is_final, exklusiv)', () => {
  let db: Database.Database; let app: express.Express;
  beforeEach(async () => { db = createTestDb(); app = await makeApp(db); });

  it('is_final exklusiv pro Produkt; ungueltig -> 400', async () => {
    const pid = makeProduct(db);
    await request(app).get(`/api/amazon/products/${pid}/brand`);
    const a = await request(app).post(`/api/amazon/products/${pid}/brand/names`).send({ name: 'Alpha' });
    const b = await request(app).post(`/api/amazon/products/${pid}/brand/names`).send({ name: 'Beta' });
    const aId = a.body.name.id; const bId = b.body.name.id;
    const r1 = await request(app).patch(`/api/amazon/products/${pid}/brand/names/${aId}`).send({ is_final: 1 });
    expect(r1.status).toBe(200);
    expect(r1.body.name.is_final).toBe(1);
    // Beta final -> Alpha verliert es
    await request(app).patch(`/api/amazon/products/${pid}/brand/names/${bId}`).send({ is_final: 1 });
    const list = await request(app).get(`/api/amazon/products/${pid}/brand`);
    const byId = new Map(list.body.names.map((n: { id: number; is_final: number }) => [n.id, n.is_final]));
    expect(byId.get(aId)).toBe(0);
    expect(byId.get(bId)).toBe(1);
    const bad = await request(app).patch(`/api/amazon/products/${pid}/brand/names/${aId}`).send({ is_final: 2 });
    expect(bad.status).toBe(400);
  });
});
```

- [ ] **Step 2: Tests laufen — FAIL**

Run: `cd "<repo>/backend" && npx vitest run test/integration.amazon_brand.test.ts 2>&1 | tail -15`
Expected: neuer Test rot.

- [ ] **Step 3: `amazon.brand.routes.ts` anpassen**

(a) `CandidateRow`-Interface um `is_final: number;` ergänzen (das Interface beginnt bei `interface CandidateRow {`; füge die Zeile z. B. nach `is_archived: number;` ein).

(b) Im Candidate-PATCH-Handler die boolesche Spalten-Schleife erweitern — ersetze
```ts
  for (const col of ['is_interesting', 'is_maybe', 'is_yes', 'is_no', 'is_favorite', 'is_archived'] as const) {
```
durch
```ts
  for (const col of ['is_interesting', 'is_maybe', 'is_yes', 'is_no', 'is_favorite', 'is_archived', 'is_final'] as const) {
```

(c) Direkt NACH dem `db.prepare(\`UPDATE amazon_brand_name_candidates SET ${updates.join(', ')} WHERE id = ?\`).run(...params);`-Aufruf (also vor dem abschließenden `const row = …; res.json(...)`) die Exklusivität ergänzen:
```ts
  if (body.is_final === 1) {
    db.prepare(`UPDATE amazon_brand_name_candidates SET is_final = 0, updated_at = unixepoch() WHERE product_id = ? AND id != ?`).run(id, cid);
  }
```

- [ ] **Step 4: Tests grün + Typecheck**

Run: `cd "<repo>/backend" && npx vitest run test/integration.amazon_brand.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add "backend/src/routes/amazon.brand.routes.ts" "backend/test/integration.amazon_brand.test.ts"
git commit -m "feat(amazon-brand): is_final (finale Marke, exklusiv pro Produkt) + Test" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Backend USP — `final_marke` im Payload + Test

**Files:** Modify `backend/src/routes/amazon.usp.routes.ts`, `backend/test/integration.amazon_usp.test.ts`

- [ ] **Step 1: Test ergänzen** (neue Suite am Dateiende)
```ts
describe('USP API — finale Marke aus Brand', () => {
  let db: Database.Database; let app: express.Express;
  beforeEach(async () => { db = createTestDb(); app = await makeApp(db); });

  it('GET /usp liefert final_marke des markierten Kandidaten; sonst null', async () => {
    const pid = makeProduct(db);
    const r0 = await request(app).get(`/api/amazon/products/${pid}/usp`);
    expect(r0.body.final_marke).toBeNull();
    db.prepare(`INSERT INTO amazon_brand_name_candidates (product_id, name, is_final) VALUES (?, 'ZwergenZauber', 1)`).run(pid);
    db.prepare(`INSERT INTO amazon_brand_name_candidates (product_id, name, is_final) VALUES (?, 'AndererName', 0)`).run(pid);
    const r1 = await request(app).get(`/api/amazon/products/${pid}/usp`);
    expect(r1.body.final_marke).toBe('ZwergenZauber');
  });
});
```

- [ ] **Step 2: Tests laufen — FAIL**

Run: `cd "<repo>/backend" && npx vitest run test/integration.amazon_usp.test.ts 2>&1 | tail -10`
Expected: `final_marke` ist undefined → Test rot.

- [ ] **Step 3: GET-Handler erweitern**

In `amazon.usp.routes.ts` im GET `/products/:id/usp`-Handler unmittelbar vor dem `res.json({ meta, points: … })` einfügen:
```ts
  const finalRow = db.prepare(`SELECT name FROM amazon_brand_name_candidates WHERE product_id = ? AND is_final = 1 ORDER BY id LIMIT 1`).get(id) as { name: string } | undefined;
  const final_marke = finalRow?.name ?? null;
```
und die `res.json(...)`-Zeile ändern zu (am Ende `final_marke` ergänzen):
```ts
  res.json({ meta, points: loadPoints(id), manufacturers: loadManufacturers(id), feasibility: loadFeasibility(id), kaufgruende: loadKaufgruende(id), files: loadFiles(id), final_marke });
```

- [ ] **Step 4: Tests grün + volle Suite + Typecheck**

Run: `cd "<repo>/backend" && npx vitest run test/integration.amazon_usp.test.ts && npx vitest run && npx tsc --noEmit`
Expected: alles PASS.

- [ ] **Step 5: Commit**
```bash
git add "backend/src/routes/amazon.usp.routes.ts" "backend/test/integration.amazon_usp.test.ts"
git commit -m "feat(amazon-usp): GET liefert final_marke aus Markenname-Modul + Test" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Frontend-API — Typen

**Files:** Modify `frontend/src/api/amazon.api.ts`

- [ ] **Step 1: `BrandCandidate` + `CandidatePatch` + `UspPayload`**

(a) Im `export interface BrandCandidate { … }` nach `is_archived: 0 | 1;` ergänzen:
```ts
  is_final: 0 | 1;
```
(b) Im `export type CandidatePatch = Partial<{ … }>` nach `is_archived: 0 | 1;` ergänzen:
```ts
  is_final: 0 | 1;
```
(c) Im `export interface UspPayload { … }` `final_marke: string | null;` ergänzen.

- [ ] **Step 2: Typecheck + Commit**

Run: `cd "<repo>/frontend" && npx tsc --noEmit` → clean (Fehler in Komponenten, die `final_marke` noch nicht nutzen, gibt es nicht; das Feld ist optional in der Nutzung).
```bash
git add "frontend/src/api/amazon.api.ts"
git commit -m "feat(amazon-usp): Typen is_final + final_marke" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Frontend Brand-UI — „finale Marke"-Control + Spalte

**Files:** Modify `frontend/src/components/amazon/BrandNameRow.tsx`, `frontend/src/components/amazon/BrandNameTable.tsx`

**Kontext:** `BrandNameRow` rendert pro Kandidat `<td>`-Zellen (#, Name, Interessant-Checkbox, Favourit-Checkbox, Archiv-Checkbox, Ranking-Sterne, Bemerkungen, Löschen). Es nutzt `patch(p: CandidatePatch)` → `update.mutate({ candidateId, patch: p })`. `BrandNameTable` rendert die `<thead>`-Spaltenköpfe in derselben Reihenfolge.

- [ ] **Step 1: `BrandNameRow.tsx` — Marke-Zelle**

Unmittelbar NACH der Archiv-Checkbox-`<td>` (die `aria-label="Archiv"` enthält) und VOR der Ranking-`<td>` eine neue Zelle einfügen:
```tsx
      <td className="p-2 text-center">
        <button
          type="button"
          onClick={() => patch({ is_final: candidate.is_final === 1 ? 0 : 1 })}
          aria-label="Finale Marke"
          title={candidate.is_final === 1 ? 'Finale Marke (klicken zum Entfernen)' : 'Als finale Marke markieren'}
          className="p-1 rounded"
        >
          <span className="material-symbols-outlined" style={{
            fontSize: '18px',
            color: candidate.is_final === 1 ? '#fbbf24' : 'rgba(255,255,255,0.25)',
            fontVariationSettings: candidate.is_final === 1 ? '"FILL" 1' : '"FILL" 0',
          }}>workspace_premium</span>
        </button>
      </td>
```

- [ ] **Step 2: `BrandNameTable.tsx` — Spaltenkopf**

Im `<thead>` unmittelbar NACH dem „Archiv"-`<th>` und VOR dem „Ranking"-`<th>` einfügen:
```tsx
                <th style={{ ...TH_STYLE, textAlign: 'center' }}>Marke</th>
```
(Verwende denselben `TH_STYLE`/dieselbe Struktur wie die benachbarten Köpfe — Read die Datei und passe exakt an. Die Zell- und Kopf-Reihenfolge MUSS übereinstimmen.)

- [ ] **Step 3: Typecheck + Commit**

Run: `cd "<repo>/frontend" && npx tsc --noEmit` → clean.
```bash
git add "frontend/src/components/amazon/BrandNameRow.tsx" "frontend/src/components/amazon/BrandNameTable.tsx"
git commit -m "feat(amazon-brand): 'finale Marke'-Markierung in der Namensliste" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Frontend USP — Marke automatisch (Feld + PDF)

**Files:** Modify `frontend/src/components/amazon/usp/UspMetaForm.tsx`, `frontend/src/lib/amazon/exportUspPdf.ts`, `frontend/src/components/amazon/usp/UspSection.tsx`

- [ ] **Step 1: `exportUspPdf.ts` — finalMarke-Parameter**

(a) Signatur erweitern. Ersetze
```ts
  manufacturer: UspManufacturer,
): Promise<{ blob: Blob; filename: string }> {
```
durch
```ts
  manufacturer: UspManufacturer,
  finalMarke: string | null,
): Promise<{ blob: Blob; filename: string }> {
```
(b) Marke-Zeile. Ersetze
```ts
  paragraph(`Marke: ${meta.marke ?? 'wird nachgereicht'}`, { size: 10, color: BODY, lh: 15, gap: 6 });
```
durch
```ts
  const markeText = (meta.marke && meta.marke.trim()) || finalMarke || 'wird nachgereicht';
  paragraph(`Marke: ${markeText}`, { size: 10, color: BODY, lh: 15, gap: 6 });
```

- [ ] **Step 2: `UspMetaForm.tsx` — Marke-Feld mit finalMarke**

(a) Komponenten-Signatur erweitern:
```tsx
export function UspMetaForm({ productId, meta, finalMarke }: { productId: number; meta: UspMeta; finalMarke: string | null }) {
```
(b) Das bestehende `<Field label="Marke" … />` durch einen eigenen Marke-Block ersetzen. Ersetze
```tsx
      <Field label="Marke" value={meta.marke ?? ''} onSave={(marke) => update.mutate({ marke })} />
```
durch
```tsx
      <MarkeField productId={productId} marke={meta.marke} finalMarke={finalMarke} onSave={(marke) => update.mutate({ marke })} />
```
(c) Eine `MarkeField`-Komponente VOR `export function UspMetaForm` hinzufügen:
```tsx
function MarkeField({ marke, finalMarke, onSave }: { productId: number; marke: string | null; finalMarke: string | null; onSave: (v: string) => void }) {
  const [v, setV] = useState(marke ?? '');
  useEffect(() => { setV(marke ?? ''); }, [marke]);
  const hasOverride = (marke ?? '').trim().length > 0;
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>Marke</span>
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => { if (v !== (marke ?? '')) onSave(v); }}
        placeholder={finalMarke ? `${finalMarke} (aus Markenname)` : 'Marke'}
        className="w-full px-2 py-1.5 rounded-md text-sm"
        style={{ background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}
      />
      {finalMarke && !hasOverride && (
        <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>Automatisch aus Markenname: {finalMarke}</span>
      )}
      {finalMarke && hasOverride && (
        <button type="button" onClick={() => { setV(''); onSave(''); }} className="self-start text-xs flex items-center gap-1" style={{ color: 'var(--color-on-surface-variant)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>undo</span>auf Markenname zurücksetzen ({finalMarke})
        </button>
      )}
    </label>
  );
}
```
(`useState`/`useEffect` sind in der Datei bereits importiert.)

- [ ] **Step 3: `UspSection.tsx` — finalMarke durchreichen**

(a) `UspMetaForm`-Aufruf erweitern. Ersetze
```tsx
              <UspMetaForm productId={productId} meta={data.meta} />
```
durch
```tsx
              <UspMetaForm productId={productId} meta={data.meta} finalMarke={data.final_marke} />
```
(b) In `buildPdf` den `exportUspPdf`-Aufruf um `finalMarke` ergänzen. Ersetze
```tsx
    const { blob, filename } = await exportUspPdf(productId, productName, fresh.data.meta, included, m);
```
durch
```tsx
    const { blob, filename } = await exportUspPdf(productId, productName, fresh.data.meta, included, m, fresh.data.final_marke);
```

- [ ] **Step 4: Typecheck + Build**

Run: `cd "<repo>/frontend" && npx tsc --noEmit && npx vite build`
Expected: PASS + Build erfolgreich.

- [ ] **Step 5: Commit**
```bash
git add "frontend/src/components/amazon/usp/UspMetaForm.tsx" "frontend/src/lib/amazon/exportUspPdf.ts" "frontend/src/components/amazon/usp/UspSection.tsx"
git commit -m "feat(amazon-usp): Marke automatisch aus Markenname (Feld + PDF) mit Override" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Verifikation (UAT)

- [ ] **Step 1:** Backend neu starten (Migration 076 + Auto-Backup). Stale Backend: `lsof -i :3001`, `pkill -f "tsx watch"`, neu starten.
- [ ] **Step 2:** Markenname-Modul: einen Namen über das Kronen-Icon als „finale Marke" markieren → hervorgehoben; einen zweiten markieren → erster verliert es (nur einer final).
- [ ] **Step 3:** USP öffnen → Feld „Marke" zeigt die finale Marke (Placeholder + „Automatisch aus Markenname"); PDF-Kopf zeigt sie.
- [ ] **Step 4:** Eigene Marke ins USP tippen → überschreibt; „↩ auf Markenname zurücksetzen" stellt die finale Marke wieder her.
- [ ] **Step 5:** Markierung im Brand-Modul entfernen → USP zeigt wieder „wird nachgereicht".
- [ ] **Step 6:** Abschluss; bei Abweichung → systematic-debugging.

---

## Self-Review

**Spec coverage:** Migration is_final → T1 ✅ · Brand PATCH is_final + Exklusivität + Test → T2 ✅ · USP GET final_marke + Test → T3 ✅ · Typen (BrandCandidate/CandidatePatch/UspPayload) → T4 ✅ · Brand-UI Control + Spalte → T5 ✅ · USP Marke-Feld + PDF + Wiring → T6 ✅ · UAT → T7 ✅. Datensicherheit additiv → T1.

**Placeholder scan:** keine TBD/TODO; jeder Code-Schritt vollständig.

**Type consistency:** `is_final` als `0|1` einheitlich (BrandCandidate/CandidatePatch, Backend-CHECK 0/1). `final_marke: string | null` einheitlich (Backend GET, UspPayload, UspMetaForm-Prop, exportUspPdf-Param). Effektive-Marke-Logik identisch in PDF (`meta.marke || finalMarke || 'wird nachgereicht'`) und Feld-Placeholder. `exportUspPdf`-Aufrufstelle in UspSection wird in T6 mitgeändert.
