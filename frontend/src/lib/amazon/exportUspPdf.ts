import jsPDF from 'jspdf';
import { getUspImageObjectUrl, type UspMeta, type UspPoint, type UspManufacturer } from '../../api/amazon.api';

// ── Druckfreundliche Palette (weisser Hintergrund) ────────────────────────────
const BG: [number, number, number] = [255, 255, 255];     // weisser Hintergrund (Druck)
const BLUE: [number, number, number] = [45, 70, 150];     // Titel & Ueberschriften (auf Weiss lesbar)
const BODY: [number, number, number] = [38, 40, 48];       // dunkler Fliesstext
const MUTED: [number, number, number] = [120, 122, 134];   // Kopf/Fuss/Hinweis

function slug(s: string, max = 40): string {
  return s.normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, max) || 'x';
}

async function loadImage(url: string): Promise<{ dataUrl: string; w: number; h: number }> {
  const blob = await (await fetch(url)).blob();
  const dataUrl: string = await new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result as string);
    fr.onerror = rej;
    fr.readAsDataURL(blob);
  });
  const dims: { w: number; h: number } = await new Promise((res) => {
    const im = new Image();
    im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight });
    im.onerror = () => res({ w: 0, h: 0 });
    im.src = dataUrl;
  });
  return { dataUrl, ...dims };
}

function isBullet(line: string): boolean {
  return /^\s*[•\-*–]\s+/.test(line);
}
function stripBullet(line: string): string {
  return line.replace(/^\s*[•\-*–]\s+/, '');
}

export async function exportUspPdf(
  productId: number,
  productName: string,
  meta: UspMeta,
  points: UspPoint[],
  manufacturer: UspManufacturer,
): Promise<void> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const cx = pageW / 2;
  const marginX = 56;
  const contentW = pageW - marginX * 2;
  const topY = 64;
  const bottomY = pageH - 44;
  const runningHeader = `${productName} Anforderungen`;

  function paintPage(): void {
    doc.setFillColor(...BG);
    doc.rect(0, 0, pageW, pageH, 'F');
    // Kopfzeile
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(...MUTED);
    doc.text(runningHeader, cx, 34, { align: 'center' });
  }

  let y = topY;
  paintPage();

  function footer(): void {
    const total = doc.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...MUTED);
      doc.text(`Seite ${i} / ${total}`, cx, pageH - 24, { align: 'center' });
    }
  }

  function newPageIfNeeded(need: number): void {
    if (y + need > bottomY) {
      doc.addPage();
      paintPage();
      y = topY;
    }
  }

  // Block aus zentrierten, umgebrochenen Zeilen; Aufzaehlungszeilen bekommen einen Punkt.
  function paragraph(text: string, opts: { size: number; color: [number, number, number]; style?: 'normal' | 'bold' | 'italic'; lh?: number; gap?: number }): void {
    doc.setFont('helvetica', opts.style ?? 'normal');
    doc.setFontSize(opts.size);
    doc.setTextColor(...opts.color);
    const lh = opts.lh ?? opts.size + 4;
    for (const raw of text.split('\n')) {
      const bullet = isBullet(raw);
      const content = bullet ? `•  ${stripBullet(raw)}` : raw;
      const wrapped = doc.splitTextToSize(content, contentW) as string[];
      for (const line of wrapped) {
        newPageIfNeeded(lh);
        doc.text(line, cx, y, { align: 'center' });
        y += lh;
      }
    }
    if (opts.gap) y += opts.gap;
  }

  function heading(text: string): void {
    newPageIfNeeded(26);
    y += 6;
    paragraph(text, { size: 14, color: BLUE, style: 'bold', lh: 18, gap: 4 });
  }

  // ── Titel ──
  paragraph('PRODUKTANFRAGE', { size: 22, color: BLUE, style: 'bold', lh: 26, gap: 4 });
  paragraph(productName, { size: 15, color: BLUE, style: 'bold', lh: 19, gap: 12 });

  // ── Meta ──
  const metaLines = [
    `Marke: ${meta.marke ?? 'wird nachgereicht'}`,
    `Hersteller: ${manufacturer.name || '—'}`,
  ];
  if (manufacturer.ansprechpartner) metaLines.push(`Ansprechpartner: ${manufacturer.ansprechpartner}`);
  metaLines.push(`Datum: ${manufacturer.datum ?? '—'}`);
  paragraph(metaLines.join('\n'), { size: 10, color: BODY, lh: 15, gap: 14 });

  // ── Hauptfokus ──
  if (meta.hauptfokus) {
    heading('Hauptfokus');
    paragraph(meta.hauptfokus, { size: 10.5, color: BODY, lh: 15, gap: 14 });
  }

  // ── Punkte (Auswahl wurde bereits pro Hersteller gefiltert) ──
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const num = i + 1;
    heading(p.title ? `Punkt ${num} – ${p.title}` : `Punkt ${num}`);
    if (p.body) paragraph(p.body, { size: 10.5, color: BODY, lh: 15, gap: 6 });

    for (const img of p.images) {
      try {
        const url = await getUspImageObjectUrl(productId, img.id);
        const { dataUrl, w, h } = await loadImage(url);
        URL.revokeObjectURL(url);
        if (!w || !h) continue;
        const drawW = Math.min(contentW, 300);
        const drawH = (h / w) * drawW;
        newPageIfNeeded(drawH + 10);
        const fmt = dataUrl.includes('image/png') ? 'PNG' : dataUrl.includes('image/webp') ? 'WEBP' : 'JPEG';
        doc.addImage(dataUrl, fmt, cx - drawW / 2, y, drawW, drawH);
        y += drawH + 10;
      } catch {
        /* Bild ueberspringen */
      }
    }
    y += 8;
  }

  footer();
  doc.save(
    `Produktanfrage_${slug(productName)}_${slug(manufacturer.name || 'Hersteller')}_${new Date().toLocaleDateString('en-CA')}.pdf`,
  );
}
