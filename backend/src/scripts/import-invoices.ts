/**
 * Einmaliger Import historischer Rechnungen aus CSV.
 * Führt vorher automatisch ein Backup durch.
 * Duplikate (anhand Rechnungsnummer) werden übersprungen.
 *
 * Aufruf: npx tsx src/scripts/import-invoices.ts
 */

import fs from 'fs';
import path from 'path';
import { createBackup } from '../db/backup';
import db from '../db/connection';

const CSV_PATH = path.resolve(
  __dirname,
  '../../../DJ Dashboard/invoices.csv'
);

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

/** "05.04.2026" → "2026-04-05" */
function parseDate(raw: string): string | null {
  if (!raw?.trim()) return null;
  const [d, m, y] = raw.trim().split('.');
  if (!d || !m || !y) return null;
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

/** "1.450,00" → 1450.00 */
function parseAmount(raw: string): number {
  if (!raw?.trim()) return 0;
  return parseFloat(raw.trim().replace(/\./g, '').replace(',', '.')) || 0;
}

// ── CSV parsen ────────────────────────────────────────────────────────────────

const raw = fs.readFileSync(CSV_PATH, 'utf-8')
  // BOM entfernen
  .replace(/^\uFEFF/, '')
  .trim();

const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
// Erste Zeile = Header, überspringen
const dataLines = lines.slice(1);

interface CsvRow {
  number: string;
  invoice_date: string | null;
  due_date: string | null;
  paid_at: string | null;
  subject: string;
  total_net: number;
  total_gross: number;
  open_amount: number;
  customer_number: string;
  notes: string;
}

function parseLine(line: string): CsvRow {
  const cols = line.split(';');
  return {
    number:          cols[0]?.trim() ?? '',
    invoice_date:    parseDate(cols[1]),
    due_date:        parseDate(cols[2]),
    paid_at:         parseDate(cols[3]),
    subject:         cols[4]?.trim() ?? '',
    total_net:       parseAmount(cols[5]),
    total_gross:     parseAmount(cols[6]),
    open_amount:     parseAmount(cols[7]),
    customer_number: cols[8]?.trim() ?? '',
    notes:           cols[13]?.trim() ?? '',
  };
}

// ── Import ────────────────────────────────────────────────────────────────────

console.log('');
console.log('=== DJ Rechnungen Import ===');
console.log(`CSV: ${CSV_PATH}`);
console.log(`Zeilen: ${dataLines.length}`);
console.log('');

// 1. Backup
console.log('[1/3] Erstelle Backup...');
const backupPath = createBackup('pre-invoice-import');
console.log(`      → ${backupPath}`);
console.log('');

// 2. Kunden-Map aufbauen
console.log('[2/3] Lade Kundendaten...');
const customerMap = new Map<string, number>();
const allContacts = db.prepare(
  'SELECT id, customer_number FROM contacts WHERE customer_number IS NOT NULL'
).all() as { id: number; customer_number: string }[];
for (const c of allContacts) {
  customerMap.set(c.customer_number, c.id);
}
console.log(`      → ${customerMap.size} Kontakte geladen`);
console.log('');

// 3. Rechnungen importieren
console.log('[3/3] Importiere Rechnungen...');

let imported = 0;
let skipped = 0;
let warnings = 0;

const importFn = db.transaction(() => {
  for (const line of dataLines) {
    const row = parseLine(line);

    if (!row.number) { skipped++; continue; }

    // Duplikat prüfen
    const exists = db.prepare('SELECT id FROM dj_invoices WHERE number = ?').get(row.number);
    if (exists) {
      console.log(`  [SKIP]  ${row.number} — bereits vorhanden`);
      skipped++;
      continue;
    }

    // Kunden-ID
    const customerId = customerMap.get(row.customer_number);
    if (!customerId) {
      console.warn(`  [WARN]  ${row.number} — KdNr ${row.customer_number} nicht gefunden, übersprungen`);
      warnings++;
      skipped++;
      continue;
    }

    // Status ableiten
    const isCancellation = row.subject.toLowerCase().includes('stornorechnung') || row.total_gross < 0;
    let status: string;
    if (isCancellation) {
      status = 'storniert';
    } else if (row.paid_at && row.open_amount === 0) {
      status = 'bezahlt';
    } else if (row.open_amount > 0) {
      status = 'offen';
    } else {
      status = 'bezahlt';
    }

    // Steuer ableiten
    const taxTotal = Math.round((row.total_gross - row.total_net) * 100) / 100;
    const taxRate = taxTotal > 0 ? 19.0 : 0.0;

    // Bezahlter Betrag
    const paidAmount = status === 'bezahlt' ? row.total_gross : (row.total_gross - row.open_amount);

    // Beschreibung für Position (Notiz-Spalte bevorzugen)
    const itemDescription = row.notes || row.subject || row.number;

    // Rechnung als Entwurf einfügen (damit Trigger für Items nicht blockiert)
    const result = db.prepare(`
      INSERT INTO dj_invoices (
        number, customer_id, subject,
        status, invoice_date, due_date,
        subtotal_net, tax_total, discount_total, total_gross,
        paid_amount, is_cancellation,
        finalized_at
      ) VALUES (?, ?, ?, 'entwurf', ?, ?, ?, ?, 0, ?, ?, ?, NULL)
    `).run(
      row.number,
      customerId,
      row.subject,
      row.invoice_date,
      row.due_date,
      row.total_net,
      taxTotal,
      row.total_gross,
      paidAmount,
      isCancellation ? 1 : 0,
    );

    const invoiceId = result.lastInsertRowid as number;

    // Position einfügen (CSV hat nur Gesamtbetrag, keine Einzelpositionen)
    db.prepare(`
      INSERT INTO dj_invoice_items (invoice_id, position, description, quantity, unit, price_net, tax_rate, total_net)
      VALUES (?, 1, ?, 1, 'Pauschal', ?, ?, ?)
    `).run(invoiceId, itemDescription, row.total_net, taxRate, row.total_net);

    // Jetzt Status + finalized_at setzen
    db.prepare(`
      UPDATE dj_invoices SET status = ?, finalized_at = ? WHERE id = ?
    `).run(status, isCancellation ? null : row.invoice_date, invoiceId);

    // Bei bezahlten Rechnungen: dj_payments-Zeile anlegen, damit revenue_year-
    // Aggregation (DJ-Dashboard, dj.routes /overview) den Betrag sieht.
    if (status === 'bezahlt' && row.paid_at) {
      db.prepare(`
        INSERT INTO dj_payments (invoice_id, payment_date, amount, method)
        VALUES (?, ?, ?, ?)
      `).run(invoiceId, row.paid_at, row.total_gross, 'import');
    }

    const statusIcon = status === 'bezahlt' ? '✓' : status === 'storniert' ? '✕' : '○';
    console.log(`  [${statusIcon}]  ${row.number}  ${row.invoice_date}  ${String(row.total_gross).padStart(10)}€  → ${customerId} (KdNr ${row.customer_number})  [${status}]`);
    imported++;
  }
});

importFn();

console.log('');
console.log('══════════════════════════════════════');
console.log(`  Importiert:   ${imported}`);
console.log(`  Übersprungen: ${skipped}`);
if (warnings > 0) console.log(`  Warnungen:    ${warnings}`);
console.log('══════════════════════════════════════');
console.log('');
if (imported > 0) {
  console.log('✓ Import erfolgreich abgeschlossen.');
} else {
  console.log('ℹ Keine neuen Rechnungen importiert (alle bereits vorhanden?).');
}
console.log('');
