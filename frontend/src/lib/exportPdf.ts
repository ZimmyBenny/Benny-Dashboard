// exportPdf.ts — Zeiterfassung PDF-Export Utility
// jsPDF + jspdf-autotable, Landscape, Electric Noir Farbschema

import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import type { ExportRow } from './exportCsv';

export interface PdfExportOptions {
  entries: ExportRow[];
  filterLabel?: string;   // z.B. "Projekt: Webshop | Zeitraum: 01.03.–31.03.2026"
  filename?: string;
}

function formatHHMM(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function formatTimeFromISO(iso: string | null): string {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return '—';
  }
}

function formatDateDE(iso: string): string {
  if (!iso) return '—';
  try {
    const [y, m, d] = iso.split('-');
    return `${d}.${m}.${y}`;
  } catch {
    return iso;
  }
}

export function exportPdf(options: PdfExportOptions): void {
  const { entries, filterLabel = '', filename = 'zeiterfassung-export' } = options;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  const pageW = doc.internal.pageSize.getWidth();
  const now = new Date();
  const generatedAt = now.toLocaleDateString('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }) + ', ' + now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

  // ── Header ──────────────────────────────────────────────────────────────────

  // Titel
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(230, 230, 240);
  doc.text('Zeiterfassung', 15, 18);

  // Untertitel / Filter-Label
  if (filterLabel) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(160, 160, 180);
    doc.text(filterLabel, 15, 25);
  }

  // Generierungsdatum rechts oben
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120, 120, 140);
  doc.text(`Erstellt: ${generatedAt}`, pageW - 15, 14, { align: 'right' });

  // Trennlinie
  doc.setDrawColor(50, 70, 100);
  doc.setLineWidth(0.3);
  doc.line(15, filterLabel ? 29 : 22, pageW - 15, filterLabel ? 29 : 22);

  // ── Tabelle ──────────────────────────────────────────────────────────────────

  const tableStartY = filterLabel ? 33 : 26;

  const head = [[
    'Datum', 'Start', 'Ende', 'Dauer', 'Dez.-h',
    'Projekt', 'Kunde', 'Tätigkeit', 'Notiz',
  ]];

  const body = entries.map((e) => [
    formatDateDE(e.date),
    formatTimeFromISO(e.start_time),
    formatTimeFromISO(e.end_time),
    formatHHMM(e.duration_seconds),
    (e.duration_seconds / 3600).toFixed(2),
    e.project_name ?? '—',
    e.client_name ?? '—',
    e.title,
    e.note ?? '',
  ]);

  autoTable(doc, {
    head,
    body,
    startY: tableStartY,
    margin: { left: 15, right: 15 },
    styles: {
      fontSize: 8,
      cellPadding: { top: 2.5, right: 3, bottom: 2.5, left: 3 },
      textColor: [210, 215, 230],
      lineColor: [40, 60, 90],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: [20, 35, 65],
      textColor: [200, 200, 220],
      fontStyle: 'bold',
      fontSize: 7.5,
    },
    alternateRowStyles: {
      fillColor: [14, 26, 50],
    },
    bodyStyles: {
      fillColor: [10, 20, 40],
    },
    columnStyles: {
      0: { cellWidth: 22 },  // Datum
      1: { cellWidth: 14 },  // Start
      2: { cellWidth: 14 },  // Ende
      3: { cellWidth: 18 },  // Dauer
      4: { cellWidth: 16 },  // Dez.-h
      5: { cellWidth: 30 },  // Projekt
      6: { cellWidth: 28 },  // Kunde
      7: { cellWidth: 55 },  // Tätigkeit
      8: { cellWidth: 'auto' as unknown as number },  // Notiz — Rest
    },
    didDrawPage: (data) => {
      // Seitenzahl unten rechts
      doc.setFontSize(7);
      doc.setTextColor(100, 110, 130);
      const pageNum = (doc.internal as unknown as { getCurrentPageInfo: () => { pageNumber: number } })
        .getCurrentPageInfo().pageNumber;
      doc.text(`Seite ${pageNum}`, pageW - 15, doc.internal.pageSize.getHeight() - 8, { align: 'right' });

      // Hintergrund der ganzen Seite (subtle dark background)
      if (data.pageNumber === 1) {
        doc.setFillColor(6, 14, 32);
        doc.rect(0, 0, pageW, doc.internal.pageSize.getHeight(), 'F');
        // Neu zeichnen nach Background — autotable zeichnet danach
      }
    },
  });

  // ── Gesamtzeile ──────────────────────────────────────────────────────────────

  const totalSeconds = entries.reduce((sum, e) => sum + e.duration_seconds, 0);
  const totalHHMM = formatHHMM(totalSeconds);
  const totalDecimal = (totalSeconds / 3600).toFixed(2);
  const totalEntries = entries.length;

  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 5;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(204, 151, 255); // var(--color-primary) = #cc97ff
  doc.text(
    `Gesamt: ${totalHHMM} (${totalDecimal} h) — ${totalEntries} Eintr${totalEntries === 1 ? 'ag' : 'äge'}`,
    pageW - 15,
    finalY,
    { align: 'right' },
  );

  // TODO: Stundensatz + Betrag hier ergänzen wenn hourly_rate verfügbar
  // Beispiel: `Betrag: ${(totalDecimal * hourlyRate).toFixed(2)} €`

  // ── Download ──────────────────────────────────────────────────────────────────

  doc.save(`${filename}.pdf`);
}
