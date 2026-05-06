import db from '../db/connection';
import type { Request } from 'express';
import { logAudit } from './audit.service';
import { calcVatCents, calcNetCents } from '../lib/cents';
import type {
  CreateReceiptInput,
  Receipt,
  ParsedReceipt,
  OcrResult,
} from '../types/receipt';

/**
 * Service-Layer für Belege (receipts-Tabelle).
 *
 * Aufgaben:
 *  - CRUD mit Audit-Log (jede mutation schreibt in audit_log)
 *  - SHA-256-Duplicate-Check beim create
 *  - Auto-Vervollständigung von net/vat/gross via lib/cents
 *  - GoBD-Freigabe (status=freigegeben + freigegeben_at) — DB-Trigger
 *    blockt anschließend die Änderung finanzrelevanter Felder
 *
 * Hinweis: Alle Methoden akzeptieren `req: Request | null` — `null` wird
 * für system-initiierte Mutationen genutzt (z.B. Cron, Sync). In dem Fall
 * wird kein Audit-Eintrag mit user-Kontext geschrieben.
 */

/** Wird geworfen wenn create() einen Beleg mit identischem SHA findet. */
export class DuplicateReceiptError extends Error {
  constructor(public existingId: number, public sha: string) {
    super(`Duplicate receipt (sha=${sha}, existing id=${existingId})`);
    this.name = 'DuplicateReceiptError';
  }
}

/**
 * Vervollständigt fehlende Geld-Felder aus den vorhandenen.
 * - Wenn nur gross+rate gesetzt → net = gross - vat, vat = round(gross*rate/(100+rate))
 * - Wenn nur net+rate gesetzt   → vat = round(net*rate/100), gross = net + vat
 * - Sonst Werte unverändert übernehmen
 */
function recomputeAmounts(
  input: CreateReceiptInput,
): { net: number; vat: number; gross: number } {
  const rate = input.vat_rate ?? 19;
  const gross = input.amount_gross_cents ?? 0;
  let net = input.amount_net_cents ?? 0;
  let vat = input.vat_amount_cents ?? 0;

  if (gross > 0 && net === 0 && vat === 0) {
    net = calcNetCents(gross, rate);
    vat = gross - net;
  } else if (net > 0 && vat === 0 && gross === 0) {
    vat = calcVatCents(net, rate);
  }
  return { net, vat, gross };
}

/**
 * Legt einen neuen Beleg an.
 *
 * @throws DuplicateReceiptError wenn input.file_hash_sha256 schon existiert.
 */
export function create(req: Request | null, input: CreateReceiptInput): Receipt {
  // Duplicate-Check via SHA-256
  if (input.file_hash_sha256) {
    const existing = db
      .prepare(`SELECT id FROM receipts WHERE file_hash_sha256 = ?`)
      .get(input.file_hash_sha256) as { id: number } | undefined;
    if (existing) {
      throw new DuplicateReceiptError(existing.id, input.file_hash_sha256);
    }
  }

  const { net, vat, gross } = recomputeAmounts(input);

  const stmt = db.prepare(`
    INSERT INTO receipts (
      type, source, created_via,
      supplier_name, supplier_contact_id,
      supplier_invoice_number, receipt_number,
      receipt_date, due_date, payment_date,
      currency, amount_gross_cents, amount_net_cents,
      vat_rate, vat_amount_cents,
      tax_category_id, tax_category,
      steuerrelevant, input_tax_deductible,
      reverse_charge, import_eust, private_share_percent,
      status, file_hash_sha256, original_filename,
      payment_method, payment_account_ref, paid_amount_cents,
      linked_invoice_id, linked_trip_id,
      title, notes, tags
    ) VALUES (
      @type, @source, @created_via,
      @supplier_name, @supplier_contact_id,
      @supplier_invoice_number, @receipt_number,
      @receipt_date, @due_date, @payment_date,
      @currency, @amount_gross_cents, @amount_net_cents,
      @vat_rate, @vat_amount_cents,
      @tax_category_id, @tax_category,
      @steuerrelevant, @input_tax_deductible,
      @reverse_charge, @import_eust, @private_share_percent,
      @status, @file_hash_sha256, @original_filename,
      @payment_method, @payment_account_ref, @paid_amount_cents,
      @linked_invoice_id, @linked_trip_id,
      @title, @notes, @tags
    )
  `);

  const result = stmt.run({
    type: input.type,
    source: input.source ?? 'manual_upload',
    created_via: input.created_via ?? null,
    supplier_name: input.supplier_name ?? null,
    supplier_contact_id: input.supplier_contact_id ?? null,
    supplier_invoice_number: input.supplier_invoice_number ?? null,
    receipt_number: input.receipt_number ?? null,
    receipt_date: input.receipt_date,
    due_date: input.due_date ?? null,
    payment_date: input.payment_date ?? null,
    currency: input.currency ?? 'EUR',
    amount_gross_cents: gross,
    amount_net_cents: net,
    vat_rate: input.vat_rate ?? 19,
    vat_amount_cents: vat,
    tax_category_id: input.tax_category_id ?? null,
    tax_category: input.tax_category ?? null,
    steuerrelevant: input.steuerrelevant ?? 1,
    input_tax_deductible: input.input_tax_deductible ?? 1,
    reverse_charge: input.reverse_charge ?? 0,
    import_eust: input.import_eust ?? 0,
    private_share_percent: input.private_share_percent ?? 0,
    status: input.status ?? 'zu_pruefen',
    file_hash_sha256: input.file_hash_sha256 ?? null,
    original_filename: input.original_filename ?? null,
    payment_method: input.payment_method ?? null,
    payment_account_ref: input.payment_account_ref ?? null,
    paid_amount_cents: input.paid_amount_cents ?? 0,
    linked_invoice_id: input.linked_invoice_id ?? null,
    linked_trip_id: input.linked_trip_id ?? null,
    title: input.title ?? null,
    notes: input.notes ?? null,
    tags: input.tags ?? null,
  });

  const id = Number(result.lastInsertRowid);

  if (req) {
    logAudit(req, 'receipt', id, 'create', undefined, {
      type: input.type,
      supplier: input.supplier_name,
      gross,
      source: input.source ?? 'manual_upload',
    });
  }

  return db.prepare(`SELECT * FROM receipts WHERE id = ?`).get(id) as Receipt;
}

/** Felder, die via update() veränderbar sind. Nicht änderbar: id/type/source/created_at/freigegeben_*. */
const UPDATABLE_FIELDS = [
  'supplier_name',
  'supplier_contact_id',
  'supplier_invoice_number',
  'receipt_number',
  'receipt_date',
  'due_date',
  'payment_date',
  'currency',
  'amount_gross_cents',
  'amount_net_cents',
  'vat_rate',
  'vat_amount_cents',
  'tax_category_id',
  'tax_category',
  'steuerrelevant',
  'input_tax_deductible',
  'reverse_charge',
  'import_eust',
  'private_share_percent',
  'status',
  'payment_method',
  'payment_account_ref',
  'paid_amount_cents',
  'title',
  'notes',
  'tags',
] as const;

/**
 * Partielles Update.
 *
 * Wenn der Beleg bereits freigegeben ist, blockt der DB-Trigger
 * `trg_receipts_no_update_after_freigabe` das UPDATE auf finanzrelevante
 * Felder mit `RAISE(ABORT, 'GoBD: ...')` — die Exception wird hier
 * weitergereicht.
 */
export function update(
  req: Request | null,
  id: number,
  fields: Partial<CreateReceiptInput>,
): Receipt {
  const existing = db.prepare(`SELECT * FROM receipts WHERE id = ?`).get(id) as
    | Receipt
    | undefined;
  if (!existing) throw new Error(`Receipt ${id} not found`);

  const sets: string[] = [];
  const params: Record<string, unknown> = { id };

  for (const k of UPDATABLE_FIELDS) {
    if (k in fields) {
      sets.push(`${k} = @${k}`);
      params[k] = (fields as Record<string, unknown>)[k];
    }
  }
  if (sets.length === 0) return existing;

  sets.push("updated_at = datetime('now')");
  db.prepare(`UPDATE receipts SET ${sets.join(', ')} WHERE id = @id`).run(params);

  if (req) {
    logAudit(req, 'receipt', id, 'update', existing, fields);
  }

  return db.prepare(`SELECT * FROM receipts WHERE id = ?`).get(id) as Receipt;
}

/**
 * Wendet ein OCR-Ergebnis an.
 *
 * Übernimmt nur Felder mit ausreichender Konfidenz:
 *  - supplier_name nur bei confidence > 0.5 (verhindert dass schlechtes OCR
 *    den User-eingegebenen Lieferanten überschreibt)
 *  - andere Felder werden übernommen, sobald `value !== null`
 *
 * Persistiert die OCR-Result-Row in receipt_ocr_results und schreibt
 * Audit-Log mit action='ocr_apply'.
 */
export function applyOcrResult(
  req: Request | null,
  id: number,
  ocr: OcrResult,
  parsed: ParsedReceipt,
): void {
  const fields: Partial<CreateReceiptInput> = {};

  if (parsed.supplier_name.value && parsed.supplier_name.confidence > 0.5) {
    fields.supplier_name = parsed.supplier_name.value;
  }
  if (parsed.supplier_invoice_number.value !== null) {
    fields.supplier_invoice_number = parsed.supplier_invoice_number.value;
  }
  if (parsed.receipt_date.value !== null) {
    fields.receipt_date = parsed.receipt_date.value;
  }
  if (parsed.amount_gross_cents.value !== null) {
    fields.amount_gross_cents = parsed.amount_gross_cents.value;
  }
  if (parsed.amount_net_cents.value !== null) {
    fields.amount_net_cents = parsed.amount_net_cents.value;
  }
  if (parsed.vat_amount_cents.value !== null) {
    fields.vat_amount_cents = parsed.vat_amount_cents.value;
  }
  if (parsed.vat_rate.value !== null) {
    fields.vat_rate = parsed.vat_rate.value;
  }
  if (parsed.reverse_charge.value !== null) {
    fields.reverse_charge = parsed.reverse_charge.value ? 1 : 0;
  }
  fields.status = 'zu_pruefen';

  // Update OHNE Audit (zweiter Audit-Eintrag wäre redundant)
  update(null, id, fields);

  // OCR-Row persistieren
  db.prepare(
    `
    INSERT INTO receipt_ocr_results
      (receipt_id, engine, languages, full_text, overall_confidence, parsed_fields_json, applied_at)
    VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
  `,
  ).run(
    id,
    ocr.engine,
    ocr.languages,
    ocr.text,
    ocr.confidence,
    JSON.stringify(parsed),
  );

  if (req) {
    logAudit(req, 'receipt', id, 'ocr_apply', undefined, {
      confidence: ocr.confidence,
      engine: ocr.engine,
      languages: ocr.languages,
    });
  }
}

/**
 * Kennzeichnet einen Beleg dessen OCR fehlgeschlagen ist als manuell zu prüfen.
 * Wirkt nur, wenn der Beleg aktuell `ocr_pending` ist.
 */
export function markOcrFailed(req: Request | null, id: number): void {
  const result = db
    .prepare(
      `UPDATE receipts SET status = 'zu_pruefen', updated_at = datetime('now')
       WHERE id = ? AND status = 'ocr_pending'`,
    )
    .run(id);

  if (req && result.changes > 0) {
    logAudit(req, 'receipt', id, 'update', undefined, { ocr_failed: true });
  }
}

/**
 * Gibt einen Beleg frei (GoBD-Lock).
 *
 * Setzt freigegeben_at + freigegeben_by + status='freigegeben'. Idempotent:
 * Falls bereits freigegeben → keine Änderung, gibt aktuellen Stand zurück.
 *
 * Nach Freigabe blockt der DB-Trigger weitere Änderungen finanzrelevanter
 * Felder; lediglich notes/tags/payment-Felder bleiben editierbar (s.
 * Migration 040 trg_receipts_no_update_after_freigabe).
 */
export function freigeben(req: Request | null, id: number, actor: string): Receipt {
  const existing = db.prepare(`SELECT * FROM receipts WHERE id = ?`).get(id) as
    | Receipt
    | undefined;
  if (!existing) throw new Error(`Receipt ${id} not found`);

  // Idempotent: schon freigegeben → return ohne Änderung
  if (existing.freigegeben_at) return existing;

  db.prepare(
    `
    UPDATE receipts
    SET freigegeben_at = datetime('now'),
        freigegeben_by = ?,
        status = 'freigegeben',
        updated_at = datetime('now')
    WHERE id = ?
  `,
  ).run(actor, id);

  if (req) {
    logAudit(req, 'receipt', id, 'freigeben', undefined, { freigegeben_by: actor });
  }

  return db.prepare(`SELECT * FROM receipts WHERE id = ?`).get(id) as Receipt;
}

/** Default-Export-Bundle für komfortable Verwendung in Routes. */
export const receiptService = {
  create,
  update,
  applyOcrResult,
  markOcrFailed,
  freigeben,
};
