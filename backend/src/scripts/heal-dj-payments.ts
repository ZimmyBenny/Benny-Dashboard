/**
 * Heal-Skript: bezahlte dj_invoices ohne dj_payments-Eintrag finden und ergaenzen.
 *
 * Hintergrund: Aelteres CSV-Import-Skript (vor Fix Commit 50b9877) schrieb
 * keine dj_payments-Zeile fuer status='bezahlt'-Rechnungen. Das fuehrt dazu,
 * dass die revenue_year-Aggregation in dj.routes/overview die betroffenen
 * Rechnungen NICHT sieht und der DJ-Dashboard-Umsatz zu niedrig ist.
 *
 * Dieses Skript:
 *  1. Auto-Backup vor jeder Aenderung
 *  2. Findet alle dj_invoices mit status='bezahlt' AND is_cancellation=0
 *     ohne korrespondierenden dj_payments-Eintrag
 *  3. Ergaenzt einen Payment-Eintrag mit
 *       payment_date = COALESCE(finalized_at, invoice_date)
 *       amount = total_gross
 *       method = 'legacy-heal'
 *       notes = 'Auto-Heal — kein originales Bezahl-Datum'
 *  4. Synct den Mirror in receipts via mirrorInvoiceToReceipts (paid_amount_cents)
 *
 * Aufruf: cd backend && npx tsx src/scripts/heal-dj-payments.ts
 *
 * Idempotent: Bei keinen Orphans: no-op. Mehrfach-Lauf erzeugt keine Duplikate.
 */
import db from '../db/connection';
import { createBackup } from '../db/backup';
import { mirrorInvoiceToReceipts } from '../services/djSyncService';

interface OrphanInvoice {
  id: number;
  number: string;
  invoice_date: string;
  finalized_at: string | null;
  total_gross: number;
}

console.log('');
console.log('=== DJ-Payments Heal ===');

const orphans = db
  .prepare(
    `
    SELECT i.id, i.number, i.invoice_date, i.finalized_at, i.total_gross
    FROM dj_invoices i
    LEFT JOIN dj_payments p ON p.invoice_id = i.id
    WHERE i.status = 'bezahlt' AND i.is_cancellation = 0 AND p.id IS NULL
    ORDER BY i.invoice_date
    `,
  )
  .all() as OrphanInvoice[];

console.log(`Bezahlte Rechnungen ohne dj_payments-Eintrag: ${orphans.length}`);

if (orphans.length === 0) {
  console.log('Nichts zu heilen — alle bezahlten Rechnungen haben Payment.');
  process.exit(0);
}

const backupPath = createBackup('pre-payments-heal');
console.log(`Backup: ${backupPath}`);
console.log('');

let healed = 0;
for (const o of orphans) {
  const paymentDate = o.finalized_at?.slice(0, 10) ?? o.invoice_date;
  db.prepare(
    `INSERT INTO dj_payments (invoice_id, payment_date, amount, method, notes)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    o.id,
    paymentDate,
    o.total_gross,
    'legacy-heal',
    'Auto-Heal — kein originales Bezahl-Datum',
  );
  try {
    mirrorInvoiceToReceipts(o.id);
  } catch (err) {
    console.warn(`  Mirror-Resync fehlgeschlagen fuer ${o.number}:`, (err as Error).message);
  }
  healed++;
  console.log(`  [✓] ${o.number}  ${paymentDate}  ${o.total_gross} €`);
}

console.log('');
console.log(`Healed: ${healed}/${orphans.length}`);

const remaining = (
  db
    .prepare(
      `SELECT COUNT(*) AS c FROM dj_invoices i
       LEFT JOIN dj_payments p ON p.invoice_id = i.id
       WHERE i.status='bezahlt' AND i.is_cancellation=0 AND p.id IS NULL`,
    )
    .get() as { c: number }
).c;
console.log(`Verbleibende Orphans: ${remaining}`);

if (remaining === 0) {
  console.log('');
  console.log('✓ Alle bezahlten Rechnungen sind konsistent.');
}
console.log('');
