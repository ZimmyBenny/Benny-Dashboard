import jsPDF from 'jspdf';
import { getUspImageObjectUrl, type UspMeta, type UspPoint, type UspManufacturer } from '../../api/amazon.api';

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
  const mX = 40;
  const contentW = pageW - mX * 2;
  let y = 50;

  const ensure = (need: number) => {
    if (y + need > pageH - 50) {
      doc.addPage();
      y = 50;
    }
  };

  doc.setFontSize(20);
  doc.text('PRODUKTANFRAGE', mX, y);
  y += 22;

  doc.setFontSize(13);
  doc.setTextColor(60);
  doc.text(productName, mX, y);
  y += 20;

  doc.setTextColor(0);
  doc.setFontSize(10);
  doc.text(`Marke: ${meta.marke ?? '-'}`, mX, y);
  y += 14;
  doc.text(`Hersteller: ${manufacturer.name || '-'}`, mX, y);
  y += 14;
  doc.text(`Datum: ${manufacturer.datum ?? '-'}`, mX, y);
  y += 18;

  if (meta.hauptfokus) {
    doc.setFontSize(12);
    doc.text('Hauptfokus', mX, y);
    y += 14;
    doc.setFontSize(10);
    for (const l of doc.splitTextToSize(meta.hauptfokus, contentW)) {
      ensure(14);
      doc.text(l, mX, y);
      y += 14;
    }
    y += 6;
  }

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    ensure(20);
    doc.setFontSize(13);
    doc.setTextColor(30, 64, 130);
    doc.text(`Punkt ${i + 1} - ${p.title || ''}`, mX, y);
    y += 16;

    doc.setTextColor(0);
    doc.setFontSize(10);

    if (p.body) {
      for (const l of doc.splitTextToSize(p.body, contentW)) {
        ensure(14);
        doc.text(l, mX, y);
        y += 14;
      }
    }

    for (const img of p.images) {
      try {
        const url = await getUspImageObjectUrl(productId, img.id);
        const { dataUrl, w, h } = await loadImage(url);
        URL.revokeObjectURL(url);
        if (!w || !h) continue;
        const drawW = Math.min(contentW, 320);
        const drawH = (h / w) * drawW;
        ensure(drawH + 8);
        const fmt = dataUrl.includes('image/png') ? 'PNG' : dataUrl.includes('image/webp') ? 'WEBP' : 'JPEG';
        doc.addImage(dataUrl, fmt, mX, y, drawW, drawH);
        y += drawH + 8;
      } catch {
        /* Bild überspringen */
      }
    }

    y += 8;
  }

  doc.save(
    `Produktanfrage_${slug(productName)}_${slug(manufacturer.name || 'Hersteller')}_${new Date().toLocaleDateString('en-CA')}.pdf`,
  );
}
