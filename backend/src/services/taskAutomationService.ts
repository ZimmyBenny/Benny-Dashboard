/**
 * taskAutomationService — automatische Task-Erstellung fuer faellige Belege.
 *
 * Verhalten:
 *  - SELECT receipts WHERE status IN ('offen','teilbezahlt') AND due_date IS NOT NULL
 *    AND date(due_date) <= date('now', '+lead_days days')
 *  - Fuer jeden Treffer ohne existierende, nicht-archivierte Task mit
 *    source_receipt_id wird eine neue Task ('open', 'medium') erstellt.
 *  - Idempotent: zweiter Aufruf erstellt kein Duplikat.
 *
 * Konfiguration:
 *  - app_settings.payment_task_lead_days (Default 3)
 *
 * Aufruf:
 *  - Beim Server-Start (server.ts) — einmaliger Sweep nach Migrations.
 *  - Manuell via POST /api/belege/run-task-automation (siehe belege.routes.ts).
 *
 * Sicherheit:
 *  - Lead-Days wird via parseInt validiert (NaN/Negativ → Default 3).
 *  - SQL-Parameter werden via `?`-Platzhalter gebunden (keine String-Concat).
 */
import db from '../db/connection';

interface KvRow {
  value: string;
}

interface OpenReceipt {
  id: number;
  supplier_name: string | null;
  supplier_invoice_number: string | null;
  due_date: string;
  amount_gross_cents: number;
  payment_method: string | null;
  status: string;
}

export interface CheckResult {
  scanned: number;
  tasksCreated: number;
  createdReceiptIds: number[];
}

/**
 * Liest `payment_task_lead_days` aus app_settings.
 * Gibt Default 3 zurueck wenn Setting fehlt, leer ist oder kein
 * gueltiger Integer >= 0.
 */
function getLeadDays(): number {
  const r = db
    .prepare(`SELECT value FROM app_settings WHERE key = 'payment_task_lead_days'`)
    .get() as KvRow | undefined;
  if (!r) return 3;
  const n = parseInt(r.value, 10);
  return Number.isFinite(n) && n >= 0 ? n : 3;
}

/**
 * Formatiert Cents als deutschen Euro-String: 11900 → "119,00 €".
 */
function formatEuro(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}${(abs / 100).toFixed(2).replace('.', ',')} €`;
}

/**
 * Erstellt Tasks fuer offene Belege, deren Faelligkeit innerhalb des
 * Lead-Days-Fensters liegt.
 *
 * Idempotent: skipt Receipts, fuer die bereits eine nicht-archivierte
 * Task mit `source_receipt_id` existiert.
 *
 * @returns CheckResult mit `scanned` (Kandidaten), `tasksCreated` (neu
 *          angelegt) und `createdReceiptIds` (IDs der Belege fuer die
 *          eine Task angelegt wurde).
 */
export function checkOpenPayments(): CheckResult {
  const leadDays = getLeadDays();

  const candidates = db
    .prepare(
      `
      SELECT r.id, r.supplier_name, r.supplier_invoice_number, r.due_date,
             r.amount_gross_cents, r.payment_method, r.status
      FROM receipts r
      WHERE r.status IN ('offen', 'teilbezahlt')
        AND r.due_date IS NOT NULL
        AND date(r.due_date) <= date('now', '+' || ? || ' days')
    `,
    )
    .all(leadDays) as OpenReceipt[];

  let tasksCreated = 0;
  const createdReceiptIds: number[] = [];

  const checkExistingStmt = db.prepare(
    `SELECT id FROM tasks
       WHERE source_receipt_id = ?
         AND status != 'archived'
       LIMIT 1`,
  );
  const insertStmt = db.prepare(
    `
    INSERT INTO tasks (
      title, description, status, priority, due_date, source_receipt_id
    ) VALUES (?, ?, 'open', 'medium', ?, ?)
    `,
  );

  for (const r of candidates) {
    const existing = checkExistingStmt.get(r.id) as { id: number } | undefined;
    if (existing) continue;

    const supplierLabel = r.supplier_name && r.supplier_name.trim()
      ? r.supplier_name.trim()
      : `Beleg #${r.id}`;
    const amountLabel = formatEuro(r.amount_gross_cents);
    const title = `Zahlung an ${supplierLabel} fällig: ${amountLabel}`;

    const descLines = [
      r.supplier_invoice_number ? `Rechnungsnummer: ${r.supplier_invoice_number}` : null,
      r.payment_method ? `Zahlart: ${r.payment_method}` : null,
      `Fälligkeit: ${r.due_date}`,
    ].filter((s): s is string => Boolean(s));
    const description = descLines.join('\n');

    insertStmt.run(title, description, r.due_date, r.id);
    tasksCreated++;
    createdReceiptIds.push(r.id);
  }

  return { scanned: candidates.length, tasksCreated, createdReceiptIds };
}

/** Default-Bundle fuer komfortable Verwendung in Routes/server.ts. */
export const taskAutomationService = {
  checkOpenPayments,
};
