import { describe, it, expect, beforeEach, vi } from 'vitest';
import type Database from 'better-sqlite3';

// vi.mock-Proxy-Pattern (vgl. test/receipts.test.ts) — beforeEach swap :memory:-DB
const dbHolder: { db: Database.Database | null } = { db: null };

vi.mock('../src/db/connection', () => ({
  default: new Proxy(
    {},
    {
      get(_target, prop) {
        if (!dbHolder.db) throw new Error('Test DB not initialized');
        const v = (dbHolder.db as unknown as Record<string | symbol, unknown>)[prop];
        return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(dbHolder.db) : v;
      },
    },
  ),
}));

import { createTestDb } from './setup';
import { mirrorInvoiceToReceipts } from '../src/services/djSyncService';

function insertContact(name: string): number {
  const r = dbHolder.db!.prepare(`
    INSERT INTO contacts (display_name, first_name, last_name, organization_name, kind)
    VALUES (?, ?, ?, ?, 'company')
  `).run(name, '', '', name);
  return Number(r.lastInsertRowid);
}

function insertInvoice(p: Partial<{
  customer_id: number;
  status: string;
  invoice_date: string;
  due_date: string | null;
  subtotal_net: number;
  tax_total: number;
  total_gross: number;
  pdf_hash: string | null;
  finalized_at: string | null;
  cancels_invoice_id: number | null;
  is_cancellation: number;
  number: string | null;
}>): number {
  const r = dbHolder.db!.prepare(`
    INSERT INTO dj_invoices (customer_id, number, status, invoice_date, due_date,
      subtotal_net, tax_total, total_gross, pdf_hash, finalized_at,
      cancels_invoice_id, is_cancellation)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    p.customer_id ?? 1,
    p.number ?? null,
    p.status ?? 'entwurf',
    p.invoice_date ?? '2026-05-05',
    p.due_date ?? null,
    p.subtotal_net ?? 100,
    p.tax_total ?? 19,
    p.total_gross ?? 119,
    p.pdf_hash ?? null,
    p.finalized_at ?? null,
    p.cancels_invoice_id ?? null,
    p.is_cancellation ?? 0,
  );
  return Number(r.lastInsertRowid);
}

describe('djSyncService.mirrorInvoiceToReceipts', () => {
  beforeEach(() => {
    dbHolder.db = createTestDb();
  });

  it('creates a receipt with cents conversion (REAL → INTEGER)', () => {
    const cid = insertContact('Test GmbH');
    const iid = insertInvoice({
      customer_id: cid,
      total_gross: 1234.56,
      subtotal_net: 1037.45,
      tax_total: 197.11,
      status: 'offen',
      number: 'RE-1001',
    });
    const rid = mirrorInvoiceToReceipts(iid);
    expect(rid).not.toBeNull();
    const r = dbHolder.db!.prepare(`SELECT * FROM receipts WHERE id = ?`).get(rid!) as {
      amount_gross_cents: number;
      amount_net_cents: number;
      vat_amount_cents: number;
      type: string;
      source: string;
      receipt_number: string;
      supplier_name: string;
      linked_invoice_id: number;
    };
    expect(r.type).toBe('ausgangsrechnung');
    expect(r.source).toBe('dj_invoice_sync');
    expect(r.amount_gross_cents).toBe(123456);
    expect(r.amount_net_cents).toBe(103745);
    expect(r.vat_amount_cents).toBe(19711);
    expect(r.receipt_number).toBe('RE-1001');
    expect(r.supplier_name).toBe('Test GmbH');
    expect(r.linked_invoice_id).toBe(iid);
  });

  it('is idempotent — second call updates same row', () => {
    const cid = insertContact('Test GmbH');
    const iid = insertInvoice({ customer_id: cid, total_gross: 100, status: 'entwurf' });
    const rid1 = mirrorInvoiceToReceipts(iid);
    const rid2 = mirrorInvoiceToReceipts(iid);
    expect(rid1).toBe(rid2);
    const count = dbHolder.db!.prepare(`SELECT COUNT(*) AS c FROM receipts`).get() as { c: number };
    expect(count.c).toBe(1);
  });

  it('finalized_at sets receipts.freigegeben_at', () => {
    const cid = insertContact('Test GmbH');
    const iid = insertInvoice({
      customer_id: cid,
      finalized_at: '2026-05-05 10:00:00',
      status: 'offen',
    });
    const rid = mirrorInvoiceToReceipts(iid);
    const r = dbHolder.db!.prepare(`SELECT freigegeben_at FROM receipts WHERE id = ?`).get(rid!) as {
      freigegeben_at: string;
    };
    expect(r.freigegeben_at).toBe('2026-05-05 10:00:00');
  });

  it('cancellation creates separate mirror with negative amount + corrects_receipt_id', () => {
    const cid = insertContact('Test GmbH');
    const origIid = insertInvoice({
      customer_id: cid,
      total_gross: 119,
      subtotal_net: 100,
      tax_total: 19,
      finalized_at: '2026-05-01 10:00:00',
      status: 'storniert',
      number: 'RE-1002',
    });
    const origRid = mirrorInvoiceToReceipts(origIid);

    const cancelIid = insertInvoice({
      customer_id: cid,
      total_gross: 119,
      subtotal_net: 100,
      tax_total: 19,
      is_cancellation: 1,
      cancels_invoice_id: origIid,
      finalized_at: '2026-05-02 10:00:00',
      status: 'offen',
      number: 'SR-0001',
    });
    const cancelRid = mirrorInvoiceToReceipts(cancelIid);

    expect(cancelRid).not.toBe(origRid);
    const cancelR = dbHolder.db!
      .prepare(`SELECT * FROM receipts WHERE id = ?`)
      .get(cancelRid!) as {
      amount_gross_cents: number;
      amount_net_cents: number;
      vat_amount_cents: number;
      corrects_receipt_id: number;
    };
    expect(cancelR.amount_gross_cents).toBe(-11900);
    expect(cancelR.amount_net_cents).toBe(-10000);
    expect(cancelR.vat_amount_cents).toBe(-1900);
    expect(cancelR.corrects_receipt_id).toBe(origRid);

    const origR = dbHolder.db!
      .prepare(`SELECT corrected_by_receipt_id FROM receipts WHERE id = ?`)
      .get(origRid!) as { corrected_by_receipt_id: number };
    expect(origR.corrected_by_receipt_id).toBe(cancelRid);
  });

  it('creates DJ area link', () => {
    const cid = insertContact('Test GmbH');
    const iid = insertInvoice({ customer_id: cid });
    const rid = mirrorInvoiceToReceipts(iid);
    const link = dbHolder.db!
      .prepare(
        `
        SELECT a.slug FROM receipt_area_links ral
        INNER JOIN areas a ON a.id = ral.area_id
        WHERE ral.receipt_id = ?
      `,
      )
      .get(rid!) as { slug: string } | undefined;
    expect(link?.slug).toBe('dj');
  });

  it('status transitions: bezahlt → bezahlt; entwurf → zu_pruefen', () => {
    const cid = insertContact('Test GmbH');
    const i1 = insertInvoice({ customer_id: cid, status: 'bezahlt' });
    const r1 = mirrorInvoiceToReceipts(i1);
    const r1row = dbHolder.db!.prepare(`SELECT status FROM receipts WHERE id=?`).get(r1!) as {
      status: string;
    };
    expect(r1row.status).toBe('bezahlt');

    const i2 = insertInvoice({ customer_id: cid, status: 'entwurf' });
    const r2 = mirrorInvoiceToReceipts(i2);
    const r2row = dbHolder.db!.prepare(`SELECT status FROM receipts WHERE id=?`).get(r2!) as {
      status: string;
    };
    expect(r2row.status).toBe('zu_pruefen');
  });

  it('payment_date wird aus dj_payments übernommen wenn Status bezahlt', () => {
    const cid = insertContact('Test GmbH');
    const iid = insertInvoice({ customer_id: cid, status: 'bezahlt', total_gross: 119 });
    dbHolder.db!
      .prepare(
        `INSERT INTO dj_payments (invoice_id, payment_date, amount, method) VALUES (?, ?, ?, 'ueberweisung')`,
      )
      .run(iid, '2026-05-04', 119);
    const rid = mirrorInvoiceToReceipts(iid);
    const r = dbHolder.db!.prepare(`SELECT payment_date FROM receipts WHERE id = ?`).get(rid!) as {
      payment_date: string;
    };
    expect(r.payment_date).toBe('2026-05-04');
  });

  it('idempotenter UPDATE auf nicht-freigegebener Rechnung ändert finanz-Felder', () => {
    const cid = insertContact('Test GmbH');
    const iid = insertInvoice({ customer_id: cid, total_gross: 100, status: 'entwurf' });
    const rid1 = mirrorInvoiceToReceipts(iid);

    // Status & Brutto ändern (entwurf → offen, 100 → 200)
    dbHolder.db!
      .prepare(`UPDATE dj_invoices SET status = 'offen', total_gross = 200 WHERE id = ?`)
      .run(iid);
    const rid2 = mirrorInvoiceToReceipts(iid);
    expect(rid2).toBe(rid1);
    const r = dbHolder.db!.prepare(`SELECT amount_gross_cents, status FROM receipts WHERE id = ?`).get(rid1!) as {
      amount_gross_cents: number;
      status: string;
    };
    expect(r.amount_gross_cents).toBe(20000);
    expect(r.status).toBe('offen');
  });

  it('returns null when invoice does not exist', () => {
    expect(mirrorInvoiceToReceipts(99999)).toBeNull();
  });
});
