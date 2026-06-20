# Sample-Prüfbericht — Umsetzungsplan

> **Für Umsetzer:** Schritt für Schritt umsetzen, je Task atomar committen. Verifikation in diesem Projekt = `npm --prefix frontend run typecheck` + `tsc` im Backend + laufende App (HMR) prüfen. Es gibt kein Unit-Test-Framework — daher Verifikation über Typecheck + manuelle UAT-Schritte. Status pro Schritt via Checkbox.

**Ziel:** Pro Sample einen digital erfassbaren Prüfbericht auf Basis der USP-Anforderungen, plus Druck-PDF (ausgefüllt + Linien) mit Notizseite am Ende.

**Architektur:** Neue Tabelle für Prüfergebnisse je Sample+USP-Punkt + Notiz-Spalte am Sample. Backend-Endpunkte im bestehenden `amazon.manufacturers.routes.ts`. Frontend: verschiebbares Modal am Sample (im `ManufacturerSamples`-Bereich) + TanStack-Query-Hook. PDF clientseitig mit jsPDF (Muster: `exportUspPdf.ts`).

**Tech:** Express 5 + better-sqlite3, React 19 + TanStack Query + Tailwind (Inline-Styles mit CSS-Variablen), jsPDF.

**Referenz-Spec:** `docs/superpowers/specs/2026-06-20-sample-pruefbericht-design.md`

**Entscheidungen (aus Brainstorming):** pro Sample · Status (erfuellt/teilweise/nicht/offen) + Bemerkung je Punkt · PDF gemischt (ausgefüllt + leere Linien) · Soll/Ist anzeigen (ja) · verschiebbares Modal.

---

## Task 1: DB-Migration (Tabelle + Notiz-Spalte)

**Files:**
- Create: `backend/src/db/migrations/091_amazon_sample_inspection.sql`

- [ ] **Step 1: Migration schreiben**

```sql
-- Prüfergebnisse je Sample + USP-Punkt
CREATE TABLE amazon_sample_inspection_results (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  sample_id   INTEGER NOT NULL REFERENCES amazon_manufacturer_samples(id) ON DELETE CASCADE,
  point_id    INTEGER NOT NULL REFERENCES amazon_usp_points(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'offen',  -- 'erfuellt' | 'teilweise' | 'nicht' | 'offen'
  note        TEXT,
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (sample_id, point_id)
);
CREATE INDEX idx_sample_inspection_sample ON amazon_sample_inspection_results(sample_id);

-- Zusatz-Notizen des Prüfberichts (letzte PDF-Seite)
ALTER TABLE amazon_manufacturer_samples ADD COLUMN inspection_notes TEXT;
```

- [ ] **Step 2: Backend starten und Migration prüfen**

Run: Backend-Log beobachten (läuft via `npm run dev`). Erwartet: `[migrate] applied 091_amazon_sample_inspection.sql` (oder „All migrations up to date" beim Neustart). `PRAGMA foreign_keys` NICHT in der Migration setzen (zentral in migrate.ts).

- [ ] **Step 3: Commit**

```bash
git add backend/src/db/migrations/091_amazon_sample_inspection.sql
git commit -m "feat(amazon-samples): Migration fuer Sample-Pruefbericht (Ergebnisse + Notizen)"
```

---

## Task 2: Backend — Laden des Prüfberichts (GET)

**Files:**
- Modify: `backend/src/routes/amazon.manufacturers.routes.ts`

Kontext: USP-Punkte des Produkts laden (Tabelle `amazon_usp_points`, Felder `id, title, body, sort_order`; Fragen in `amazon_usp_point_questions`). „Soll" = Hersteller-Angabe: in `amazon_usp_manufacturers` die Zeile mit `manufacturer_id = <Sample-Hersteller>` finden, dann `amazon_usp_feasibility.status` je `point_id`. (Genaue Tabellen-/Spaltennamen vor dem Schreiben in `amazon.usp.routes.ts` gegenprüfen — dort gibt es bereits `loadPoints`/`loadFeasibility`.)

- [ ] **Step 1: Lade-Helfer + GET-Route ergänzen**

```ts
// Helfer: Produkt-ID + Hersteller zum Sample auflösen
function sampleContext(sampleId: number) {
  return db.prepare(`
    SELECT s.id AS sample_id, s.manufacturer_id, s.inspection_notes,
           m.product_id, p.name AS product_name
    FROM amazon_manufacturer_samples s
    JOIN amazon_manufacturers m ON m.id = s.manufacturer_id
    JOIN amazon_products p ON p.id = m.product_id
    WHERE s.id = ?
  `).get(sampleId) as
    | { sample_id: number; manufacturer_id: number; inspection_notes: string | null; product_id: number; product_name: string }
    | undefined;
}

// GET /products/:id/manufacturers/:mId/samples/:sampleId/inspection
router.get('/products/:id/manufacturers/:mId/samples/:sampleId/inspection', (req: Request, res: Response) => {
  const sampleId = Number(req.params.sampleId);
  const ctx = sampleContext(sampleId);
  if (!ctx) { res.status(404).json({ error: 'sample not found' }); return; }

  const points = db.prepare(
    `SELECT id, title, body, sort_order FROM amazon_usp_points WHERE product_id = ? ORDER BY sort_order, id`
  ).all(ctx.product_id) as { id: number; title: string; body: string | null; sort_order: number }[];

  const questionsByPoint = new Map<number, string[]>();
  for (const q of db.prepare(
    `SELECT point_id, text FROM amazon_usp_point_questions WHERE point_id IN (SELECT id FROM amazon_usp_points WHERE product_id = ?) ORDER BY id`
  ).all(ctx.product_id) as { point_id: number; text: string }[]) {
    (questionsByPoint.get(q.point_id) ?? questionsByPoint.set(q.point_id, []).get(q.point_id)!).push(q.text);
  }

  // Soll: Hersteller-Angabe (falls dieser Hersteller im USP verknuepft ist)
  const uspMan = db.prepare(
    `SELECT id FROM amazon_usp_manufacturers WHERE product_id = ? AND manufacturer_id = ?`
  ).get(ctx.product_id, ctx.manufacturer_id) as { id: number } | undefined;
  const sollByPoint = new Map<number, string>();
  if (uspMan) {
    for (const f of db.prepare(
      `SELECT point_id, status FROM amazon_usp_feasibility WHERE manufacturer_id = ?`
    ).all(uspMan.id) as { point_id: number; status: string }[]) {
      sollByPoint.set(f.point_id, f.status);
    }
  }

  const resultByPoint = new Map<number, { status: string; note: string | null }>();
  for (const r of db.prepare(
    `SELECT point_id, status, note FROM amazon_sample_inspection_results WHERE sample_id = ?`
  ).all(sampleId) as { point_id: number; status: string; note: string | null }[]) {
    resultByPoint.set(r.point_id, { status: r.status, note: r.note });
  }

  res.json({
    product_name: ctx.product_name,
    inspection_notes: ctx.inspection_notes,
    points: points.map(p => ({
      id: p.id,
      title: p.title,
      body: p.body,
      questions: questionsByPoint.get(p.id) ?? [],
      soll_status: sollByPoint.get(p.id) ?? null,
      ist_status: resultByPoint.get(p.id)?.status ?? 'offen',
      ist_note: resultByPoint.get(p.id)?.note ?? null,
    })),
  });
});
```

- [ ] **Step 2: Verifizieren**

Run: `cd backend && npx tsc --noEmit` → keine Fehler. Backend neu laden (tsx watch). Mit JWT testen:
`curl -s -H "Authorization: Bearer <token>" http://localhost:3001/api/amazon/products/<pid>/manufacturers/<mid>/samples/<sid>/inspection | jq` → liefert `points[]` mit `soll_status`/`ist_status`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/amazon.manufacturers.routes.ts
git commit -m "feat(amazon-samples): GET Pruefbericht (USP-Punkte + Soll/Ist)"
```

---

## Task 3: Backend — Speichern (PUT Ergebnis, PATCH Notizen)

**Files:**
- Modify: `backend/src/routes/amazon.manufacturers.routes.ts`

- [ ] **Step 1: Routen ergänzen**

```ts
const VALID_INSPECTION_STATUS = new Set(['erfuellt', 'teilweise', 'nicht', 'offen']);

// PUT .../samples/:sampleId/inspection/:pointId  -> Upsert Ergebnis
router.put('/products/:id/manufacturers/:mId/samples/:sampleId/inspection/:pointId', (req: Request, res: Response) => {
  const sampleId = Number(req.params.sampleId);
  const pointId = Number(req.params.pointId);
  const status = String((req.body?.status ?? 'offen'));
  if (!VALID_INSPECTION_STATUS.has(status)) { res.status(400).json({ error: 'invalid status' }); return; }
  const note = req.body?.note == null ? null : String(req.body.note);
  if (!sampleContext(sampleId)) { res.status(404).json({ error: 'sample not found' }); return; }

  db.prepare(`
    INSERT INTO amazon_sample_inspection_results (sample_id, point_id, status, note, updated_at)
    VALUES (?, ?, ?, ?, unixepoch())
    ON CONFLICT(sample_id, point_id) DO UPDATE SET status = excluded.status, note = excluded.note, updated_at = unixepoch()
  `).run(sampleId, pointId, status, note);
  res.json({ ok: true });
});

// PATCH .../samples/:sampleId/inspection  -> Zusatz-Notizen
router.patch('/products/:id/manufacturers/:mId/samples/:sampleId/inspection', (req: Request, res: Response) => {
  const sampleId = Number(req.params.sampleId);
  if (!sampleContext(sampleId)) { res.status(404).json({ error: 'sample not found' }); return; }
  const notes = req.body?.inspection_notes == null ? null : String(req.body.inspection_notes);
  db.prepare(`UPDATE amazon_manufacturer_samples SET inspection_notes = ? WHERE id = ?`).run(notes, sampleId);
  res.json({ ok: true });
});
```

- [ ] **Step 2: Verifizieren** — `npx tsc --noEmit` im Backend; `curl -X PUT ... -d '{"status":"erfuellt","note":"77,5 cm gemessen"}'` → `{ok:true}`; GET zeigt Wert.

- [ ] **Step 3: Commit**

```bash
git add backend/src/routes/amazon.manufacturers.routes.ts
git commit -m "feat(amazon-samples): Pruefbericht speichern (Ergebnis-Upsert + Notizen)"
```

---

## Task 4: Frontend — API-Typen & -Funktionen

**Files:**
- Modify: `frontend/src/api/amazon.api.ts`

- [ ] **Step 1: Typen + Funktionen ergänzen**

```ts
export type InspectionStatus = 'erfuellt' | 'teilweise' | 'nicht' | 'offen';

export interface InspectionPoint {
  id: number; title: string; body: string | null; questions: string[];
  soll_status: string | null; ist_status: InspectionStatus; ist_note: string | null;
}
export interface SampleInspection { product_name: string; inspection_notes: string | null; points: InspectionPoint[]; }

const sampleBase = (pid: number, mid: number, sid: number) =>
  `/amazon/products/${pid}/manufacturers/${mid}/samples/${sid}/inspection`;

export async function fetchSampleInspection(pid: number, mid: number, sid: number): Promise<SampleInspection> {
  return (await apiClient.get(sampleBase(pid, mid, sid))).data as SampleInspection;
}
export async function saveInspectionResult(pid: number, mid: number, sid: number, pointId: number, status: InspectionStatus, note: string | null): Promise<void> {
  await apiClient.put(`${sampleBase(pid, mid, sid)}/${pointId}`, { status, note });
}
export async function saveInspectionNotes(pid: number, mid: number, sid: number, inspection_notes: string | null): Promise<void> {
  await apiClient.patch(sampleBase(pid, mid, sid), { inspection_notes });
}
```

- [ ] **Step 2: Verifizieren** — `npm --prefix frontend run typecheck`.
- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/amazon.api.ts
git commit -m "feat(amazon-samples): API-Client fuer Pruefbericht"
```

---

## Task 5: Frontend — Query-Hook

**Files:**
- Create: `frontend/src/hooks/amazon/useSampleInspection.ts`

Muster aus bestehenden Hooks unter `frontend/src/hooks/amazon/` übernehmen (queryKey, invalidate). Optimistisches Speichern nicht nötig — onBlur/onChange speichert, danach `invalidateQueries`.

- [ ] **Step 1: Hook schreiben** (Query `['sample-inspection', sid]` + Mutationen für Ergebnis & Notizen, jeweils `invalidateQueries` auf den Key).
- [ ] **Step 2: Verifizieren** — `npm --prefix frontend run typecheck`.
- [ ] **Step 3: Commit**

```bash
git add frontend/src/hooks/amazon/useSampleInspection.ts
git commit -m "feat(amazon-samples): Query-Hook fuer Pruefbericht"
```

---

## Task 6: Frontend — Prüfbericht-Modal + Knopf am Sample

**Files:**
- Create: `frontend/src/components/amazon/manufacturers/SamplePruefberichtModal.tsx`
- Modify: `frontend/src/components/amazon/manufacturers/ManufacturerSamples.tsx`

Kontext: Verschiebbares Modal — bestehendes Drag-Muster wiederverwenden (siehe Memory „Draggable Modals" + vorhandene Modals wie `DeleteUspPointDialog`/`FilePreviewModal` für Styling; Drag am Header via pointer events + setPointerCapture, button-Ausnahme — siehe Drag-and-Drop-Lessons).

- [ ] **Step 1: Knopf „Prüfbericht" je Sample** in `ManufacturerSamples.tsx` (neben Bewertung/Status), öffnet das Modal mit `productId`, `manufacturerId`, `sampleId`, Sample-Kopf-Daten.
- [ ] **Step 2: Modal-Komponente** mit:
  - Kopf (auto): Produkt, Marke (`final_marke` aus USP-Daten — über bestehenden Weg laden oder als Prop reichen), Hersteller, Sample-Bezeichnung, Erhalten-am, Sendungsnr., Sample-Notiz.
  - Übersicht „X von Y erfüllt".
  - Pro Punkt: Thema + Anforderung + Fragen (read-only), Soll (dezent, falls `soll_status`), Ist = Status-Select (Erfüllt/Teilweise/Nicht/Offen) + Bemerkung-Textfeld → speichert via Hook (onBlur/onChange).
  - Zusatz-Notizen-Textarea → speichert via Hook (onBlur).
  - Knopf „PDF drucken" (Task 7).
- [ ] **Step 3: Verifizieren** — `npm --prefix frontend run typecheck`; in der App: Knopf öffnet Modal, Werte laden, Status/Bemerkung speichern (Reload → bleibt), Modal am Header verschiebbar.
- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/amazon/manufacturers/SamplePruefberichtModal.tsx frontend/src/components/amazon/manufacturers/ManufacturerSamples.tsx
git commit -m "feat(amazon-samples): Pruefbericht-Modal (digitale Erfassung)"
```

---

## Task 7: Frontend — PDF „drucken"

**Files:**
- Create: `frontend/src/lib/amazon/exportSamplePruefberichtPdf.ts`
- Modify: `frontend/src/components/amazon/manufacturers/SamplePruefberichtModal.tsx`

Muster strikt aus `frontend/src/lib/amazon/exportUspPdf.ts` (jsPDF, gleiche Helfer/Schriftgrößen/Farben).

- [ ] **Step 1: PDF-Generator** `exportSamplePruefberichtPdf(header, points, inspectionNotes)`:
  - Kopf: Produkt, Marke, Hersteller, Sample, Erhalten-am, Sendungsnr., Datum.
  - Tabelle je Anforderung: Nr | Thema + Anforderung | Soll (Hersteller) | Prüf-Status | Bemerkung.
    - Status-Label-Map: `erfuellt→Erfüllt, teilweise→Teilweise, nicht→Nicht erfüllt, offen→` (leer).
    - Leere Status/Bemerkung als **leere Linie/Kästchen** rendern (Platz zum Handschreiben), gefüllte Werte ausdrucken.
  - **Letzte Seite:** Überschrift „Zusatz-Notizen", eingetragener Text, danach linierter Freiraum (mehrere Linien) bis Seitenende.
  - Rückgabe `{ blob, filename }`, filename z.B. `Pruefbericht_<Produkt>_<Sample>_<Datum>.pdf`.
- [ ] **Step 2: Knopf verdrahten** — dynamischer Import wie bei `handleExcel`/`buildPdf` in `UspSection.tsx`; Blob herunterladen.
- [ ] **Step 3: Verifizieren** — `npm --prefix frontend run typecheck`; PDF erzeugen, in Vorschau prüfen: Kopf korrekt, ausgefüllte vs. leere Zeilen, Notizseite am Ende.
- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/amazon/exportSamplePruefberichtPdf.ts frontend/src/components/amazon/manufacturers/SamplePruefberichtModal.tsx
git commit -m "feat(amazon-samples): Pruefbericht-PDF (ausgefuellt + Linien + Notizseite)"
```

---

## Task 8: Manuelle UAT

- [ ] Sample „1. Sample" öffnen → „Prüfbericht" → alle USP-Punkte erscheinen.
- [ ] Status + Bemerkung bei mehreren Punkten setzen → Reload → Werte bleiben.
- [ ] Soll (Hersteller-Angabe) erscheint, falls Hersteller im USP verknüpft.
- [ ] Zusatz-Notizen eintragen → Reload → bleibt.
- [ ] „PDF drucken": Kopf stimmt, gefüllte Felder gedruckt, leere als Linien, letzte Seite = Notizen + Freiraum.
- [ ] Modal am Header verschiebbar; „X von Y erfüllt" stimmt.

---

## Verifikations-/Risikohinweise

- **Datensicherheit:** nur neue Tabelle + ADD COLUMN (Migration → Auto-Backup). Keine Bulk-Operationen, kein `createBackup` nötig.
- **Tabellen-/Spaltennamen** für USP-Fragen/Feasibility vor Task 2 in `amazon.usp.routes.ts` gegenprüfen (`amazon_usp_point_questions`, `amazon_usp_feasibility`, `amazon_usp_manufacturers`) — Namen ggf. anpassen.
- Backend nach Routen-Änderung neu laden (tsx watch); bei „greift nicht" Stale-Backend-Check (`lsof -i :3001`).
