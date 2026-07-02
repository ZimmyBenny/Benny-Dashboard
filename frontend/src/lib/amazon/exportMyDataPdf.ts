// exportMyDataPdf.ts — Meine Daten PDF-Export Utility
// jsPDF + jspdf-autotable, Portrait A4, Electric-Noir ENR_* Palette

import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { type MyDataGroup, type MyDataField } from '../../api/amazon.api';
import { todayLocal } from '../dates';

// Electric Noir Farbpalette (identisch zu exportPdf.ts)
const ENR_NAVY  = [13, 26, 50]    as [number, number, number]; // Tabellenkopf
const ENR_TEXT  = [25, 30, 50]    as [number, number, number]; // Dunkler Fliesstext
const ENR_MUTED = [100, 110, 130] as [number, number, number]; // Gedämpfter Text
const ENR_LINE  = [200, 205, 215] as [number, number, number]; // Trennlinie
const ENR_ALT   = [245, 246, 250] as [number, number, number]; // Wechselzeile

export function exportMyDataPdf(opts: {
  groups: MyDataGroup[];
  fields: MyDataField[];
  selectedGroupIds: number[];
  includeEmpty: boolean;
}): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const dateStr = new Date().toLocaleDateString('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  // ── Kopfzeile ──────────────────────────────────────────────────────────────

  // Akzent-Balken links oben
  doc.setFillColor(...ENR_NAVY);
  doc.rect(0, 0, 4, 32, 'F');

  // Titel "Meine Daten"
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...ENR_TEXT);
  doc.text('Meine Daten', 15, 16);

  // Datum rechts oben
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...ENR_MUTED);
  doc.text(`Erstellt: ${dateStr}`, pageW - 15, 10, { align: 'right' });

  // Trennlinie
  doc.setDrawColor(...ENR_LINE);
  doc.setLineWidth(0.4);
  doc.line(15, 22, pageW - 15, 22);

  // ── Gruppen-Tabellen ───────────────────────────────────────────────────────

  let y = 30;

  const selected = opts.groups
    .filter((g) => opts.selectedGroupIds.includes(g.id))
    .sort((a, b) => a.sort_order - b.sort_order);

  for (const g of selected) {
    const rawFields = opts.fields
      .filter((f) => f.group_id === g.id)
      .sort((a, b) => a.sort_order - b.sort_order);

    const visibleFields = rawFields.filter(
      (f) => opts.includeEmpty || (f.value != null && f.value.trim() !== ''),
    );

    // Gruppe überspringen wenn keine sichtbaren Felder und leere ausgeschlossen
    if (visibleFields.length === 0 && !opts.includeEmpty) continue;

    const body = visibleFields.map((f) => [
      f.label || '—',
      f.value && f.value.trim() ? f.value : '—',
    ]);

    // Gruppenüberschrift
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...ENR_TEXT);
    doc.text(g.title || 'Ohne Titel', 15, y);
    y += 4;

    autoTable(doc, {
      head: [['Bezeichnung', 'Wert']],
      body,
      startY: y,
      margin: { left: 15, right: 15 },
      styles: {
        fontSize: 9,
        cellPadding: { top: 2.5, right: 3, bottom: 2.5, left: 3 },
        textColor: ENR_TEXT,
        lineColor: ENR_LINE,
        lineWidth: 0.15,
        overflow: 'linebreak',
      },
      headStyles: {
        fillColor: ENR_NAVY,
        textColor: [230, 235, 255] as [number, number, number],
        fontStyle: 'bold',
        fontSize: 9,
      },
      alternateRowStyles: {
        fillColor: ENR_ALT,
      },
      bodyStyles: {
        fillColor: [255, 255, 255] as [number, number, number],
      },
      columnStyles: {
        0: { cellWidth: 55 },
        1: { cellWidth: 'auto' as unknown as number },
      },
    });

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  }

  // ── Fusszeile: Seitenzahl auf allen Seiten ─────────────────────────────────

  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...ENR_MUTED);
    doc.text(`Seite ${p} / ${pageCount}`, pageW - 15, pageH - 8, { align: 'right' });
  }

  // ── Download ───────────────────────────────────────────────────────────────

  doc.save(`Meine-Daten_${todayLocal()}.pdf`);
}
