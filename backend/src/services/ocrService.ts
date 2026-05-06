/**
 * OCR-Service für Beleg-Texterkennung.
 *
 * Engines:
 *  - 'tesseract' (default) — tesseract.js mit deu+eng; Worker pro Job (Memory-Leak-Schutz)
 *  - 'mock' — gibt leeres OcrResult zurück; aktiviert via app_settings.ocr_engine='mock'
 *
 * PDF-Pipeline:
 *  - PDFs werden via pdf-to-img zu PNG-Buffer rasterisiert (nur Seite 1, scale=2.0).
 *  - Rasterisierter Buffer wird dann an ocrImage uebergeben.
 *  - PDF-Bombs (1000-Seiten-PDFs) werden durch das fruehe break in der for-await-Schleife begrenzt.
 *
 * Fehlertoleranz:
 *  - Bei tesseract.js-Fehlern (Modul fehlt, Worker-Crash, ...) wird auf Mock-Output
 *    zurueckgefallen (kein 500). Upload-Pipeline laeuft trotzdem weiter; Beleg
 *    landet in zu_pruefen-Status fuer manuelle Eingabe.
 */
import path from 'path';
import db from '../db/connection';
import type { OcrResult } from '../types/receipt';

interface KvRow {
  value: string;
}

function getSetting(key: string, dflt: string): string {
  try {
    const r = db
      .prepare(`SELECT value FROM app_settings WHERE key = ?`)
      .get(key) as KvRow | undefined;
    return r?.value ?? dflt;
  } catch {
    return dflt;
  }
}

function mockOcr(_input: string | Buffer): OcrResult {
  return { text: '', confidence: 0, engine: 'mock', languages: 'deu+eng' };
}

/**
 * Rasterisiert die ERSTE Seite eines PDFs zu einem PNG-Buffer.
 * scale=2.0 → A4 ergibt ~1190×1684 Pixel (gut fuer OCR).
 *
 * Bricht nach der ersten Seite ab → PDF-Bomb-Schutz.
 */
export async function rasterizeFirstPage(pdfPath: string): Promise<Buffer> {
  const pdfMod = await import('pdf-to-img');
  const document = await pdfMod.pdf(pdfPath, { scale: 2.0 });
  for await (const page of document) {
    return page as Buffer;
  }
  throw new Error('PDF has no pages');
}

/**
 * Fuehrt OCR auf einem Bild (Datei-Pfad oder Buffer) aus.
 * Bei engine='mock' wird sofort der Mock-Output zurueckgegeben.
 *
 * KRITISCH: Worker wird per-Job via terminate() abgebaut — verhindert Memory-Leak
 * in long-running Express-Prozessen.
 */
export async function ocrImage(input: string | Buffer): Promise<OcrResult> {
  const engineSetting = getSetting('ocr_engine', 'tesseract');
  if (engineSetting === 'mock') return mockOcr(input);

  try {
    const tess = await import('tesseract.js');
    const worker = await tess.createWorker(['deu', 'eng'], 1, {
      logger: () => {
        /* unterdruecke Tesseract-Logging */
      },
    });
    try {
      const { data } = await worker.recognize(input);
      return {
        text: data.text || '',
        confidence: typeof data.confidence === 'number' ? data.confidence : 0,
        engine: 'tesseract',
        languages: 'deu+eng',
      };
    } finally {
      // KRITISCH: Worker per-Job terminieren (Memory-Leak-Schutz)
      await worker.terminate();
    }
  } catch (err) {
    console.warn('[ocrService] tesseract failed, falling back to mock:', (err as Error).message);
    return mockOcr(input);
  }
}

/**
 * Auto-Routing nach Dateiendung.
 *  - .pdf  → rasterizeFirstPage → ocrImage(buffer)
 *  - .jpg/.jpeg/.png  → direkt ocrImage(filePath)
 */
export async function ocrFile(filePath: string): Promise<OcrResult> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') {
    try {
      const pageBuffer = await rasterizeFirstPage(filePath);
      return ocrImage(pageBuffer);
    } catch (err) {
      console.warn('[ocrService] PDF rasterization failed:', (err as Error).message);
      return mockOcr(filePath);
    }
  }
  return ocrImage(filePath);
}

export const ocrService = { ocrFile, ocrImage, rasterizeFirstPage };
