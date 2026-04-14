import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const PDF_ARCHIVE_DIR = path.join(process.cwd(), 'backups', 'invoices');
const QUOTE_ARCHIVE_DIR = path.join(process.cwd(), 'backups', 'quotes');

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Platzhalter für Phase 2.
 * Generiert ein einfaches PDF und gibt Pfad + SHA256-Hash zurück.
 * In Phase 2 (Rechnungen) wird dies mit dem vollen RECHNUNGS_TEMPLATE implementiert.
 */
export async function generateInvoicePdf(_invoiceId: number, number: string): Promise<{ path: string; hash: string }> {
  ensureDir(PDF_ARCHIVE_DIR);
  // TODO Phase 2: vollständiges PDF-Layout nach RECHNUNGS_TEMPLATE.md
  const placeholder = Buffer.from(`Rechnung ${number} (PDF-Generierung folgt in Phase 2)`);
  const filePath = path.join(PDF_ARCHIVE_DIR, `${number.replace(/[^A-Z0-9-]/gi, '_')}.pdf`);
  fs.writeFileSync(filePath, placeholder);
  const hash = crypto.createHash('sha256').update(placeholder).digest('hex');
  return { path: filePath, hash };
}

export async function generateQuotePdf(_quoteId: number, number: string): Promise<{ path: string; hash: string }> {
  ensureDir(QUOTE_ARCHIVE_DIR);
  // TODO Phase 2: vollständiges PDF-Layout
  const placeholder = Buffer.from(`Angebot ${number} (PDF-Generierung folgt in Phase 2)`);
  const filePath = path.join(QUOTE_ARCHIVE_DIR, `${number.replace(/[^A-Z0-9-]/gi, '_')}.pdf`);
  fs.writeFileSync(filePath, placeholder);
  const hash = crypto.createHash('sha256').update(placeholder).digest('hex');
  return { path: filePath, hash };
}
