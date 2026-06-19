# USP Excel-Export pro Hersteller — Implementierungs-Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein „Excel"-Button im USP-Bereich, der die Anforderungen pro Hersteller als .xlsx im Format von Bennys Tracking-Vorlage exportiert (vorausgefüllt, Dropdowns, Farben).

**Architecture:** Rein client-seitig (wie der bestehende PDF-Export). Neue Builder-Funktion `exportUspExcel.ts` mit **ExcelJS** (dynamisch importiert). Button + Handler in `UspSection.tsx` nutzen den vorhandenen Hersteller-Dropdown und dieselbe `include_in_pdf`-Filterung wie der PDF-Export.

**Tech Stack:** React 19, ExcelJS (Browser), Vite.

**Branch:** `feature/usp-excel-export` (aktiv).

---

## Dateien-Übersicht
- Modify: `frontend/package.json` (+ `exceljs`)
- Create: `frontend/src/lib/amazon/exportUspExcel.ts`
- Modify: `frontend/src/components/amazon/usp/UspSection.tsx` (Handler + Button)

---

## Task 1: ExcelJS-Abhängigkeit

- [ ] **Step 1: Installieren**
```bash
npm --prefix frontend install exceljs
```
Expected: `exceljs` erscheint in `frontend/package.json` dependencies, Exit 0.

- [ ] **Step 2: Commit**
```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore(amazon-usp): exceljs fuer Excel-Export"
```

---

## Task 2: Excel-Builder

**Files:** Create `frontend/src/lib/amazon/exportUspExcel.ts`

- [ ] **Step 1: Datei schreiben**

```ts
import { type UspPoint, type UspManufacturer, type UspFeasibility, type UspFeasibilityStatus } from '../../api/amazon.api';

function slug(s: string, max = 40): string {
  return s.normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, max) || 'x';
}

const STATUS_TO_LABEL: Record<UspFeasibilityStatus, string> = {
  umsetzbar: 'Ja', teilweise: 'Teilweise', nicht: 'Nein', offen: 'Offen',
};

// ARGB-Farben (Fülltöne)
const GREEN = 'FFB6E2C6', ORANGE = 'FFFCD9A8', RED = 'FFF3B6B6', YELLOW = 'FFFCE9A8';
const HEAD_BG = 'FF2D4696', HEAD_TXT = 'FFFFFFFF';

export async function exportUspExcel(
  productName: string,
  points: UspPoint[],
  manufacturer: UspManufacturer,
  feasibility: UspFeasibility[],
): Promise<{ blob: Blob; filename: string }> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();

  // feasibility (Status+Notiz) je Punkt fuer DIESEN Hersteller
  const fMap = new Map<number, UspFeasibility>();
  for (const f of feasibility) if (f.manufacturer_id === manufacturer.id) fMap.set(f.point_id, f);

  // ── Blatt 1: Anleitung ──
  const guide = wb.addWorksheet('Anleitung');
  guide.getColumn(1).width = 95;
  const guideLines: [string, boolean][] = [
    ['Tracking-Tabelle – Anleitung', true],
    ['', false],
    ['Diese Tabelle enthält alle Anforderungen aus der Spezifikation.', false],
    ['Jede Anforderung kann abgehakt und mit eigenen Notizen versehen werden.', false],
    ['', false],
    ['So funktioniert es:', true],
    ['• Spalte „Erledigt" auf „Ja" setzen → die gesamte Zeile färbt sich grün (Vorrang).', false],
    ['• Spalte „Kann umgesetzt werden": Ja = grün, Teilweise = orange, Nein = rot, Offen = gelb.', false],
    ['', false],
    ['Spalten:', true],
    ['• Punkt: laufende Nummer aus der Spezifikation', false],
    ['• Thema: kurze Bezeichnung', false],
    ['• Anforderung: die ursprüngliche Anforderung (inkl. Fragen an den Hersteller)', false],
    ['• Kann umgesetzt werden: Dropdown Ja / Teilweise / Nein / Offen', false],
    ['• Erledigt: Dropdown Nein / Ja', false],
    ['• Notizen / Freitext: eigene Anmerkungen, Datum, Sample-Tests, etc.', false],
  ];
  guideLines.forEach(([text, bold], i) => {
    const cell = guide.getCell(i + 1, 1);
    cell.value = text;
    if (bold) cell.font = { bold: true, size: i === 0 ? 14 : 11 };
    cell.alignment = { wrapText: true, vertical: 'top' };
  });

  // ── Blatt 2: Tracking ──
  const ws = wb.addWorksheet('Tracking');
  ws.columns = [
    { header: 'Punkt', key: 'punkt', width: 8 },
    { header: 'Thema', key: 'thema', width: 28 },
    { header: 'Anforderung', key: 'anf', width: 70 },
    { header: 'Kann umgesetzt werden', key: 'kann', width: 22 },
    { header: 'Erledigt', key: 'erledigt', width: 12 },
    { header: 'Notizen / Freitext', key: 'notizen', width: 40 },
  ];
  const head = ws.getRow(1);
  head.height = 28;
  head.eachCell(c => {
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEAD_BG } };
    c.font = { bold: true, color: { argb: HEAD_TXT } };
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  });

  points.forEach((p, idx) => {
    const f = fMap.get(p.id);
    const anf = [p.body ?? '', ...(p.questions ?? []).map(q => `Frage: ${q.text}`)].filter(s => s && s.trim()).join('\n');
    const kann = STATUS_TO_LABEL[f?.status ?? 'offen'];
    const row = ws.addRow({ punkt: idx + 1, thema: p.title || '', anf, kann, erledigt: 'Nein', notizen: f?.note ?? '' });
    row.eachCell(c => { c.alignment = { vertical: 'top', wrapText: true }; });
    const fill = kann === 'Ja' ? GREEN : kann === 'Teilweise' ? ORANGE : kann === 'Nein' ? RED : YELLOW;
    row.getCell('kann').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
  });

  const last = points.length + 1; // letzte Datenzeile (Zeile 1 = Header)
  for (let r = 2; r <= last; r++) {
    ws.getCell(`D${r}`).dataValidation = { type: 'list', allowBlank: false, formulae: ['"Ja,Teilweise,Nein,Offen"'] };
    ws.getCell(`E${r}`).dataValidation = { type: 'list', allowBlank: false, formulae: ['"Nein,Ja"'] };
  }
  if (points.length > 0) {
    ws.addConditionalFormatting({ ref: `D2:D${last}`, rules: [
      { type: 'cellIs', operator: 'equal', priority: 5, formulae: ['"Ja"'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: GREEN } } } },
      { type: 'cellIs', operator: 'equal', priority: 6, formulae: ['"Teilweise"'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: ORANGE } } } },
      { type: 'cellIs', operator: 'equal', priority: 7, formulae: ['"Nein"'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: RED } } } },
      { type: 'cellIs', operator: 'equal', priority: 8, formulae: ['"Offen"'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: YELLOW } } } },
    ] });
    // Ganze Zeile gruen, wenn Erledigt = Ja (hoechste Prioritaet)
    ws.addConditionalFormatting({ ref: `A2:F${last}`, rules: [
      { type: 'expression', priority: 1, formulae: ['$E2="Ja"'], style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: GREEN } } } },
    ] });
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const filename = `Anforderungen_${slug(productName)}_${slug(manufacturer.name || 'Hersteller')}_${new Date().toLocaleDateString('en-CA')}.xlsx`;
  return { blob, filename };
}
```

- [ ] **Step 2: Typecheck**
Run: `npm --prefix frontend run typecheck` → Exit 0.

- [ ] **Step 3: Commit**
```bash
git add frontend/src/lib/amazon/exportUspExcel.ts
git commit -m "feat(amazon-usp): Excel-Builder (ExcelJS, Vorlage-Format)"
```

---

## Task 3: Button + Handler in UspSection

**Files:** Modify `frontend/src/components/amazon/usp/UspSection.tsx`

- [ ] **Step 1: Handler ergänzen** — direkt nach `handleSaveVersion` (nach Zeile 84):

```tsx
  async function handleExcel() {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    await new Promise(r => setTimeout(r, 350));
    const fresh = await refetch();
    if (!fresh.data) return;
    const m = fresh.data.manufacturers.find(x => x.id === selectedMId) ?? fresh.data.manufacturers[0];
    if (!m) return;
    const incMap = new Map<number, number>();
    for (const f of fresh.data.feasibility) if (f.manufacturer_id === m.id) incMap.set(f.point_id, f.include_in_pdf);
    const included = fresh.data.points.filter(p => (incMap.get(p.id) ?? 1) !== 0);
    const { exportUspExcel } = await import('../../../lib/amazon/exportUspExcel');
    const { blob, filename } = await exportUspExcel(productName, included, m, fresh.data.feasibility);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  }
```

- [ ] **Step 2: Button ergänzen** — direkt NACH dem „Herunterladen"-Button (der `handleDownload`-Button), VOR dem „Als Version speichern"-Button:

```tsx
                <button type="button" onClick={handleExcel} className="px-3 py-1.5 rounded-md text-sm flex items-center gap-1.5"
                  style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>grid_on</span>Excel
                </button>
```

- [ ] **Step 3: Typecheck**
Run: `npm --prefix frontend run typecheck` → Exit 0.

- [ ] **Step 4: Browser-UAT** (Benny, nach `Cmd+R`)
Hersteller wählen → „Excel" → .xlsx lädt. Öffnen: Blatt „Anleitung" + „Tracking"; nur aktivierte Punkte; Punkt/Thema/Anforderung (inkl. „Frage: …"); „Kann umgesetzt werden" vorausgefüllt + Dropdown; „Erledigt"-Dropdown; Notizen vorbelegt; Farben (Status-Zelle gefärbt, „Erledigt=Ja" → Zeile grün). PDF-Export unverändert.

- [ ] **Step 5: Commit**
```bash
git add frontend/src/components/amazon/usp/UspSection.tsx
git commit -m "feat(amazon-usp): Excel-Button pro Hersteller im USP-Bereich"
```

---

## Abschluss
- [ ] `npm --prefix frontend run typecheck` grün, `npm --prefix backend test` unverändert grün.
- [ ] UAT mit Benny (Excel öffnen + prüfen) anhand Spec-Testkriterien.
- [ ] Merge `feature/usp-excel-export` → `main` (`--no-ff`) + Push nach Freigabe.

## Self-Review (gegen Spec)
- Button „Excel" neben PDF, gleicher Hersteller-Dropdown ✓ (Task 3)
- Client-seitig, ExcelJS dynamisch ✓ (Task 1, 2)
- Blatt „Anleitung" + „Tracking", Spalten wie Vorlage ✓ (Task 2)
- Anforderung inkl. Fragen, Status-Mapping umsetzbar→Ja etc. ✓ (Task 2)
- Dropdowns Ja/Teilweise/Nein/Offen + Nein/Ja ✓; Farben + Erledigt=Ja→Zeile grün ✓ (Task 2)
- Nur `include_in_pdf`-Punkte (wie PDF) ✓ (Task 3)
- Dateiname mit Produkt/Hersteller/Datum ✓ (Task 2)
