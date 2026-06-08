# Finanzen Steuer-Checkliste — Phase B (PDF-Export) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ausgewählte Punkte (oder alle) eines Steuerjahres als EIN zusammengeführtes PDF exportieren (gruppiert nach Überbegriff/Punkt, Bilder + hochgeladene PDFs eingebettet) — für den Steuerberater.

**Architecture:** Backend-Endpoint `POST /api/steuer/:jahr/export` baut das PDF mit `pdf-lib` (neue Dependency): Heading-Seite je Punkt, dann die Dokumente (JPG/PNG als A4-Bildseiten, PDFs als kopierte Seiten; nicht einbettbare Typen als Hinweisseite). Frontend: Auswahl-Häkchen je Punkt + Export-Leiste, lädt das PDF herunter.

**Tech Stack:** Express 5 + better-sqlite3 + pdf-lib; React 19 + TanStack Query + Tailwind v4; Vitest + supertest.

**Spec:** `docs/superpowers/specs/2026-06-08-finanzen-steuer-checkliste-design.md` (Phase B).

---

### Task 1: Backend Export-Endpoint (pdf-lib) + Tests (TDD)

**Files:** Modify `backend/package.json` (Dependency), `backend/src/routes/steuer.routes.ts`; Test `backend/test/integration.steuer.test.ts`.

- [ ] **Step 1: Dependency installieren**
`cd backend && npm install pdf-lib`
(fügt pdf-lib zu dependencies hinzu)

- [ ] **Step 2: Failing-Tests** — in `backend/test/integration.steuer.test.ts` innerhalb des bestehenden `describe('Steuer-Checkliste API', …)` ergänzen:
```ts
  it('Export: liefert PDF fuer Punkte mit Dokumenten; leere Auswahl -> 400', async () => {
    const catId = (await request(app).post('/api/steuer/2025/categories').send({ name: 'Privat' })).body.category.id;
    const itemId = (await request(app).post(`/api/steuer/categories/${catId}/items`).send({ title: 'Beleg' })).body.item.id;
    // ohne Dokumente: 400
    const empty = await request(app).post('/api/steuer/2025/export').send({ item_ids: 'all' });
    expect(empty.status).toBe(400);
    // mit Dokument: 200 + PDF
    await request(app).post(`/api/steuer/items/${itemId}/files`).attach('file', PNG, { filename: 'beleg.png', contentType: 'image/png' });
    const all = await request(app).post('/api/steuer/2025/export').send({ item_ids: 'all' });
    expect(all.status).toBe(200);
    expect(all.headers['content-type']).toContain('application/pdf');
    const sel = await request(app).post('/api/steuer/2025/export').send({ item_ids: [itemId] });
    expect(sel.status).toBe(200);
    expect(sel.headers['content-type']).toContain('application/pdf');
    // Auswahl ohne Treffer (fremde id) -> 400
    const none = await request(app).post('/api/steuer/2025/export').send({ item_ids: [999999] });
    expect(none.status).toBe(400);
  });
```

- [ ] **Step 3: Run — MUST FAIL** `cd backend && npx vitest run test/integration.steuer.test.ts -t "Export"`

- [ ] **Step 4: Implementierung** in `backend/src/routes/steuer.routes.ts`.

a) Oben den Import ergänzen: `import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';`

b) Zwei Helfer (vor den Routen, nach den vorhandenen Helfern) ergänzen:
```ts
// pdf-lib StandardFont (WinAnsi) kann nicht alle Unicode-Zeichen — ASCII + deutsche Umlaute behalten, Rest -> '?'
function safeText(s: string): string {
  return Array.from(s ?? '').map(ch => {
    const c = ch.codePointAt(0) ?? 0;
    if (c >= 32 && c <= 126) return ch;
    if ('äöüÄÖÜß€'.includes(ch)) return ch;
    return '?';
  }).join('');
}

async function buildExportPdf(jahr: number, itemIds: number[] | 'all'): Promise<Buffer | null> {
  const cats = db.prepare(`SELECT * FROM steuer_categories WHERE jahr = ? ORDER BY sort_order, id`).all(jahr) as CategoryRow[];
  const wanted = itemIds === 'all' ? null : new Set(itemIds);
  type Entry = { categoryName: string; item: ItemRow; files: FileRow[] };
  const entries: Entry[] = [];
  for (const c of cats) {
    const items = db.prepare(`SELECT * FROM steuer_items WHERE category_id = ? ORDER BY sort_order, id`).all(c.id) as ItemRow[];
    for (const it of items) {
      if (wanted && !wanted.has(it.id)) continue;
      const files = loadFiles(it.id);
      if (files.length === 0) continue;
      entries.push({ categoryName: c.name, item: it, files });
    }
  }
  if (entries.length === 0) return null;

  const A4W = 595.28, A4H = 841.89, MARGIN = 40;
  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica);
  const fontBold = await out.embedFont(StandardFonts.HelveticaBold);

  function drawImagePage(img: { width: number; height: number }, embed: import('pdf-lib').PDFImage) {
    const maxW = A4W - MARGIN * 2, maxH = A4H - MARGIN * 2;
    const scale = Math.min(maxW / img.width, maxH / img.height, 1);
    const w = img.width * scale, h = img.height * scale;
    const page = out.addPage([A4W, A4H]);
    page.drawImage(embed, { x: (A4W - w) / 2, y: (A4H - h) / 2, width: w, height: h });
  }

  for (const e of entries) {
    const hp = out.addPage([A4W, A4H]);
    hp.drawText(safeText(e.categoryName || 'Überbegriff'), { x: 50, y: A4H - 80, size: 12, font, color: rgb(0.4, 0.4, 0.4) });
    hp.drawText(safeText(e.item.title || 'Punkt'), { x: 50, y: A4H - 110, size: 22, font: fontBold, color: rgb(0, 0, 0) });
    for (const f of e.files) {
      const abs = path.resolve(FILES_DIR, f.file_path);
      if (!abs.startsWith(path.resolve(FILES_DIR) + path.sep) || !fs.existsSync(abs)) continue;
      const mime = (f.mime ?? '').toLowerCase();
      try {
        if (mime === 'application/pdf') {
          const src = await PDFDocument.load(fs.readFileSync(abs));
          const pages = await out.copyPages(src, src.getPageIndices());
          pages.forEach(p => out.addPage(p));
        } else if (mime === 'image/jpeg' || mime === 'image/jpg') {
          const img = await out.embedJpg(fs.readFileSync(abs));
          drawImagePage(img, img);
        } else if (mime === 'image/png') {
          const img = await out.embedPng(fs.readFileSync(abs));
          drawImagePage(img, img);
        } else {
          const np = out.addPage([A4W, A4H]);
          np.drawText(safeText(`Datei "${f.original_name ?? 'Datei'}" — keine Vorschau einbettbar (separat senden).`), { x: 50, y: A4H - 80, size: 11, font, color: rgb(0.6, 0, 0) });
        }
      } catch {
        const np = out.addPage([A4W, A4H]);
        np.drawText(safeText(`Datei "${f.original_name ?? 'Datei'}" konnte nicht eingebettet werden.`), { x: 50, y: A4H - 80, size: 11, font, color: rgb(0.6, 0, 0) });
      }
    }
  }
  const bytes = await out.save();
  return Buffer.from(bytes);
}
```

c) Den Export-Endpoint ergänzen — registriere ihn bei den anderen `/:jahr/...`-Routen (z. B. nach `POST /:jahr/categories`; eigener literal-Subpfad `export`, keine Shadowing-Sorge):
```ts
router.post('/:jahr/export', async (req: Request, res: Response) => {
  const jahr = Number(req.params.jahr);
  if (!Number.isInteger(jahr)) { res.status(400).json({ error: 'invalid jahr' }); return; }
  const raw = (req.body as { item_ids?: unknown })?.item_ids;
  let itemIds: number[] | 'all';
  if (raw === 'all') itemIds = 'all';
  else if (Array.isArray(raw) && raw.every(x => Number.isInteger(x))) itemIds = raw as number[];
  else { res.status(400).json({ error: 'invalid item_ids' }); return; }
  const pdf = await buildExportPdf(jahr, itemIds);
  if (!pdf) { res.status(400).json({ error: 'keine dokumente' }); return; }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Steuer-${jahr}.pdf"`);
  res.send(pdf);
});
```

- [ ] **Step 5: Run — MUST PASS** `cd backend && npx vitest run test/integration.steuer.test.ts` → grün; `cd backend && npx vitest run` → alle grün.

- [ ] **Step 6: Commit**
```bash
git add backend/package.json backend/package-lock.json backend/src/routes/steuer.routes.ts backend/test/integration.steuer.test.ts
git commit -m "feat(steuer): PDF-Export-Endpoint (pdf-lib) — Dokumente je Punkt zusammenfuehren"
```

---

### Task 2: Frontend — Auswahl + Export

**Files:** Modify `frontend/src/api/steuer.api.ts`, `frontend/src/components/finanzen/SteuerItemRow.tsx`, `frontend/src/components/finanzen/SteuerCategoryBlock.tsx`, `frontend/src/pages/finanzen/TaxChecklistPage.tsx`.

- [ ] **Step 1: API** (`steuer.api.ts`) — Export-Funktion ergänzen:
```ts
export async function exportSteuerPdf(jahr: number, itemIds: number[] | 'all'): Promise<Blob> {
  const r = await apiClient.post(`/steuer/${jahr}/export`, { item_ids: itemIds }, { responseType: 'blob' });
  return r.data as Blob;
}
```

- [ ] **Step 2: `SteuerItemRow.tsx`** — Export-Auswahl-Häkchen.
  - Props erweitern: `{ jahr: number; item: SteuerItem; selected: boolean; onToggleSelect: () => void }`.
  - Am rechten Ende der Punkt-Kopfzeile (deutlich getrennt vom `is_done`-Häkchen) ein kleines Auswahl-Häkchen für den Export rendern, z. B.:
    ```tsx
        <label className="flex items-center gap-1 flex-shrink-0 cursor-pointer" title="Für PDF-Export auswählen">
          <input type="checkbox" checked={selected} onChange={onToggleSelect} />
          <span className="material-symbols-outlined" style={{ fontSize: 16, color: selected ? '#34d399' : 'var(--color-on-surface-variant)' }}>picture_as_pdf</span>
        </label>
    ```
  - Sonst unverändert.

- [ ] **Step 3: `SteuerCategoryBlock.tsx`** — Auswahl durchreichen.
  - Props erweitern: `{ …, selectedIds: Set<number>; onToggleSelect: (itemId: number) => void }`.
  - Beim `<SteuerItemRow … />`-Aufruf `selected={selectedIds.has(item.id)}` und `onToggleSelect={() => onToggleSelect(item.id)}` ergänzen.

- [ ] **Step 4: `TaxChecklistPage.tsx`** — Auswahl-State + Export-Leiste.
  - State: `const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());`
    `function toggleSelect(id: number) { setSelectedIds(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }`
    Bei Jahreswechsel Auswahl zurücksetzen: im `<select onChange>` und in `openYear()` zusätzlich `setSelectedIds(new Set())`.
  - `selectedIds`/`toggleSelect` an jedes `<SteuerCategoryBlock>` durchreichen.
  - **Export-Funktion** (importiere `exportSteuerPdf` aus `'../../api/steuer.api'`):
    ```tsx
    const [exporting, setExporting] = useState(false);
    async function doExport(ids: number[] | 'all') {
      setExporting(true);
      try {
        const blob = await exportSteuerPdf(jahr, ids);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `Steuer-${jahr}.pdf`; a.click();
        setTimeout(() => URL.revokeObjectURL(url), 0);
      } finally { setExporting(false); }
    }
    ```
  - **Export-Leiste** über der Kategorien-Liste (nur wenn `data.categories.length > 0`): zwei Buttons —
    „Alle exportieren" → `doExport('all')`; „Ausgewählte exportieren (N)" → `doExport(Array.from(selectedIds))`, `disabled` wenn `selectedIds.size === 0` oder `exporting`. N = `selectedIds.size`. Bei `exporting` Label „Erstelle PDF …". Echte Umlaute.
  - (Optional dezent: Hinweis „Nur Punkte mit Dokumenten landen im PDF.")

- [ ] **Step 5: Typecheck + Build** `cd frontend && npx tsc --noEmit` → PASS; `cd frontend && npx vite build` → PASS.

- [ ] **Step 6: Commit**
```bash
git add frontend/src/api/steuer.api.ts frontend/src/components/finanzen/ frontend/src/pages/finanzen/TaxChecklistPage.tsx
git commit -m "feat(steuer): PDF-Export — Auswahl je Punkt + 'Alle exportieren'"
```

---

## Manuelles UAT
1. Steuerjahr mit Überbegriffen/Punkten + Dokumenten öffnen.
2. „Alle exportieren" → ein PDF lädt herunter; je Punkt eine Überschrift, danach die Dokumente (Bilder als Seiten, PDFs eingefügt).
3. Einzelne Punkte anhaken → „Ausgewählte exportieren (N)" → nur diese im PDF.
4. Punkt ohne Dokument anhaken → erscheint nicht im PDF (leere Auswahl → kein Download/Hinweis).
