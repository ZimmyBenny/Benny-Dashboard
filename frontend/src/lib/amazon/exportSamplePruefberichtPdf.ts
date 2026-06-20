import jsPDF from 'jspdf';
import { type InspectionPoint, type InspectionStatus } from '../../api/amazon.api';

// ── Druckfreundliche Palette (weisser Hintergrund) ────────────────────────────
const BG: [number, number, number] = [255, 255, 255];
const BLUE: [number, number, number] = [45, 70, 150];
const BODY: [number, number, number] = [38, 40, 48];
const MUTED: [number, number, number] = [120, 122, 134];
const LINE: [number, number, number] = [170, 176, 182];

const IST_LABEL: Record<InspectionStatus, string> = {
  erfuellt: 'Erfüllt', teilweise: 'Teilweise', nicht: 'Nicht erfüllt', offen: '',
};
const SOLL_LABEL: Record<string, string> = { umsetzbar: 'Ja', teilweise: 'Teilweise', nicht: 'Nein', offen: 'Offen' };

function slug(s: string, max = 40): string {
  return s.normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, max) || 'x';
}

export interface PruefberichtHeader {
  productName: string;
  marke: string | null;
  manufacturerName: string;
  sampleLabel: string;
  receivedDate: string | null;
  sendungsnummer: string | null;
}

export function exportSamplePruefberichtPdf(
  header: PruefberichtHeader,
  points: InspectionPoint[],
  notes: string,
): { blob: Blob; filename: string } {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const marginX = 48;
  const contentW = pageW - marginX * 2;
  const topY = 64;
  const bottomY = pageH - 48;
  const runningHeader = `Prüfbericht — ${header.productName}`;

  function paintPage(): void {
    doc.setFillColor(...BG);
    doc.rect(0, 0, pageW, pageH, 'F');
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(runningHeader, marginX, 32);
  }

  let y = topY;
  paintPage();

  function ensure(need: number): void {
    if (y + need > bottomY) { doc.addPage(); paintPage(); y = topY; }
  }

  // Linksbuendiger, umgebrochener Text ab marginX + indent
  function text(s: string, opts: { size: number; color?: [number, number, number]; style?: 'normal' | 'bold' | 'italic'; indent?: number; lh?: number; gap?: number }): void {
    doc.setFont('helvetica', opts.style ?? 'normal');
    doc.setFontSize(opts.size);
    doc.setTextColor(...(opts.color ?? BODY));
    const indent = opts.indent ?? 0;
    const lh = opts.lh ?? opts.size + 3;
    for (const raw of s.split('\n')) {
      const wrapped = doc.splitTextToSize(raw, contentW - indent) as string[];
      for (const line of wrapped) {
        ensure(lh);
        doc.text(line, marginX + indent, y);
        y += lh;
      }
    }
    if (opts.gap) y += opts.gap;
  }

  // Leere Schreiblinie(n) zum Handausfuellen
  function blankLines(count: number, indent = 0): void {
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.6);
    for (let i = 0; i < count; i++) {
      ensure(18);
      doc.line(marginX + indent, y + 4, marginX + contentW, y + 4);
      y += 18;
    }
  }

  function divider(): void {
    ensure(10);
    doc.setDrawColor(225, 227, 230);
    doc.setLineWidth(0.5);
    doc.line(marginX, y, marginX + contentW, y);
    y += 10;
  }

  // ── Titel ──
  text('PRÜFBERICHT', { size: 20, color: BLUE, style: 'bold', lh: 24, gap: 2 });
  text(header.productName, { size: 13, color: BLUE, style: 'bold', lh: 17, gap: 8 });

  // ── Kopf-Daten ──
  const today = new Date().toLocaleDateString('de-DE');
  const kv: [string, string][] = [
    ['Marke', header.marke || '—'],
    ['Hersteller', header.manufacturerName],
    ['Sample', header.sampleLabel || '—'],
    ['Erhalten am', header.receivedDate || '—'],
    ['Sendungsnr.', header.sendungsnummer || '—'],
    ['Geprüft am', today],
  ];
  for (const [k, v] of kv) {
    ensure(15);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...MUTED);
    doc.text(`${k}:`, marginX, y);
    doc.setFont('helvetica', 'normal'); doc.setTextColor(...BODY);
    doc.text(v, marginX + 78, y);
    y += 15;
  }
  y += 6;
  divider();

  // ── Anforderungen ──
  if (points.length === 0) {
    text('Keine USP-Anforderungen vorhanden.', { size: 11, color: MUTED, style: 'italic', gap: 6 });
  }
  points.forEach((p, idx) => {
    ensure(40);
    text(`${idx + 1}. ${p.title}`, { size: 11, color: BODY, style: 'bold', lh: 15, gap: 1 });
    if (p.body) text(p.body, { size: 9.5, color: BODY, indent: 14, lh: 13, gap: 1 });
    for (const q of p.questions) text(`Frage: ${q}`, { size: 9, color: MUTED, indent: 14, lh: 12, gap: 1 });

    // Soll (Hersteller)
    if (p.soll_status) {
      text(`Soll (Hersteller): ${SOLL_LABEL[p.soll_status] ?? p.soll_status}`, { size: 9, color: MUTED, indent: 14, lh: 13, gap: 1 });
    }

    // Ergebnis: ausgefuellt oder leer (zum Ankreuzen)
    const istLabel = IST_LABEL[p.ist_status];
    if (istLabel) {
      text(`Ergebnis: ${istLabel}`, { size: 10, color: BODY, style: 'bold', indent: 14, lh: 14, gap: 1 });
    } else {
      text('Ergebnis: __________________   ( Erfüllt / Teilweise / Nicht erfüllt )', { size: 9.5, color: BODY, indent: 14, lh: 14, gap: 1 });
    }

    // Bemerkung: ausgefuellt oder leere Linie
    if (p.ist_note && p.ist_note.trim()) {
      text(`Bemerkung: ${p.ist_note}`, { size: 9.5, color: BODY, indent: 14, lh: 13, gap: 2 });
    } else {
      text('Bemerkung:', { size: 9.5, color: MUTED, indent: 14, lh: 13, gap: 0 });
      blankLines(1, 14);
    }
    divider();
  });

  // ── Letzte Seite: Zusatz-Notizen ──
  doc.addPage();
  paintPage();
  y = topY;
  text('ZUSATZ-NOTIZEN', { size: 16, color: BLUE, style: 'bold', lh: 20, gap: 8 });
  if (notes && notes.trim()) {
    text(notes, { size: 10.5, color: BODY, lh: 15, gap: 8 });
  }
  // Restliche Seite mit Schreiblinien fuellen
  while (y + 22 <= bottomY) blankLines(1);

  // ── Fusszeilen ──
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED);
    doc.text(`Seite ${i} / ${totalPages}`, pageW / 2, pageH - 24, { align: 'center' });
  }

  const filename = `Pruefbericht_${slug(header.productName)}_${slug(header.sampleLabel || 'Sample')}_${new Date().toLocaleDateString('en-CA')}.pdf`;
  return { blob: doc.output('blob'), filename };
}
