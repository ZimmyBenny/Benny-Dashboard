import db from '../db/connection';
import { logAudit } from './audit.service';
import type { Request } from 'express';

/**
 * djSyncService — spiegelt dj_invoices in receipts.
 *
 * Verhalten:
 * - Idempotent: bei jeder Mutation auf dj_invoices wird mirrorInvoiceToReceipts(invoiceId)
 *   aufgerufen. Wenn ein Mirror existiert (source='dj_invoice_sync' AND linked_invoice_id=invoiceId),
 *   wird ge-UPDATEt; sonst INSERT.
 * - Stornorechnungen (is_cancellation=1) bekommen einen eigenen Mirror mit
 *   corrects_receipt_id auf den Original-Mirror und negativen Cents-Beträgen.
 * - REAL-Beträge aus dj_invoices.total_gross/subtotal_net/tax_total werden
 *   via Math.round(value * 100) zu Cents konvertiert (Float-Drift-Schutz).
 * - GoBD-Lock-Awareness: wenn der gespiegelte Beleg bereits freigegeben_at hat,
 *   werden NUR status/payment_date/paid_amount_cents geändert (nicht-gesperrte Felder).
 */

interface DjInvoice {
  id: number;
  number: string | null;
  customer_id: number;
  event_id: number | null;
  status: string;
  invoice_date: string;
  due_date: string | null;
  subtotal_net: number;
  tax_total: number;
  total_gross: number;
  pdf_hash: string | null;
  finalized_at: string | null;
  cancels_invoice_id: number | null;
  cancelled_by_invoice_id: number | null;
  is_cancellation: number;
}

interface ContactRow {
  first_name: string | null;
  last_name: string | null;
  organization_name: string | null;
}

function getCustomerName(customerId: number): string {
  const c = db
    .prepare(
      `SELECT first_name, last_name, organization_name FROM contacts WHERE id = ?`,
    )
    .get(customerId) as ContactRow | undefined;
  if (!c) return `Kunde #${customerId}`;
  return (
    c.organization_name ||
    [c.first_name, c.last_name].filter(Boolean).join(' ') ||
    `Kunde #${customerId}`
  );
}

function getDjAreaId(): number | null {
  const r = db.prepare(`SELECT id FROM areas WHERE slug = 'dj' LIMIT 1`).get() as
    | { id: number }
    | undefined;
  return r?.id ?? null;
}

function getLastPaymentDate(invoiceId: number): string | null {
  // WICHTIG: Tabelle heisst dj_payments (nicht dj_invoice_payments wie der Plan-Snippet annahm).
  const r = db
    .prepare(`SELECT MAX(payment_date) AS d FROM dj_payments WHERE invoice_id = ?`)
    .get(invoiceId) as { d: string | null } | undefined;
  return r?.d ?? null;
}

function ensureAreaLink(receiptId: number, areaId: number): void {
  db.prepare(
    `INSERT OR IGNORE INTO receipt_area_links (receipt_id, area_id, is_primary, share_percent)
     VALUES (?, ?, 1, 100)`,
  ).run(receiptId, areaId);
}

function statusToReceiptStatus(invStatus: string): string {
  switch (invStatus) {
    case 'bezahlt':
      return 'bezahlt';
    case 'teilbezahlt':
      return 'teilbezahlt';
    case 'ueberfaellig':
      return 'ueberfaellig';
    case 'storniert':
      return 'storniert';
    case 'entwurf':
      return 'zu_pruefen';
    default:
      return 'offen';
  }
}

/**
 * Spiegelt eine dj_invoice in receipts. Idempotent:
 * - Wenn Mirror existiert (source='dj_invoice_sync' AND linked_invoice_id=invoiceId) → UPDATE
 * - Sonst INSERT
 *
 * Bei is_cancellation=1: corrects_receipt_id auf Original-Mirror; Cents-Beträge NEGATIV.
 *
 * @returns receiptId des Mirrors oder null wenn invoice nicht existiert.
 */
export function mirrorInvoiceToReceipts(
  invoiceId: number,
  req?: Request,
): number | null {
  const inv = db
    .prepare(`SELECT * FROM dj_invoices WHERE id = ?`)
    .get(invoiceId) as DjInvoice | undefined;
  if (!inv) return null;

  const areaId = getDjAreaId();
  const supplierName = getCustomerName(inv.customer_id);
  const grossCents = Math.round(inv.total_gross * 100);
  const netCents = Math.round(inv.subtotal_net * 100);
  const vatCents = Math.round(inv.tax_total * 100);
  const status = statusToReceiptStatus(inv.status);
  const paymentDate =
    inv.status === 'bezahlt' || inv.status === 'teilbezahlt'
      ? getLastPaymentDate(invoiceId)
      : null;
  const isCancellation = inv.is_cancellation === 1;
  const finalAmountGross = isCancellation ? -Math.abs(grossCents) : grossCents;
  const finalAmountNet = isCancellation ? -Math.abs(netCents) : netCents;
  const finalVat = isCancellation ? -Math.abs(vatCents) : vatCents;

  // Korrektur-Verkettung bei Stornos: Original-Mirror per cancels_invoice_id finden.
  // Defensive: wenn Original noch nicht synchronisiert wurde, bleibt correctsReceiptId NULL.
  let correctsReceiptId: number | null = null;
  if (isCancellation && inv.cancels_invoice_id) {
    const orig = db
      .prepare(
        `SELECT id FROM receipts WHERE source = 'dj_invoice_sync' AND linked_invoice_id = ?`,
      )
      .get(inv.cancels_invoice_id) as { id: number } | undefined;
    correctsReceiptId = orig?.id ?? null;
  }

  const existing = db
    .prepare(
      `SELECT id FROM receipts WHERE source = 'dj_invoice_sync' AND linked_invoice_id = ?`,
    )
    .get(invoiceId) as { id: number } | undefined;

  let receiptId: number;
  if (existing) {
    // GoBD-Lock-Awareness: bei freigegebenem Mirror nur nicht-gesperrte Felder updaten.
    const r = db
      .prepare(`SELECT freigegeben_at FROM receipts WHERE id = ?`)
      .get(existing.id) as { freigegeben_at: string | null };
    const isLocked = r.freigegeben_at !== null;

    if (isLocked) {
      // GoBD-Trigger blockt finanzrelevante Felder; supplier_contact_id ist
      // Metadaten und nicht geblockt — wird daher mitgepflegt.
      db.prepare(
        `UPDATE receipts
         SET status = ?, payment_date = ?, paid_amount_cents = ?,
             supplier_contact_id = COALESCE(?, supplier_contact_id),
             updated_at = datetime('now')
         WHERE id = ?`,
      ).run(
        status,
        paymentDate,
        status === 'bezahlt' ? finalAmountGross : 0,
        inv.customer_id,
        existing.id,
      );
    } else {
      db.prepare(
        `UPDATE receipts SET
           supplier_name = ?, supplier_contact_id = ?, receipt_number = ?,
           receipt_date = ?, due_date = ?,
           amount_gross_cents = ?, amount_net_cents = ?, vat_rate = 19, vat_amount_cents = ?,
           paid_amount_cents = ?,
           status = ?, payment_date = ?,
           freigegeben_at = ?, file_hash_sha256 = ?,
           corrects_receipt_id = ?,
           updated_at = datetime('now')
         WHERE id = ?`,
      ).run(
        supplierName,
        inv.customer_id,
        inv.number,
        inv.invoice_date,
        inv.due_date,
        finalAmountGross,
        finalAmountNet,
        finalVat,
        status === 'bezahlt' ? finalAmountGross : 0,
        status,
        paymentDate,
        inv.finalized_at,
        inv.pdf_hash,
        correctsReceiptId,
        existing.id,
      );
    }
    receiptId = existing.id;
  } else {
    const result = db
      .prepare(
        `INSERT INTO receipts (
          type, source, supplier_name, supplier_contact_id, receipt_number,
          receipt_date, due_date, payment_date,
          amount_gross_cents, amount_net_cents, vat_rate, vat_amount_cents,
          paid_amount_cents,
          status, freigegeben_at, file_hash_sha256,
          corrects_receipt_id, linked_invoice_id,
          steuerrelevant, input_tax_deductible, reverse_charge
        ) VALUES (
          'ausgangsrechnung', 'dj_invoice_sync', ?, ?, ?,
          ?, ?, ?,
          ?, ?, 19, ?,
          ?,
          ?, ?, ?,
          ?, ?,
          1, 0, 0
        )`,
      )
      .run(
        supplierName,
        inv.customer_id,
        inv.number,
        inv.invoice_date,
        inv.due_date,
        paymentDate,
        finalAmountGross,
        finalAmountNet,
        finalVat,
        status === 'bezahlt' ? finalAmountGross : 0,
        status,
        inv.finalized_at,
        inv.pdf_hash,
        correctsReceiptId,
        invoiceId,
      );
    receiptId = Number(result.lastInsertRowid);

    // Korrekturkette beidseitig setzen: Original-Mirror bekommt corrected_by_receipt_id
    if (isCancellation && correctsReceiptId) {
      db.prepare(
        `UPDATE receipts SET corrected_by_receipt_id = ? WHERE id = ?`,
      ).run(receiptId, correctsReceiptId);
    }
  }

  if (areaId) ensureAreaLink(receiptId, areaId);

  if (req) {
    logAudit(req, 'receipt', receiptId, 'mirror_sync', undefined, {
      source: 'dj_invoice',
      invoiceId,
    });
  }

  return receiptId;
}

export const djSyncService = { mirrorInvoiceToReceipts };
