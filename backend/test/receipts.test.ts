import { describe, it, expect, beforeEach, vi } from 'vitest';
import type Database from 'better-sqlite3';

// vi.mock wird gehoistet — daher muss die DB-Referenz hier ein veränderbares Objekt sein
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
import * as receiptService from '../src/services/receiptService';
import { DuplicateReceiptError } from '../src/services/receiptService';
import { expectAuditEntry } from './helpers';

function fakeReq(): import('express').Request {
  return {
    ip: '127.0.0.1',
    headers: { 'user-agent': 'vitest' },
    user: { id: 1, username: 'tester' },
  } as unknown as import('express').Request;
}

describe('receiptService', () => {
  beforeEach(() => {
    dbHolder.db = createTestDb();
  });

  it('create inserts a row, recomputes net/vat from gross+rate, writes audit_log', () => {
    const r = receiptService.create(fakeReq(), {
      type: 'eingangsrechnung',
      receipt_date: '2026-05-05',
      amount_gross_cents: 11900,
      vat_rate: 19,
      supplier_name: 'Test GmbH',
    });
    expect(r.id).toBeGreaterThan(0);
    expect(r.amount_net_cents).toBe(10000);
    expect(r.vat_amount_cents).toBe(1900);
    const audit = expectAuditEntry(dbHolder.db!, 'receipt', r.id, 'create');
    expect(audit).toBeDefined();
    expect(audit.actor).toBe('tester');
  });

  it('create with same SHA-256 throws DuplicateReceiptError', () => {
    receiptService.create(fakeReq(), {
      type: 'beleg',
      receipt_date: '2026-05-05',
      amount_gross_cents: 100,
      file_hash_sha256: 'abc123',
    });
    expect(() =>
      receiptService.create(fakeReq(), {
        type: 'beleg',
        receipt_date: '2026-05-05',
        amount_gross_cents: 200,
        file_hash_sha256: 'abc123',
      }),
    ).toThrow(DuplicateReceiptError);
  });

  it('update changes notes and writes audit_log update entry', () => {
    const r = receiptService.create(fakeReq(), { type: 'beleg', receipt_date: '2026-05-05' });
    receiptService.update(fakeReq(), r.id, { notes: 'edited' });
    const updated = dbHolder.db!.prepare(`SELECT notes FROM receipts WHERE id=?`).get(r.id) as {
      notes: string;
    };
    expect(updated.notes).toBe('edited');
    const audit = expectAuditEntry(dbHolder.db!, 'receipt', r.id, 'update');
    expect(audit).toBeDefined();
  });

  it('freigeben sets freigegeben_at + status; subsequent finance update is blocked by GoBD-Trigger', () => {
    const r = receiptService.create(fakeReq(), {
      type: 'eingangsrechnung',
      receipt_date: '2026-05-05',
      amount_gross_cents: 11900,
      vat_rate: 19,
    });
    const released = receiptService.freigeben(fakeReq(), r.id, 'benny');
    expect(released.freigegeben_at).not.toBeNull();
    expect(released.status).toBe('freigegeben');
    expect(released.freigegeben_by).toBe('benny');

    // GoBD-Trigger blockt finance-Felder nach Freigabe
    expect(() =>
      receiptService.update(fakeReq(), r.id, { amount_gross_cents: 99999 }),
    ).toThrow(/GoBD/);

    // notes bleiben editierbar nach Freigabe (DB-Trigger erlaubt)
    expect(() => receiptService.update(fakeReq(), r.id, { notes: 'after freigabe' })).not.toThrow();

    // Audit-Eintrag freigeben existiert
    const audit = expectAuditEntry(dbHolder.db!, 'receipt', r.id, 'freigeben');
    expect(audit).toBeDefined();
  });

  it('freigeben on already-released receipt is idempotent (no second timestamp)', () => {
    const r = receiptService.create(fakeReq(), {
      type: 'eingangsrechnung',
      receipt_date: '2026-05-05',
      amount_gross_cents: 11900,
    });
    const first = receiptService.freigeben(fakeReq(), r.id, 'benny');
    const second = receiptService.freigeben(fakeReq(), r.id, 'benny');
    expect(second.freigegeben_at).toBe(first.freigegeben_at);
  });

  it('markOcrFailed transitions ocr_pending → zu_pruefen', () => {
    const r = receiptService.create(fakeReq(), {
      type: 'beleg',
      receipt_date: '2026-05-05',
      status: 'ocr_pending',
    });
    receiptService.markOcrFailed(fakeReq(), r.id);
    const after = dbHolder.db!.prepare(`SELECT status FROM receipts WHERE id=?`).get(r.id) as {
      status: string;
    };
    expect(after.status).toBe('zu_pruefen');
  });

  it('applyOcrResult writes parsed fields, sets status zu_pruefen, persists OCR row, audits ocr_apply', () => {
    const r = receiptService.create(fakeReq(), {
      type: 'eingangsrechnung',
      receipt_date: '2026-05-05',
      status: 'ocr_pending',
    });
    receiptService.applyOcrResult(
      fakeReq(),
      r.id,
      {
        text: 'Rechnung von Thomann Nr. RE-12345 ueber 119,00 EUR',
        confidence: 0.92,
        engine: 'mock',
        languages: 'deu+eng',
      },
      {
        supplier_name: { value: 'Thomann', confidence: 0.95 },
        supplier_invoice_number: { value: 'RE-12345', confidence: 0.9 },
        receipt_date: { value: '2026-05-04', confidence: 0.88 },
        amount_gross_cents: { value: 11900, confidence: 0.9 },
        amount_net_cents: { value: 10000, confidence: 0.9 },
        vat_amount_cents: { value: 1900, confidence: 0.9 },
        vat_rate: { value: 19, confidence: 0.9 },
        iban: { value: null, confidence: 0 },
        reverse_charge: { value: false, confidence: 0.95 },
      },
    );
    const after = dbHolder.db!
      .prepare(
        `SELECT status, supplier_name, supplier_invoice_number, amount_gross_cents FROM receipts WHERE id=?`,
      )
      .get(r.id) as {
      status: string;
      supplier_name: string;
      supplier_invoice_number: string;
      amount_gross_cents: number;
    };
    expect(after.status).toBe('zu_pruefen');
    expect(after.supplier_name).toBe('Thomann');
    expect(after.supplier_invoice_number).toBe('RE-12345');
    expect(after.amount_gross_cents).toBe(11900);

    const ocr = dbHolder.db!
      .prepare(`SELECT engine, overall_confidence FROM receipt_ocr_results WHERE receipt_id=?`)
      .get(r.id) as { engine: string; overall_confidence: number } | undefined;
    expect(ocr).toBeDefined();
    expect(ocr!.engine).toBe('mock');

    const audit = expectAuditEntry(dbHolder.db!, 'receipt', r.id, 'ocr_apply');
    expect(audit).toBeDefined();
  });

  it('applyOcrResult ignores low-confidence supplier_name (< 0.5)', () => {
    const r = receiptService.create(fakeReq(), {
      type: 'beleg',
      receipt_date: '2026-05-05',
      supplier_name: 'Original Supplier',
    });
    receiptService.applyOcrResult(
      fakeReq(),
      r.id,
      { text: 'noise', confidence: 0.3, engine: 'mock', languages: 'deu' },
      {
        supplier_name: { value: 'WRONG', confidence: 0.2 },
        supplier_invoice_number: { value: null, confidence: 0 },
        receipt_date: { value: null, confidence: 0 },
        amount_gross_cents: { value: null, confidence: 0 },
        amount_net_cents: { value: null, confidence: 0 },
        vat_amount_cents: { value: null, confidence: 0 },
        vat_rate: { value: null, confidence: 0 },
        iban: { value: null, confidence: 0 },
        reverse_charge: { value: null, confidence: 0 },
      },
    );
    const after = dbHolder.db!
      .prepare(`SELECT supplier_name FROM receipts WHERE id=?`)
      .get(r.id) as { supplier_name: string };
    expect(after.supplier_name).toBe('Original Supplier');
  });
});
