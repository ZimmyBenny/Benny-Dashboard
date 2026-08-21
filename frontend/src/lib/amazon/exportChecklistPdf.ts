import jsPDF from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import { type ChecklistSection } from '../../api/amazon.api';

/** Dateiname-sicher: verbotene Zeichen ersetzen, Original-Schreibweise (Umlaute) bleibt. */
function safeName(s: string, max = 80): string {
  return (s.replace(/[/\\:*?"<>|\x00-\x1f]/g, '_').trim() || 'Checkliste').slice(0, max);
}

/**
 * Exportiert die Produkt-Checkliste als PDF (jsPDF + autotable).
 * `sections` = alle Bereiche (Gesamt-Export) oder ein einzelner Bereich.
 * Spalten wie im UI: Nr · Beschreibung · Erledigt · Bemerkung · Link.
 * Erledigte Punkte bekommen ein „X" und werden leicht ausgegraut.
 */
export function exportChecklistPdf(productName: string, sections: ChecklistSection[]): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 40;
  let y = 50;

  const totalItems = sections.reduce((s, sec) => s + sec.items.length, 0);
  const doneItems = sections.reduce((s, sec) => s + sec.items.filter(i => i.is_done === 1).length, 0);
  const single = sections.length === 1;

  // Titel
  doc.setFontSize(18);
  doc.setTextColor(0);
  doc.text(`Checkliste — ${productName}`, marginX, y);
  y += 22;

  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text(
    `${single ? `Bereich: ${sections[0].title}` : 'Gesamt'} · ${doneItems} / ${totalItems} erledigt · Stand: ${new Date().toLocaleDateString('de-DE')}`,
    marginX,
    y,
  );
  doc.setTextColor(0);
  y += 20;

  for (const section of sections) {
    const secDone = section.items.filter(i => i.is_done === 1).length;

    // Bereichs-Überschrift — bei Platzmangel neue Seite
    if (y > pageHeight - 90) { doc.addPage(); y = 50; }
    doc.setFontSize(13);
    doc.text(`${section.title}  —  ${secDone} / ${section.items.length}`, marginX, y);
    y += 8;

    const items = section.items;
    autoTable(doc, {
      startY: y + 6,
      head: [['#', 'Beschreibung', 'Erledigt', 'Bemerkung', 'Link']],
      body: items.map((it, idx) => [
        String(idx + 1),
        it.description ?? '',
        it.is_done === 1 ? 'X' : '',
        it.remark ?? '',
        it.link_label || it.link_url || '',
      ]),
      styles: { fontSize: 9, cellPadding: 4, valign: 'top' },
      headStyles: { fillColor: [50, 50, 80] },
      columnStyles: {
        0: { halign: 'right', cellWidth: 22 },
        1: { cellWidth: 200 },
        2: { halign: 'center', cellWidth: 46 },
        4: { cellWidth: 110 },
      },
      margin: { left: marginX, right: marginX },
      // Erledigte Zeilen ausgrauen
      didParseCell: (data) => {
        if (data.section === 'body' && items[data.row.index]?.is_done === 1) {
          data.cell.styles.textColor = [150, 150, 150];
        }
      },
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 22;
  }

  // Footer mit Seitenzahlen
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.text(
      `Benny Dashboard · Seite ${p} / ${pageCount}`,
      pageWidth / 2,
      pageHeight - 20,
      { align: 'center' },
    );
  }

  const filename = single
    ? `Checkliste - ${safeName(sections[0].title)} - ${safeName(productName)}.pdf`
    : `Checkliste - ${safeName(productName)}.pdf`;
  doc.save(filename);
}
