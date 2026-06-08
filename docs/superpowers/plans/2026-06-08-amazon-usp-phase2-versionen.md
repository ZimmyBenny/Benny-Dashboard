# Amazon USP Phase 2 — Versions-Verlauf — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Beim USP-PDF-Export eine Vorschau (neuer Tab) bieten und das PDF auf Wunsch als Version speichern; gespeicherte Versionen in einer Liste ansehen/herunterladen/löschen.

**Architecture:** Eine Version ist die fertige PDF-Datei selbst (auf der Platte) plus Metadaten (Hersteller-Name + Datum) in `amazon_usp_versions` (Migration 074). `exportUspPdf` liefert künftig ein `Blob` zurück statt herunterzuladen; das Frontend nutzt es für Vorschau, Download und Upload (Version speichern). Rein additiv.

**Tech Stack:** Express 5, better-sqlite3, multer; React 19, TanStack Query 5, jsPDF. Vitest+supertest.

---

## Datensicherheit
Nur neue Tabelle + neues Datei-Verzeichnis → Auto-Backup der Migration genügt. Kein `PRAGMA foreign_keys` in der Migration.

## Vorbedingung — Branch (Orchestrator, vor Task 1)
```bash
cd "/Users/benny/Library/Mobile Documents/com~apple~CloudDocs/B E N N Y 👨🏽‍💻/09 - Benny Dashboard"
git checkout main && git checkout -b feat/amazon-usp-phase2
```

## Pfade
- Repo `<repo>` = `/Users/benny/Library/Mobile Documents/com~apple~CloudDocs/B E N N Y 👨🏽‍💻/09 - Benny Dashboard`
- Backend-Tests: `cd "<repo>/backend" && npx vitest run …` · Typecheck `npx tsc --noEmit`
- Frontend: `cd "<repo>/frontend" && npx tsc --noEmit && npx vite build`

## File Structure
- Create `backend/src/db/migrations/074_amazon_usp_versions.sql`
- Modify `backend/src/routes/amazon.usp.routes.ts` (PDF-Multer + Versions-Routen)
- Modify `backend/test/integration.amazon_usp.test.ts` (Versions-Tests)
- Modify `frontend/src/lib/amazon/exportUspPdf.ts` (Blob zurückgeben)
- Modify `frontend/src/api/amazon.api.ts` (UspVersion-Typ + Funktionen)
- Modify `frontend/src/hooks/amazon/useUsp.ts` (Versions-Hooks)
- Create `frontend/src/components/amazon/usp/UspVersions.tsx`, `DeleteUspVersionDialog.tsx`
- Modify `frontend/src/components/amazon/usp/UspSection.tsx` (Export-Leiste + Versions-Liste)

---

### Task 1: Migration 074 — Versions-Tabelle

**Files:** Create `backend/src/db/migrations/074_amazon_usp_versions.sql`

- [ ] **Step 1: Migration schreiben**

```sql
-- Migration 074: USP-Versionen (gespeicherte PDF je Hersteller) (2026-06-08)
-- WICHTIG: Kein FK-Pragma setzen. Rein additiv. Auto-Backup via migrate.ts.

CREATE TABLE amazon_usp_versions (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id        INTEGER NOT NULL REFERENCES amazon_products(id) ON DELETE CASCADE,
  manufacturer_name TEXT    NOT NULL DEFAULT '',
  file_path         TEXT    NOT NULL,
  created_at        INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX amazon_usp_versions_product_idx
  ON amazon_usp_versions (product_id, created_at, id);
```

- [ ] **Step 2: Smoke (Test-DB baut)**

Run: `cd "<repo>/backend" && npx vitest run test/integration.amazon_usp.test.ts 2>&1 | tail -4`
Expected: bestehende USP-Tests grün, kein SQL-Fehler beim Setup.

- [ ] **Step 3: Commit**
```bash
git add "backend/src/db/migrations/074_amazon_usp_versions.sql"
git commit -m "feat(amazon-usp): Migration 074 — Versions-Tabelle" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Backend — Versions-Routen (Upload/Liste/PDF/Delete) + Tests

**Files:** Modify `backend/src/routes/amazon.usp.routes.ts`, `backend/test/integration.amazon_usp.test.ts`

- [ ] **Step 1: Tests ergänzen** (neue describe-Suite am Dateiende)

```ts
describe('USP API — Versionen', () => {
  let db: Database.Database; let app: express.Express;
  beforeEach(async () => { db = createTestDb(); app = await makeApp(db); });
  const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n', 'latin1');

  it('POST speichert Version + GET listet + GET pdf liefert Datei', async () => {
    const pid = makeProduct(db);
    const up = await request(app).post(`/api/amazon/products/${pid}/usp/versions`)
      .field('manufacturer_name', 'Test Hersteller')
      .attach('file', PDF, { filename: 'v.pdf', contentType: 'application/pdf' });
    expect(up.status).toBe(201);
    expect(up.body.version).toMatchObject({ product_id: pid, manufacturer_name: 'Test Hersteller' });
    const list = await request(app).get(`/api/amazon/products/${pid}/usp/versions`);
    expect(list.body.versions).toHaveLength(1);
    expect(list.body.versions[0]).toMatchObject({ manufacturer_name: 'Test Hersteller' });
    const pdf = await request(app).get(`/api/amazon/products/${pid}/usp/versions/${up.body.version.id}/pdf`);
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toContain('application/pdf');
  });

  it('DELETE entfernt Version; Cross-Produkt -> 404; Cascade beim Produkt-Loeschen', async () => {
    const pA = makeProduct(db, 'A'); const pB = makeProduct(db, 'B');
    const up = await request(app).post(`/api/amazon/products/${pA}/usp/versions`)
      .field('manufacturer_name', 'M').attach('file', PDF, { filename: 'v.pdf', contentType: 'application/pdf' });
    const vId = up.body.version.id;
    expect((await request(app).delete(`/api/amazon/products/${pB}/usp/versions/${vId}`)).status).toBe(404);
    expect((await request(app).delete(`/api/amazon/products/${pA}/usp/versions/${vId}`)).status).toBe(204);
    const up2 = await request(app).post(`/api/amazon/products/${pA}/usp/versions`)
      .field('manufacturer_name', 'M').attach('file', PDF, { filename: 'v.pdf', contentType: 'application/pdf' });
    db.prepare(`DELETE FROM amazon_products WHERE id=?`).run(pA);
    expect((db.prepare(`SELECT COUNT(*) AS c FROM amazon_usp_versions WHERE id=?`).get(up2.body.version.id) as { c: number }).c).toBe(0);
  });
});
```

- [ ] **Step 2: Tests laufen — FAIL (Routen fehlen)**

Run: `cd "<repo>/backend" && npx vitest run test/integration.amazon_usp.test.ts 2>&1 | tail -15`
Expected: die 2 neuen Versions-Tests schlagen fehl (404), übrige grün.

- [ ] **Step 3: PDF-Multer + Versions-Logik in `amazon.usp.routes.ts` ergänzen**

Direkt nach dem bestehenden Bild-`upload`-Block (Konstanten `UPLOAD_DIR` etc. existieren bereits) einen PDF-Uploader + Helfer ergänzen:
```ts
const VERSIONS_DIR = path.join(os.homedir(), '.local', 'share', 'benny-dashboard', 'amazon-usp-versions');
if (!fs.existsSync(VERSIONS_DIR)) fs.mkdirSync(VERSIONS_DIR, { recursive: true });
const pdfUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, VERSIONS_DIR),
    filename: (_req, _file, cb) => cb(null, `${crypto.randomUUID()}.pdf`),
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => { if (file.mimetype !== 'application/pdf') return cb(new Error('pdf only')); cb(null, true); },
});
function deleteVersionFile(filename: string | null | undefined) {
  if (!filename) return;
  const abs = path.resolve(VERSIONS_DIR, filename);
  if (!abs.startsWith(path.resolve(VERSIONS_DIR) + path.sep)) return;
  try { fs.unlinkSync(abs); } catch { /* schon weg */ }
}
interface VersionRow { id: number; product_id: number; manufacturer_name: string; file_path: string; created_at: number; }
function loadVersionForProduct(productId: number, vId: number): VersionRow | undefined {
  return db.prepare(`SELECT * FROM amazon_usp_versions WHERE id = ? AND product_id = ?`).get(vId, productId) as VersionRow | undefined;
}
```

Vor `export default router;` die Routen einfügen:
```ts
// ── Versionen (gespeicherte PDFs) ──
router.post('/products/:id/usp/versions', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) { res.status(404).json({ error: 'product not found' }); return; }
  pdfUpload.single('file')(req, res, (err: unknown) => {
    if (err) { res.status(400).json({ error: err instanceof Error ? err.message : 'upload failed' }); return; }
    const file = (req as Request & { file?: { filename: string } }).file;
    if (!file) { res.status(400).json({ error: 'no file' }); return; }
    const nameRaw = (req.body as { manufacturer_name?: unknown })?.manufacturer_name;
    const name = typeof nameRaw === 'string' ? nameRaw.trim().slice(0, 200) : '';
    const r = db.prepare(`INSERT INTO amazon_usp_versions (product_id, manufacturer_name, file_path) VALUES (?, ?, ?)`).run(id, name, file.filename);
    res.status(201).json({ version: db.prepare(`SELECT id, product_id, manufacturer_name, created_at FROM amazon_usp_versions WHERE id = ?`).get(r.lastInsertRowid) as Omit<VersionRow, 'file_path'> });
  });
});

router.get('/products/:id/usp/versions', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) { res.status(404).json({ error: 'product not found' }); return; }
  const versions = db.prepare(
    `SELECT id, product_id, manufacturer_name, created_at FROM amazon_usp_versions WHERE product_id = ? ORDER BY created_at DESC, id DESC`
  ).all(id) as Array<Omit<VersionRow, 'file_path'>>;
  res.json({ versions });
});

router.get('/products/:id/usp/versions/:vId/pdf', (req: Request, res: Response) => {
  const id = Number(req.params.id); const vId = Number(req.params.vId);
  if (!Number.isInteger(id) || !Number.isInteger(vId) || !ensureProduct(id)) { res.status(404).end(); return; }
  const v = loadVersionForProduct(id, vId);
  if (!v) { res.status(404).end(); return; }
  const abs = path.resolve(VERSIONS_DIR, v.file_path);
  if (!abs.startsWith(path.resolve(VERSIONS_DIR) + path.sep) || !fs.existsSync(abs)) { res.status(404).end(); return; }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline');
  fs.createReadStream(abs).pipe(res);
});

router.delete('/products/:id/usp/versions/:vId', (req: Request, res: Response) => {
  const id = Number(req.params.id); const vId = Number(req.params.vId);
  if (!Number.isInteger(id) || !Number.isInteger(vId) || !ensureProduct(id)) { res.status(404).json({ error: 'not found' }); return; }
  const v = loadVersionForProduct(id, vId);
  if (!v) { res.status(404).json({ error: 'not found' }); return; }
  db.prepare(`DELETE FROM amazon_usp_versions WHERE id = ?`).run(vId);
  deleteVersionFile(v.file_path);
  res.status(204).end();
});
```

- [ ] **Step 4: Tests grün + volle Suite + Typecheck**

Run: `cd "<repo>/backend" && npx vitest run test/integration.amazon_usp.test.ts && npx vitest run && npx tsc --noEmit`
Expected: alle USP-Tests + volle Suite PASS, tsc PASS.

- [ ] **Step 5: Commit**
```bash
git add "backend/src/routes/amazon.usp.routes.ts" "backend/test/integration.amazon_usp.test.ts"
git commit -m "feat(amazon-usp): Backend Versionen (Upload/Liste/PDF/Delete) + Tests" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: `exportUspPdf` liefert ein Blob statt herunterzuladen

**Files:** Modify `frontend/src/lib/amazon/exportUspPdf.ts`

- [ ] **Step 1: Rückgabetyp ändern**

Ersetze die Signatur-Zeile
```ts
): Promise<void> {
```
durch
```ts
): Promise<{ blob: Blob; filename: string }> {
```

- [ ] **Step 2: `doc.save(...)` durch Rückgabe ersetzen**

Ersetze den bestehenden Abschluss
```ts
  doc.save(
    `Produktanfrage_${slug(productName)}_${slug(manufacturer.name || 'Hersteller')}_${new Date().toLocaleDateString('en-CA')}.pdf`,
  );
}
```
durch
```ts
  const filename = `Produktanfrage_${slug(productName)}_${slug(manufacturer.name || 'Hersteller')}_${new Date().toLocaleDateString('en-CA')}.pdf`;
  return { blob: doc.output('blob'), filename };
}
```

- [ ] **Step 3: Typecheck (UspSection wird in Task 7 angepasst — hier kann tsc noch über den alten Aufruf meckern; das ist OK, wird in Task 7 behoben). Nur prüfen, dass exportUspPdf.ts selbst typecheckt:**

Run: `cd "<repo>/frontend" && npx tsc --noEmit 2>&1 | grep -E "exportUspPdf" || echo "exportUspPdf clean"`
Expected: keine Fehler in `exportUspPdf.ts` (Fehler in `UspSection.tsx` wegen geänderter Rückgabe sind erwartet und werden in Task 7 behoben).

- [ ] **Step 4: Commit**
```bash
git add "frontend/src/lib/amazon/exportUspPdf.ts"
git commit -m "refactor(amazon-usp): exportUspPdf liefert { blob, filename } statt direktem Download" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Frontend-API — UspVersion-Typ + Funktionen

**Files:** Modify `frontend/src/api/amazon.api.ts`

- [ ] **Step 1: Am Ende des USP-Abschnitts anfügen** (Axios-Client heißt `apiClient`)

```ts
export interface UspVersion { id: number; product_id: number; manufacturer_name: string; created_at: number; }

export async function fetchUspVersions(productId: number): Promise<UspVersion[]> {
  return ((await apiClient.get(`/amazon/products/${productId}/usp/versions`)).data as { versions: UspVersion[] }).versions;
}
export async function saveUspVersion(productId: number, manufacturerName: string, blob: Blob): Promise<UspVersion> {
  const fd = new FormData();
  fd.append('manufacturer_name', manufacturerName);
  fd.append('file', blob, 'version.pdf');
  return ((await apiClient.post(`/amazon/products/${productId}/usp/versions`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })).data as { version: UspVersion }).version;
}
export async function getUspVersionPdfObjectUrl(productId: number, vId: number): Promise<string> {
  const r = await apiClient.get(`/amazon/products/${productId}/usp/versions/${vId}/pdf`, { responseType: 'blob' });
  return URL.createObjectURL(r.data as Blob);
}
export async function deleteUspVersion(productId: number, vId: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${productId}/usp/versions/${vId}`);
}
```

- [ ] **Step 2: Typecheck**

Run: `cd "<repo>/frontend" && npx tsc --noEmit 2>&1 | grep -E "amazon.api" || echo "api clean"`
Expected: keine Fehler in `amazon.api.ts`.

- [ ] **Step 3: Commit**
```bash
git add "frontend/src/api/amazon.api.ts"
git commit -m "feat(amazon-usp): API Typen + Funktionen fuer Versionen" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Hooks für Versionen

**Files:** Modify `frontend/src/hooks/amazon/useUsp.ts`

- [ ] **Step 1: Import ergänzen**

Im bestehenden Import-Block aus `'../../api/amazon.api'` ergänzen:
```ts
  fetchUspVersions, saveUspVersion, deleteUspVersion,
```

- [ ] **Step 2: Hooks am Dateiende anfügen**

```ts
function versionsKey(productId: number) { return ['amazon', 'products', productId, 'usp', 'versions'] as const; }

export function useUspVersions(productId: number) {
  return useQuery({ queryKey: versionsKey(productId), queryFn: () => fetchUspVersions(productId) });
}
export function useSaveUspVersion(productId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ manufacturerName, blob }: { manufacturerName: string; blob: Blob }) => saveUspVersion(productId, manufacturerName, blob),
    onSettled: () => qc.invalidateQueries({ queryKey: versionsKey(productId) }),
  });
}
export function useDeleteUspVersion(productId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vId: number) => deleteUspVersion(productId, vId),
    onSettled: () => qc.invalidateQueries({ queryKey: versionsKey(productId) }),
  });
}
```

- [ ] **Step 3: Typecheck + Commit**

Run: `cd "<repo>/frontend" && npx tsc --noEmit 2>&1 | grep -E "useUsp" || echo "useUsp clean"`
Expected: keine Fehler in `useUsp.ts`.
```bash
git add "frontend/src/hooks/amazon/useUsp.ts"
git commit -m "feat(amazon-usp): Hooks fuer Versionen" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Komponenten — `DeleteUspVersionDialog` + `UspVersions`

**Files:** Create `frontend/src/components/amazon/usp/DeleteUspVersionDialog.tsx`, `UspVersions.tsx`

- [ ] **Step 1: `DeleteUspVersionDialog.tsx`**

```tsx
interface Props { label: string; onConfirm: () => void; onClose: () => void; }
export function DeleteUspVersionDialog({ label, onConfirm, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={onClose}>
      <div className="rounded-xl p-5 w-[90%] max-w-sm" style={{ background: 'var(--color-surface-container-high)', border: '1px solid rgba(255,255,255,0.08)' }} onClick={(e) => e.stopPropagation()}>
        <p className="mb-4" style={{ color: 'var(--color-on-surface)' }}>Version „{label}" wird dauerhaft gelöscht.</p>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-md text-sm" style={{ background: 'var(--color-surface-container)', color: 'var(--color-on-surface)' }}>Abbrechen</button>
          <button type="button" onClick={() => { onConfirm(); onClose(); }} className="px-3 py-1.5 rounded-md text-sm" style={{ background: '#7f1d1d', color: '#fecaca' }}>Löschen</button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: `UspVersions.tsx`**

```tsx
import { useState } from 'react';
import { getUspVersionPdfObjectUrl, type UspVersion } from '../../../api/amazon.api';
import { useUspVersions, useDeleteUspVersion } from '../../../hooks/amazon/useUsp';
import { DeleteUspVersionDialog } from './DeleteUspVersionDialog';

function fmt(ts: number): string {
  return new Date(ts * 1000).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
}

export function UspVersions({ productId }: { productId: number }) {
  const { data: versions = [], isLoading } = useUspVersions(productId);
  const del = useDeleteUspVersion(productId);
  const [pendingDelete, setPendingDelete] = useState<UspVersion | null>(null);

  async function open(v: UspVersion) {
    const url = await getUspVersionPdfObjectUrl(productId, v.id);
    window.open(url, '_blank');
  }
  async function download(v: UspVersion) {
    const url = await getUspVersionPdfObjectUrl(productId, v.id);
    const a = document.createElement('a');
    a.href = url; a.download = `Produktanfrage_${v.manufacturer_name || 'Hersteller'}.pdf`;
    a.click();
  }

  return (
    <div className="mt-4">
      <span className="text-xs uppercase tracking-wide block mb-2" style={{ color: 'var(--color-on-surface-variant)' }}>Versionen</span>
      {isLoading && <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>Lade …</p>}
      {!isLoading && versions.length === 0 && (
        <p className="text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>Noch keine Versionen gespeichert.</p>
      )}
      <div className="flex flex-col gap-1">
        {versions.map(v => (
          <div key={v.id} className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm"
            style={{ background: 'var(--color-surface-container)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <span style={{ color: 'var(--color-on-surface)', minWidth: 160 }}>{v.manufacturer_name || 'Hersteller'}</span>
            <span style={{ color: 'var(--color-on-surface-variant)' }}>{fmt(v.created_at)}</span>
            <div className="ml-auto flex items-center gap-1">
              <button type="button" onClick={() => open(v)} className="px-2 py-1 rounded-md text-xs flex items-center gap-1"
                style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>visibility</span>Ansehen
              </button>
              <button type="button" onClick={() => download(v)} className="px-2 py-1 rounded-md text-xs flex items-center gap-1"
                style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>download</span>Herunterladen
              </button>
              <button type="button" onClick={() => setPendingDelete(v)} className="p-1 rounded-md" style={{ color: '#fca5a5' }} aria-label="Version löschen">
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>delete</span>
              </button>
            </div>
          </div>
        ))}
      </div>
      {pendingDelete && (
        <DeleteUspVersionDialog
          label={`${pendingDelete.manufacturer_name || 'Hersteller'} · ${fmt(pendingDelete.created_at)}`}
          onConfirm={() => del.mutate(pendingDelete.id)}
          onClose={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck + Commit**

Run: `cd "<repo>/frontend" && npx tsc --noEmit 2>&1 | grep -E "UspVersions|DeleteUspVersionDialog" || echo "components clean"`
Expected: keine Fehler in den neuen Dateien.
```bash
git add "frontend/src/components/amazon/usp/UspVersions.tsx" "frontend/src/components/amazon/usp/DeleteUspVersionDialog.tsx"
git commit -m "feat(amazon-usp): Versions-Liste + Loesch-Dialog" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: `UspSection` — Export-Leiste (Vorschau/Herunterladen/Version) + Versions-Liste

**Files:** Modify `frontend/src/components/amazon/usp/UspSection.tsx`

- [ ] **Step 1: Imports ergänzen**

Ergänze den Hook-Import um `useSaveUspVersion`:
```ts
import { useUsp, useCreateUspPoint, useDeleteUspPoint, useUpdateUspMeta, useSaveUspVersion } from '../../../hooks/amazon/useUsp';
```
Und füge nach den bestehenden Component-Imports hinzu:
```ts
import { UspVersions } from './UspVersions';
```

- [ ] **Step 2: Hook + `buildPdf`-Helfer; alten `handleExport` ersetzen**

Ergänze bei den Hooks (nach `const updateMeta = useUpdateUspMeta(productId);`):
```ts
  const saveVersion = useSaveUspVersion(productId);
```

Ersetze die bestehende Funktion `handleExport` (von `async function handleExport() {` bis zur schließenden Klammer) durch:
```ts
  async function buildPdf(): Promise<{ blob: Blob; filename: string; manufacturerName: string } | null> {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    await new Promise(r => setTimeout(r, 350));
    const fresh = await refetch();
    if (!fresh.data) return null;
    const m = fresh.data.manufacturers.find(x => x.id === selectedMId) ?? fresh.data.manufacturers[0];
    if (!m) return null;
    const incMap = new Map<number, number>();
    for (const f of fresh.data.feasibility) if (f.manufacturer_id === m.id) incMap.set(f.point_id, f.include_in_pdf);
    const included = fresh.data.points.filter(p => (incMap.get(p.id) ?? 1) !== 0);
    const { blob, filename } = await exportUspPdf(productId, productName, fresh.data.meta, included, m);
    return { blob, filename, manufacturerName: m.name || 'Hersteller' };
  }
  async function handlePreview() {
    const r = await buildPdf();
    if (r) window.open(URL.createObjectURL(r.blob), '_blank');
  }
  async function handleDownload() {
    const r = await buildPdf();
    if (!r) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(r.blob); a.download = r.filename; a.click();
  }
  async function handleSaveVersion() {
    const r = await buildPdf();
    if (r) saveVersion.mutate({ manufacturerName: r.manufacturerName, blob: r.blob });
  }
```

- [ ] **Step 3: Export-Leiste ersetzen + Versions-Liste rendern**

Ersetze den Button-Block (den einzelnen „PDF exportieren"-Button) durch drei Buttons. Finde:
```tsx
                <button
                  type="button"
                  onClick={handleExport}
                  className="px-3 py-1.5 rounded-md text-sm flex items-center gap-1.5"
                  style={{ background: ACCENT, color: '#08131f' }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>picture_as_pdf</span>
                  PDF exportieren
                </button>
```
und ersetze es durch:
```tsx
                <button type="button" onClick={handlePreview} className="px-3 py-1.5 rounded-md text-sm flex items-center gap-1.5"
                  style={{ background: ACCENT, color: '#08131f' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>visibility</span>Vorschau
                </button>
                <button type="button" onClick={handleDownload} className="px-3 py-1.5 rounded-md text-sm flex items-center gap-1.5"
                  style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>download</span>Herunterladen
                </button>
                <button type="button" onClick={handleSaveVersion} className="px-3 py-1.5 rounded-md text-sm flex items-center gap-1.5"
                  style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>save</span>Als Version speichern
                </button>
```

Direkt **nach** dem schließenden `</div>` dieser Export-Leiste (also nach `</div>` der `<div className="flex items-center gap-2">`-Zeile) die Versions-Liste einfügen:
```tsx
              <UspVersions productId={productId} />
```

- [ ] **Step 4: Typecheck + Build**

Run: `cd "<repo>/frontend" && npx tsc --noEmit && npx vite build`
Expected: PASS + Build erfolgreich.

- [ ] **Step 5: Commit**
```bash
git add "frontend/src/components/amazon/usp/UspSection.tsx"
git commit -m "feat(amazon-usp): Export-Leiste Vorschau/Herunterladen/Version + Versions-Liste" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Verifikation (UAT)

- [ ] **Step 1:** Backend neu starten (Migration 074 + Auto-Backup). Stale Backend: `lsof -i :3001`, `pkill -f "tsx watch"`, neu starten.
- [ ] **Step 2:** Hersteller wählen → **Vorschau** → PDF öffnet im neuen Tab.
- [ ] **Step 3:** **Herunterladen** lädt das PDF.
- [ ] **Step 4:** **Als Version speichern** → Version erscheint in der Liste (Hersteller + Datum).
- [ ] **Step 5:** Ein Punkt-Bild ändern, neue Version speichern → **alte Version zeigt weiterhin die alten Bilder** (Ansehen prüfen), neue die neuen.
- [ ] **Step 6:** **Ansehen** einer Version öffnet das richtige PDF; **Löschen** entfernt sie (nach Bestätigung).
- [ ] **Step 7:** Abschluss; bei Abweichung → systematic-debugging.

---

## Self-Review

**Spec coverage:** Tabelle/Migration 074 → T1 ✅ · Routen Upload/Liste/PDF/Delete + Tests → T2 ✅ · exportUspPdf gibt Blob zurück → T3 ✅ · API → T4 ✅ · Hooks → T5 ✅ · Versions-Liste + Lösch-Dialog → T6 ✅ · Export-Leiste (Vorschau/Download/Version) + Einbindung → T7 ✅ · UAT → T8 ✅. Datensicherheit (additiv, Auto-Backup) → T1.

**Placeholder scan:** keine TBD/TODO; jeder Code-Schritt vollständig.

**Type consistency:** `UspVersion` einheitlich (API T4, Hooks T5, Komponente T6). `exportUspPdf` Rückgabe `{ blob, filename }` konsistent zwischen T3 und der Nutzung in T7. Endpunkt-Pfade identisch Backend (T2) ↔ API (T4). `manufacturer_name` Feldname konsistent Backend/Frontend.
