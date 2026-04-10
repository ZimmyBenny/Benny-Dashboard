// exportPdf.ts — Zeiterfassung PDF-Export Utility
// jsPDF + jspdf-autotable, Landscape A4, professionelles helles Layout

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
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  } catch {
    return '';
  }
}

function formatDateDE(iso: string): string {
  if (!iso) return '';
  try {
    const [y, m, d] = iso.split('-');
    return `${d}.${m}.${y}`;
  } catch {
    return iso;
  }
}

// Electric Noir Akzentfarbe als RGB
const ENR_NAVY   = [13, 26, 50]   as [number, number, number]; // Tabellenkopf
const ENR_TEXT   = [25, 30, 50]   as [number, number, number]; // Dunkler Fliesstext
const ENR_MUTED  = [100, 110, 130] as [number, number, number]; // Gedämpfter Text
const ENR_LINE   = [200, 205, 215] as [number, number, number]; // Trennlinie
const ENR_ALT    = [245, 246, 250] as [number, number, number]; // Wechselzeile
const ENR_ACCENT = [130, 80, 200]  as [number, number, number]; // Lila Akzent (Gesamtzeile)

export function exportPdf(options: PdfExportOptions): void {
  const { entries, filterLabel = '', filename = 'zeiterfassung-export' } = options;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const now = new Date();
  const generatedAt =
    now.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
    ', ' +
    now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

  // ── Header Seite 1 ───────────────────────────────────────────────────────────

  // Akzent-Balken links oben
  doc.setFillColor(...ENR_NAVY);
  doc.rect(0, 0, 4, 40, 'F');

  // Titel
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...ENR_TEXT);
  doc.text('Zeiterfassung', 15, 16);

  // Filter-Label als Untertitel
  if (filterLabel) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...ENR_MUTED);
    doc.text(filterLabel, 15, 24);
  }

  // Generierungsdatum rechts oben
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...ENR_MUTED);
  doc.text(`Erstellt: ${generatedAt}`, pageW - 15, 10, { align: 'right' });

  // Trennlinie
  doc.setDrawColor(...ENR_LINE);
  doc.setLineWidth(0.4);
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
    e.project_name ?? '',
    e.client_name ?? '',
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
      textColor: ENR_TEXT,
      lineColor: ENR_LINE,
      lineWidth: 0.15,
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: ENR_NAVY,
      textColor: [230, 235, 255],
      fontStyle: 'bold',
      fontSize: 7.5,
    },
    alternateRowStyles: {
      fillColor: ENR_ALT,
    },
    bodyStyles: {
      fillColor: [255, 255, 255],
    },
    columnStyles: {
      0: { cellWidth: 22 },              // Datum
      1: { cellWidth: 14 },              // Start
      2: { cellWidth: 14 },              // Ende
      3: { cellWidth: 18 },              // Dauer
      4: { cellWidth: 16, halign: 'right' }, // Dez.-h
      5: { cellWidth: 30 },              // Projekt
      6: { cellWidth: 28 },              // Kunde
      7: { cellWidth: 55 },              // Tätigkeit
      8: { cellWidth: 'auto' as unknown as number }, // Notiz
    },
    didDrawPage: (data) => {
      // Seitenzahl unten rechts — nur Text, kein Rechteck
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...ENR_MUTED);
      doc.text(`Seite ${data.pageNumber}`, pageW - 15, pageH - 8, { align: 'right' });
    },
  });

  // ── Gesamtzeile ──────────────────────────────────────────────────────────────

  const totalSeconds = entries.reduce((sum, e) => sum + e.duration_seconds, 0);
  const totalHHMM = formatHHMM(totalSeconds);
  const totalDecimal = (totalSeconds / 3600).toFixed(2);
  const totalEntries = entries.length;

  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  // Trennlinie vor Gesamtzeile
  doc.setDrawColor(...ENR_LINE);
  doc.setLineWidth(0.3);
  doc.line(pageW - 120, finalY - 2, pageW - 15, finalY - 2);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...ENR_ACCENT);
  doc.text(
    `Gesamt: ${totalHHMM}  |  ${totalDecimal} h  |  ${totalEntries} Eintr${totalEntries === 1 ? 'ag' : 'äge'}`,
    pageW - 15,
    finalY + 2,
    { align: 'right' },
  );

  // TODO: Stundensatz + Betrag hier ergänzen wenn hourly_rate verfügbar
  // Beispiel: `Betrag: ${(parseFloat(totalDecimal) * hourlyRate).toFixed(2)} €`

  doc.save(`${filename}.pdf`);
}
