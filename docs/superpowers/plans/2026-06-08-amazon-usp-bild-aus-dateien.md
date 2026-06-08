# Amazon USP — Bild aus persönlichen Dateien als Punkt-Bild — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein bereits im „Dateien & Bild-Ideen"-Bereich hochgeladenes Bild lässt sich mit einem Klick als Punkt-Bild übernehmen (Datei wird kopiert, bleibt unabhängig erhalten).

**Architecture:** Neue Backend-Route kopiert eine persönliche Bild-Datei (`amazon_usp_files`) physisch in den Punkt-Bild-Ordner und legt eine `amazon_usp_point_images`-Zeile an — identisches Antwortformat wie der normale Upload. Frontend bekommt API-Funktion + Hook + ein eingeklapptes Auswahl-Panel in `UspPointRow`; die (auf Bilder gefilterten) Dateien werden von `UspSection` über `UspPointList` durchgereicht.

**Tech Stack:** Express 5 + better-sqlite3 (Backend), React 19 + TanStack Query + Tailwind v4 (Frontend), Vitest + supertest (Backend-Tests).

**Spec:** `docs/superpowers/specs/2026-06-08-amazon-usp-bild-aus-dateien-design.md`

---

## File Structure

- **Modify** `backend/src/routes/amazon.usp.routes.ts` — neue Route `POST /products/:id/usp/points/:pointId/images/from-file`. Direkt nach dem bestehenden `POST .../images`-Handler (endet bei Zeile 266) einfügen.
- **Modify** `backend/test/integration.amazon_usp.test.ts` — neuer `describe`-Block „USP API — Punkt-Bild aus Datei" am Ende vor keiner weiteren Abhängigkeit.
- **Modify** `frontend/src/api/amazon.api.ts` — neue Funktion `addUspPointImageFromFile`.
- **Modify** `frontend/src/hooks/amazon/useUsp.ts` — neuer Hook `useAddUspPointImageFromFile`.
- **Modify** `frontend/src/components/amazon/usp/UspPointRow.tsx` — Auswahl-Button + Panel; neue Prop `imageFiles`.
- **Modify** `frontend/src/components/amazon/usp/UspPointList.tsx` — Prop `imageFiles` annehmen + durchreichen.
- **Modify** `frontend/src/components/amazon/usp/UspSection.tsx` — `data.files` auf Bilder filtern und als `imageFiles` an `UspPointList` geben.

---

### Task 1: Backend-Route `from-file` (TDD)

**Files:**
- Modify: `backend/src/routes/amazon.usp.routes.ts` (nach Zeile 266)
- Test: `backend/test/integration.amazon_usp.test.ts` (neuer describe-Block am Dateiende, vor `describe('USP API — Hersteller + Feasibility'`-Reihenfolge egal — einfach anhängen)

- [ ] **Step 1: Failing-Tests schreiben**

Am Ende von `backend/test/integration.amazon_usp.test.ts` (nach dem letzten `describe`, vor evtl. nichts) diesen Block anhängen:

```ts
describe('USP API — Punkt-Bild aus Datei', () => {
  let db: Database.Database; let app: express.Express;
  beforeEach(async () => { db = createTestDb(); app = await makeApp(db); });
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  const PDF = Buffer.from('%PDF-1.4 testdatei');
  async function makePoint(pid: number): Promise<number> {
    const a = await request(app).post(`/api/amazon/products/${pid}/usp/points`).send({});
    return a.body.point.id;
  }
  async function uploadFile(pid: number, buf: Buffer, name: string, type: string): Promise<number> {
    const up = await request(app).post(`/api/amazon/products/${pid}/usp/files`).attach('file', buf, { filename: name, contentType: type });
    return up.body.file.id;
  }

  it('kopiert ein Bild aus den Dateien als Punkt-Bild (eigene Kopie)', async () => {
    const pid = makeProduct(db); await request(app).get(`/api/amazon/products/${pid}/usp`);
    const point = await makePoint(pid);
    const fileId = await uploadFile(pid, PNG, 'idee.png', 'image/png');
    const srcPath = (db.prepare(`SELECT file_path FROM amazon_usp_files WHERE id=?`).get(fileId) as { file_path: string }).file_path;

    const r = await request(app).post(`/api/amazon/products/${pid}/usp/points/${point}/images/from-file`).send({ file_id: fileId });
    expect(r.status).toBe(201);
    expect(r.body.image).toMatchObject({ point_id: point, sort_order: 1 });
    // eigene Kopie: Punkt-Bild zeigt auf eine ANDERE Datei als die Quelle
    expect(r.body.image.file_path).not.toBe(srcPath);
    // GET liefert das kopierte Bild aus
    const get = await request(app).get(`/api/amazon/products/${pid}/usp/images/${r.body.image.id}`);
    expect(get.status).toBe(200);
    expect(get.headers['content-type']).toContain('image/png');
  });

  it('Punkt-Bild überlebt das Löschen der persönlichen Datei', async () => {
    const pid = makeProduct(db); await request(app).get(`/api/amazon/products/${pid}/usp`);
    const point = await makePoint(pid);
    const fileId = await uploadFile(pid, PNG, 'idee.png', 'image/png');
    const r = await request(app).post(`/api/amazon/products/${pid}/usp/points/${point}/images/from-file`).send({ file_id: fileId });
    const imageId = r.body.image.id;
    expect((await request(app).delete(`/api/amazon/products/${pid}/usp/files/${fileId}`)).status).toBe(204);
    // Zeile + Datei bestehen weiter
    expect((db.prepare(`SELECT COUNT(*) AS c FROM amazon_usp_point_images WHERE id=?`).get(imageId) as { c: number }).c).toBe(1);
    expect((await request(app).get(`/api/amazon/products/${pid}/usp/images/${imageId}`)).status).toBe(200);
  });

  it('Nicht-Bild-Datei -> 400, kein Punkt-Bild', async () => {
    const pid = makeProduct(db); await request(app).get(`/api/amazon/products/${pid}/usp`);
    const point = await makePoint(pid);
    const fileId = await uploadFile(pid, PDF, 'doku.pdf', 'application/pdf');
    const r = await request(app).post(`/api/amazon/products/${pid}/usp/points/${point}/images/from-file`).send({ file_id: fileId });
    expect(r.status).toBe(400);
    expect((db.prepare(`SELECT COUNT(*) AS c FROM amazon_usp_point_images WHERE point_id=?`).get(point) as { c: number }).c).toBe(0);
  });

  it('fremde Datei eines anderen Produkts -> 404', async () => {
    const pA = makeProduct(db, 'A'); const pB = makeProduct(db, 'B');
    await request(app).get(`/api/amazon/products/${pA}/usp`);
    await request(app).get(`/api/amazon/products/${pB}/usp`);
    const pointA = await makePoint(pA);
    const fileB = await uploadFile(pB, PNG, 'b.png', 'image/png');
    const r = await request(app).post(`/api/amazon/products/${pA}/usp/points/${pointA}/images/from-file`).send({ file_id: fileB });
    expect(r.status).toBe(404);
  });

  it('ungültige file_id -> 400', async () => {
    const pid = makeProduct(db); await request(app).get(`/api/amazon/products/${pid}/usp`);
    const point = await makePoint(pid);
    const r = await request(app).post(`/api/amazon/products/${pid}/usp/points/${point}/images/from-file`).send({ file_id: 'x' });
    expect(r.status).toBe(400);
  });
});
```

- [ ] **Step 2: Tests laufen lassen — müssen fehlschlagen**

Run: `cd backend && npx vitest run test/integration.amazon_usp.test.ts -t "Punkt-Bild aus Datei"`
Expected: FAIL — die `from-file`-Route existiert noch nicht (404 statt 201/400).

- [ ] **Step 3: Route implementieren**

In `backend/src/routes/amazon.usp.routes.ts` direkt **nach** dem bestehenden Handler `router.post('/products/:id/usp/points/:pointId/images', …)` (endet mit `});` in Zeile 266) folgenden Block einfügen:

```ts
router.post('/products/:id/usp/points/:pointId/images/from-file', (req: Request, res: Response) => {
  const id = Number(req.params.id); const pointId = Number(req.params.pointId);
  if (!Number.isInteger(id) || !Number.isInteger(pointId)) { res.status(404).json({ error: 'not found' }); return; }
  if (!ensureProduct(id) || !loadPointForProduct(id, pointId)) { res.status(404).json({ error: 'not found' }); return; }
  const fileId = Number((req.body as { file_id?: unknown })?.file_id);
  if (!Number.isInteger(fileId)) { res.status(400).json({ error: 'invalid file_id' }); return; }
  const file = loadFileForProduct(id, fileId);
  if (!file) { res.status(404).json({ error: 'not found' }); return; }
  if (!file.mime.startsWith('image/')) { res.status(400).json({ error: 'not an image' }); return; }
  const src = path.resolve(FILES_DIR, file.file_path);
  if (!src.startsWith(path.resolve(FILES_DIR) + path.sep) || !fs.existsSync(src)) { res.status(404).json({ error: 'not found' }); return; }
  const destName = `${crypto.randomUUID()}${path.extname(file.file_path) || ''}`;
  fs.copyFileSync(src, path.join(UPLOAD_DIR, destName));
  const maxOrder = (db.prepare(`SELECT COALESCE(MAX(sort_order),0) AS m FROM amazon_usp_point_images WHERE point_id = ?`).get(pointId) as { m: number }).m;
  const r = db.prepare(`INSERT INTO amazon_usp_point_images (point_id, sort_order, file_path) VALUES (?, ?, ?)`).run(pointId, maxOrder + 1, destName);
  res.status(201).json({ image: db.prepare(`SELECT * FROM amazon_usp_point_images WHERE id = ?`).get(r.lastInsertRowid) as ImageRow });
});
```

Hinweise: `ensureProduct`, `loadPointForProduct`, `loadFileForProduct`, `FILES_DIR`, `UPLOAD_DIR`, `ImageRow`, `crypto`, `path`, `fs` sind in der Datei bereits vorhanden — keine neuen Imports nötig.

- [ ] **Step 4: Tests laufen lassen — müssen grün sein**

Run: `cd backend && npx vitest run test/integration.amazon_usp.test.ts -t "Punkt-Bild aus Datei"`
Expected: PASS (5 Tests grün).

- [ ] **Step 5: Gesamte Backend-Tests laufen lassen (keine Regression)**

Run: `cd backend && npx vitest run`
Expected: PASS — alle bisherigen Tests weiterhin grün (266+ Tests, jetzt +5).

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/amazon.usp.routes.ts backend/test/integration.amazon_usp.test.ts
git commit -m "feat(amazon-usp): Backend — Punkt-Bild aus persoenlicher Datei kopieren"
```

---

### Task 2: Frontend API-Funktion + Hook

**Files:**
- Modify: `frontend/src/api/amazon.api.ts` (nach `deleteUspPointImage`, ~Zeile 407)
- Modify: `frontend/src/hooks/amazon/useUsp.ts` (nach `useDeleteUspPointImage`, ~Zeile 67)

- [ ] **Step 1: API-Funktion hinzufügen**

In `frontend/src/api/amazon.api.ts` direkt nach der Funktion `deleteUspPointImage` (vor `getUspImageObjectUrl`) einfügen:

```ts
export async function addUspPointImageFromFile(productId: number, pointId: number, fileId: number): Promise<UspPointImage> {
  return ((await apiClient.post(`/amazon/products/${productId}/usp/points/${pointId}/images/from-file`, { file_id: fileId })).data as { image: UspPointImage }).image;
}
```

(`UspPointImage` und `apiClient` sind in der Datei bereits vorhanden.)

- [ ] **Step 2: Hook hinzufügen**

In `frontend/src/hooks/amazon/useUsp.ts` direkt nach `useDeleteUspPointImage` einfügen:

```ts
export function useAddUspPointImageFromFile(productId: number) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: ({ pointId, fileId }: { pointId: number; fileId: number }) => addUspPointImageFromFile(productId, pointId, fileId), onSettled: inval(productId, qc) });
}
```

Außerdem den Import in `useUsp.ts` ergänzen: in der bestehenden Import-Zeile aus `'../../api/amazon.api'` (die u. a. `uploadUspPointImage`, `deleteUspPointImage` importiert) den Namen `addUspPointImageFromFile` mit aufnehmen.

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS — keine Typfehler.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api/amazon.api.ts frontend/src/hooks/amazon/useUsp.ts
git commit -m "feat(amazon-usp): Frontend-API + Hook fuer Punkt-Bild aus Datei"
```

---

### Task 3: Auswahl-Panel in `UspPointRow` + `imageFiles` durchreichen

**Files:**
- Modify: `frontend/src/components/amazon/usp/UspSection.tsx:136-142`
- Modify: `frontend/src/components/amazon/usp/UspPointList.tsx`
- Modify: `frontend/src/components/amazon/usp/UspPointRow.tsx`

- [ ] **Step 1: `UspSection` — Bild-Dateien filtern und übergeben**

In `frontend/src/components/amazon/usp/UspSection.tsx` den `UspPointList`-Aufruf (Zeilen 136–142) so erweitern, dass `imageFiles` übergeben wird:

```tsx
              <UspPointList
                productId={productId}
                points={data.points}
                manufacturerId={activeMId}
                feasibility={data.feasibility}
                onRequestDelete={setPendingDelete}
                imageFiles={data.files.filter(f => f.mime.startsWith('image/'))}
              />
```

(`data.files` ist Teil des `UspPayload` und hier bereits verfügbar.)

- [ ] **Step 2: `UspPointList` — Prop annehmen und durchreichen**

In `frontend/src/components/amazon/usp/UspPointList.tsx`:

a) Import um `UspFile` erweitern — die bestehende Import-Zeile
`import { type UspPoint, type UspFeasibility } from '../../../api/amazon.api';`
wird zu:
```tsx
import { type UspPoint, type UspFeasibility, type UspFile } from '../../../api/amazon.api';
```

b) Die Props-Destrukturierung der Funktion erweitern. Aus:
```tsx
export function UspPointList({ productId, points, manufacturerId, feasibility, onRequestDelete }: {
  productId: number; points: UspPoint[]; manufacturerId: number | null; feasibility: UspFeasibility[]; onRequestDelete: (p: UspPoint) => void;
}) {
```
wird:
```tsx
export function UspPointList({ productId, points, manufacturerId, feasibility, onRequestDelete, imageFiles }: {
  productId: number; points: UspPoint[]; manufacturerId: number | null; feasibility: UspFeasibility[]; onRequestDelete: (p: UspPoint) => void; imageFiles: UspFile[];
}) {
```

c) Im `UspPointRow`-Aufruf (innerhalb von `ordered.map`) das `imageFiles`-Prop ergänzen. Aus:
```tsx
          <UspPointRow key={p.id} productId={productId} index={idx} point={p} onRequestDelete={onRequestDelete}
            hasManufacturer={manufacturerId != null}
            includeInPdf={included}
            onToggleInclude={() => { if (manufacturerId != null) setFeas.mutate({ point_id: p.id, manufacturer_id: manufacturerId, include_in_pdf: included ? 0 : 1 }); }}
            dragHandleProps={{ onPointerDown: (e) => down(idx, e), onPointerEnter: () => enter(idx), onPointerUp: up }} />
```
wird (nur `imageFiles={imageFiles}` ergänzt):
```tsx
          <UspPointRow key={p.id} productId={productId} index={idx} point={p} onRequestDelete={onRequestDelete}
            hasManufacturer={manufacturerId != null}
            includeInPdf={included}
            imageFiles={imageFiles}
            onToggleInclude={() => { if (manufacturerId != null) setFeas.mutate({ point_id: p.id, manufacturer_id: manufacturerId, include_in_pdf: included ? 0 : 1 }); }}
            dragHandleProps={{ onPointerDown: (e) => down(idx, e), onPointerEnter: () => enter(idx), onPointerUp: up }} />
```

- [ ] **Step 3: `UspPointRow` — Imports erweitern**

In `frontend/src/components/amazon/usp/UspPointRow.tsx`:

a) Zeile 2 (Import aus `amazon.api`) um `getUspFileObjectUrl` und `UspFile` erweitern. Aus:
```tsx
import { type UspPoint, type UspPointQuestion } from '../../../api/amazon.api';
```
wird:
```tsx
import { type UspPoint, type UspPointQuestion, type UspFile, getUspFileObjectUrl } from '../../../api/amazon.api';
```

b) Die Hook-Imports (Zeilen 3–6) um `useAddUspPointImageFromFile` erweitern. Aus:
```tsx
import {
  useUpdateUspPoint, useUploadUspPointImage,
  useCreateUspPointQuestion, useUpdateUspPointQuestion, useDeleteUspPointQuestion,
} from '../../../hooks/amazon/useUsp';
```
wird:
```tsx
import {
  useUpdateUspPoint, useUploadUspPointImage, useAddUspPointImageFromFile,
  useCreateUspPointQuestion, useUpdateUspPointQuestion, useDeleteUspPointQuestion,
} from '../../../hooks/amazon/useUsp';
```

- [ ] **Step 4: `UspPointRow` — Picker-Thumbnail-Komponente ergänzen**

In `frontend/src/components/amazon/usp/UspPointRow.tsx` oberhalb von `interface Props` (vor Zeile 44) folgende Komponente einfügen:

```tsx
function PickerThumb({ productId, file, onPick }: { productId: number; file: UspFile; onPick: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let revoked = false; let url: string | null = null;
    getUspFileObjectUrl(productId, file.id).then(u => { if (revoked) { URL.revokeObjectURL(u); return; } url = u; setSrc(u); }).catch(() => setSrc(null));
    return () => { revoked = true; if (url) URL.revokeObjectURL(url); };
  }, [productId, file.id]);
  return (
    <button type="button" onClick={onPick} title={file.original_name}
      className="rounded-md overflow-hidden flex-shrink-0" style={{ width: 64, height: 64, background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.08)' }}>
      {src ? <img src={src} alt="" className="w-full h-full object-cover" /> : null}
    </button>
  );
}
```

- [ ] **Step 5: `UspPointRow` — Prop + State + Hook**

a) Das `Props`-Interface (Zeilen 44–51) um `imageFiles` erweitern. Aus:
```tsx
interface Props {
  productId: number; index: number; point: UspPoint;
  onRequestDelete: (p: UspPoint) => void;
  hasManufacturer: boolean;
  includeInPdf: boolean;
  onToggleInclude: () => void;
  dragHandleProps: React.HTMLAttributes<HTMLDivElement>;
}
```
wird:
```tsx
interface Props {
  productId: number; index: number; point: UspPoint;
  onRequestDelete: (p: UspPoint) => void;
  hasManufacturer: boolean;
  includeInPdf: boolean;
  imageFiles: UspFile[];
  onToggleInclude: () => void;
  dragHandleProps: React.HTMLAttributes<HTMLDivElement>;
}
```

b) Die Funktionssignatur (Zeile 52) um `imageFiles` erweitern. Aus:
```tsx
export function UspPointRow({ productId, index, point, onRequestDelete, hasManufacturer, includeInPdf, onToggleInclude, dragHandleProps }: Props) {
```
wird:
```tsx
export function UspPointRow({ productId, index, point, onRequestDelete, hasManufacturer, includeInPdf, imageFiles, onToggleInclude, dragHandleProps }: Props) {
```

c) Nach `const uploadImg = useUploadUspPointImage(productId);` (Zeile 54) zwei Zeilen ergänzen:
```tsx
  const addFromFile = useAddUspPointImageFromFile(productId);
  const [pickerOpen, setPickerOpen] = useState(false);
```

- [ ] **Step 6: `UspPointRow` — Button + Panel rendern**

Den bestehenden „Bild hinzufügen"-Block (Zeilen 104–112) ersetzen. Aus:
```tsx
      <div className="mt-2">
        <button type="button" onClick={() => fileInput.current?.click()} className="px-2.5 py-1 rounded-md text-xs flex items-center gap-1.5"
          style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add_photo_alternate</span>Bild hinzufügen
        </button>
        <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
          onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
        {error && <p className="text-xs mt-1" style={{ color: '#fca5a5' }}>{error}</p>}
      </div>
```
wird:
```tsx
      <div className="mt-2">
        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" onClick={() => fileInput.current?.click()} className="px-2.5 py-1 rounded-md text-xs flex items-center gap-1.5"
            style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add_photo_alternate</span>Bild hinzufügen
          </button>
          <button type="button" onClick={() => setPickerOpen(o => !o)} className="px-2.5 py-1 rounded-md text-xs flex items-center gap-1.5"
            style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>collections</span>Aus Dateien wählen
          </button>
        </div>
        <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
          onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
        {error && <p className="text-xs mt-1" style={{ color: '#fca5a5' }}>{error}</p>}
        {pickerOpen && (
          <div className="mt-2 rounded-md p-2" style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.08)' }}>
            {imageFiles.length === 0
              ? <p className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>Noch keine Bilder im Dateien-Bereich.</p>
              : <div className="flex flex-wrap gap-2">
                  {imageFiles.map(f => (
                    <PickerThumb key={f.id} productId={productId} file={f}
                      onPick={() => { addFromFile.mutate({ pointId: point.id, fileId: f.id }); setPickerOpen(false); }} />
                  ))}
                </div>}
          </div>
        )}
      </div>
```

- [ ] **Step 7: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: PASS — keine Typfehler.

- [ ] **Step 8: Build**

Run: `cd frontend && npx vite build`
Expected: PASS — Build ohne Fehler.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/amazon/usp/UspSection.tsx frontend/src/components/amazon/usp/UspPointList.tsx frontend/src/components/amazon/usp/UspPointRow.tsx
git commit -m "feat(amazon-usp): 'Aus Dateien waehlen' — Bild als Punkt-Bild uebernehmen"
```

---

## Manuelles UAT (nach allen Tasks)

1. Backend neu starten (tsx-watch lädt `.ts`-Änderungen; bei Bedarf `pkill -f "tsx watch"` + `npm run dev` + `curl http://localhost:3001/api/health`).
2. Produkt öffnen → USP → Persönlich-Block: ein Bild **und** eine PDF in „Dateien & Bild-Ideen" hochladen.
3. Bei einem Anforderungs-Punkt „Aus Dateien wählen" klicken → Panel zeigt **nur** das Bild (keine PDF).
4. Bild anklicken → erscheint als Punkt-Bild; Panel schließt.
5. Die persönliche Bild-Datei im Dateien-Bereich löschen → Punkt-Bild bleibt sichtbar.
6. Punkt ohne persönliche Bilder: „Aus Dateien wählen" zeigt „Noch keine Bilder im Dateien-Bereich".
