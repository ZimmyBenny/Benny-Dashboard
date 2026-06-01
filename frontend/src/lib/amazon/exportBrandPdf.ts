import jsPDF from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { type BrandPayload, type BrandCandidate, type ResearchStatus } from '../../api/amazon.api';

function slug(s: string, max = 50): string {
  return s
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, max);
}

function fmtStatus(v: ResearchStatus | null): string {
  if (!v) return '-';
  return v;
}

export function exportBrandPdf(product: { name: string }, payload: BrandPayload): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 40;
  let y = 50;

  // Titel
  doc.setFontSize(20);
  doc.text(`Markennamen - ${product.name}`, marginX, y);
  y += 24;

  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(`Stand: ${new Date().toLocaleDateString('de-DE')}`, marginX, y);
  doc.setTextColor(0);
  y += 18;

  // Sektion-Notizen
  if (payload.brand.notes) {
    doc.setFontSize(11);
    doc.text('Notizen:', marginX, y);
    y += 14;
    doc.setFontSize(10);
    const lines = doc.splitTextToSize(payload.brand.notes, pageWidth - marginX * 2);
    doc.text(lines, marginX, y);
    y += lines.length * 12 + 10;
  }

  // Tabelle der nicht-archivierten Namen
  const visible: BrandCandidate[] = [...payload.names]
    .filter(c => c.is_archived === 0)
    .sort((a, b) => {
      if (a.is_favorite !== b.is_favorite) return b.is_favorite - a.is_favorite;
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      return a.id - b.id;
    });

  if (visible.length > 0) {
    autoTable(doc, {
      startY: y,
      head: [['Name', 'Interessant', 'Fav', 'Ranking', 'Bemerkungen']],
      body: visible.map(c => [
        c.name,
        c.is_interesting === 1 ? 'X' : '',
        c.is_favorite === 1    ? 'X' : '',
        c.ranking ? '*'.repeat(c.ranking) : '',
        c.remarks ?? '',
      ]),
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [50, 50, 80] },
      columnStyles: {
        1: { halign: 'center' },
        2: { halign: 'center' },
        3: { halign: 'center' },
      },
      margin: { left: marginX, right: marginX },
    });
    y = (doc as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 20;
  }

  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      `Benny Dashboard · Seite ${p} / ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 20,
      { align: 'center' },
    );
  }

  const filename = `Markennamen_${slug(product.name)}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}
