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

// Gitterlinien: duenner grauer Rahmen um JEDE Zelle, damit Zeilen/Spalten klar abgegrenzt sind
const GRID = 'FFAAB0B6';
const gridBorder = {
  top: { style: 'thin' as const, color: { argb: GRID } },
  left: { style: 'thin' as const, color: { argb: GRID } },
  bottom: { style: 'thin' as const, color: { argb: GRID } },
  right: { style: 'thin' as const, color: { argb: GRID } },
};

export async function exportUspExcel(
  productName: string,
  points: UspPoint[],
  manufacturer: UspManufacturer | null,
  feasibility: UspFeasibility[],
): Promise<{ blob: Blob; filename: string }> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();

  // feasibility (Status+Notiz) je Punkt fuer DIESEN Hersteller
  const fMap = new Map<number, UspFeasibility>();
  if (manufacturer) for (const f of feasibility) if (f.manufacturer_id === manufacturer.id) fMap.set(f.point_id, f);

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
    c.border = gridBorder;
  });

  points.forEach((p, idx) => {
    const f = fMap.get(p.id);
    const anf = [p.body ?? '', ...(p.questions ?? []).map(q => `Frage: ${q.text}`)].filter(s => s && s.trim()).join('\n');
    const kann = STATUS_TO_LABEL[f?.status ?? 'offen'];
    const row = ws.addRow({ punkt: idx + 1, thema: p.title || '', anf, kann, erledigt: 'Nein', notizen: f?.note ?? '' });
    row.eachCell({ includeEmpty: true }, c => { c.alignment = { vertical: 'top', wrapText: true }; c.border = gridBorder; });
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
  const brandPart = manufacturer ? `_${slug(manufacturer.name || 'Hersteller')}` : '';
  const filename = `Anforderungen_${slug(productName)}${brandPart}_${new Date().toLocaleDateString('en-CA')}.xlsx`;
  return { blob, filename };
}
