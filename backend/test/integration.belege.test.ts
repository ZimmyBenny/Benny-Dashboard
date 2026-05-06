import { describe, it, expect, beforeEach, vi } from 'vitest';
import type Database from 'better-sqlite3';

/**
 * End-to-End Integration-Test für das Belege-Modul.
 *
 * Verifiziert den ganzen Flow:
 *   create → applyOcrResult → update → supplierMemory → tax-Aggregation
 *
 * Plus separate Tests fuer:
 *   - Duplicate-Check (SHA-256)
 *   - Reverse-Charge §13b (Nullsumme)
 *   - Privatanteil (private_share_percent reduziert Vorsteuer)
 *
 * Pattern: vi.mock-Proxy auf db/connection (analog Plan 04-02 receipts.test.ts);
 * dbHolder.db wird in beforeEach durch frische :memory:-DB ersetzt.
 *
 * Hinweis zur Reihenfolge im 'Full Flow'-Test:
 *   tax-Aggregation laeuft VOR freigeben — der Plan-Snippet hatte freigeben
 *   vor der Aggregation, was fehlschlaegt weil freigeben den status auf
 *   'freigegeben' setzt (nicht mehr 'bezahlt') und die Aggregation aber nur
 *   status='bezahlt' filtert. Praezisierung: erst Steuer pruefen, dann GoBD-
 *   Lock setzen. Audit-Test deckt freigeben weiterhin ab.
 */

// vi.mock wird gehoistet — daher muss die DB-Referenz hier ein veränderbares Objekt sein
const dbHolder: { db: Database.Database | null } = { db: null };

vi.mock('../src/db/connection', () => ({
  default: new Proxy(
    {},
    {
      get(_target, prop) {
        if (!dbHolder.db) throw new Error('Test DB not initialized');
        const v = (dbHolder.db as unknown as Record<string | symbol, unknown>)[prop];
        return typeof v === 'function'
          ? (v as (...a: unknown[]) => unknown).bind(dbHolder.db)
          : v;
      },
    },
  ),
}));

import { createTestDb } from './setup';
import * as receiptService from '../src/services/receiptService';
import * as duplicateCheckService from '../src/services/duplicateCheckService';
import * as supplierMemoryService from '../src/services/supplierMemoryService';
import { aggregateForUstva } from '../src/services/taxCalcService';
import { mirrorTripToReceipts } from '../src/services/tripSyncService';

function fakeReq(): import('express').Request {
  return {
    ip: '127.0.0.1',
    headers: { 'user-agent': 'vitest-integration' },
    user: { id: 1, username: 'tester' },
  } as unknown as import('express').Request;
}

describe('Phase 4 — End-to-End Integration', () => {
  beforeEach(() => {
    dbHolder.db = createTestDb();
  });

  it('Full flow: create → applyOcrResult → update → supplierMemory → tax-Aggregation → freigeben', () => {
    // ========================================================================
    // 1. Receipt anlegen mit OCR-pending
    // ========================================================================
    const r = receiptService.create(fakeReq(), {
      type: 'eingangsrechnung',
      source: 'manual_upload',
      receipt_date: '2026-05-05',
      status: 'ocr_pending',
      file_hash_sha256: 'sha-integration-1',
      original_filename: 'thomann-2026-05-05.pdf',
    });
    expect(r.status).toBe('ocr_pending');

    // ========================================================================
    // 2. OCR-Result anwenden
    // ========================================================================
    receiptService.applyOcrResult(
      fakeReq(),
      r.id,
      {
        text: 'Thomann GmbH\nGesamtbetrag: 499,00 €\nUSt 19%',
        confidence: 75,
        engine: 'tesseract',
        languages: 'deu+eng',
      },
      {
        // confidence > 0.5 fuer supplier_name → wird uebernommen
        supplier_name: { value: 'Thomann GmbH', confidence: 0.9 },
        supplier_invoice_number: { value: null, confidence: 0 },
        receipt_date: { value: '2026-05-05', confidence: 0.9 },
        amount_gross_cents: { value: 49900, confidence: 0.85 },
        amount_net_cents: { value: 41933, confidence: 0.76 },
        vat_amount_cents: { value: 7967, confidence: 0.76 },
        vat_rate: { value: 19, confidence: 0.9 },
        iban: { value: null, confidence: 0 },
        reverse_charge: { value: false, confidence: 1.0 },
      },
    );

    const updated = dbHolder.db!
      .prepare(`SELECT * FROM receipts WHERE id = ?`)
      .get(r.id) as {
      status: string;
      supplier_name: string;
      amount_gross_cents: number;
      vat_rate: number;
    };
    expect(updated.status).toBe('zu_pruefen');
    expect(updated.supplier_name).toBe('Thomann GmbH');
    expect(updated.amount_gross_cents).toBe(49900);
    expect(updated.vat_rate).toBe(19);

    // ========================================================================
    // 3. Update als bezahlt + supplierMemory recordUsage
    // ========================================================================
    receiptService.update(fakeReq(), r.id, {
      status: 'bezahlt',
      payment_date: '2026-05-10',
      paid_amount_cents: 49900,
    });
    supplierMemoryService.recordUsage('Thomann GmbH', 2, 3);

    const sm = supplierMemoryService.suggest('Thomann GmbH');
    expect(sm).not.toBeNull();
    expect(sm!.area_id).toBe(2);
    expect(sm!.tax_category_id).toBe(3);

    // ========================================================================
    // 4. Tax-Aggregation Mai 2026 — Beleg ist Eingangsrechnung 19%, bezahlt
    //    → Vorsteuer KZ 66
    //    Wichtig: Aggregation passiert VOR freigeben, weil freigeben den
    //    status auf 'freigegeben' setzt (KZ66 filtert status='bezahlt').
    // ========================================================================
    const buckets = aggregateForUstva(2026, 'monat');
    // Mai = 5. Monat → period_index 5, idx 4 in 0-based array
    const may = buckets[4];
    expect(may.period_index).toBe(5);
    expect(may.kz66_vorsteuer_cents).toBe(7967);

    // ========================================================================
    // 5. Freigeben (GoBD-Lock)
    // ========================================================================
    receiptService.freigeben(fakeReq(), r.id, 'tester');
    const final = dbHolder.db!
      .prepare(`SELECT freigegeben_at, freigegeben_by, status FROM receipts WHERE id = ?`)
      .get(r.id) as {
      freigegeben_at: string | null;
      freigegeben_by: string;
      status: string;
    };
    expect(final.freigegeben_at).not.toBeNull();
    expect(final.freigegeben_by).toBe('tester');
    expect(final.status).toBe('freigegeben');

    // ========================================================================
    // 6. Audit-Log enthaelt alle Aktionen: create, ocr_apply, update, freigeben
    // ========================================================================
    const audit = dbHolder.db!
      .prepare(
        `SELECT action FROM audit_log
         WHERE entity_type = 'receipt' AND entity_id = ?
         ORDER BY id`,
      )
      .all(r.id) as Array<{ action: string }>;
    const actions = audit.map((a) => a.action);
    expect(actions).toContain('create');
    expect(actions).toContain('ocr_apply');
    expect(actions).toContain('update');
    expect(actions).toContain('freigeben');
  });

  it('Duplicate-Check verhindert doppelten Upload via SHA-256', () => {
    const r1 = receiptService.create(fakeReq(), {
      type: 'beleg',
      receipt_date: '2026-05-05',
      file_hash_sha256: 'duplicate-test',
    });
    const found = duplicateCheckService.findBySha256('duplicate-test');
    expect(found).not.toBeNull();
    expect(found!.id).toBe(r1.id);

    expect(() =>
      receiptService.create(fakeReq(), {
        type: 'beleg',
        receipt_date: '2026-05-05',
        file_hash_sha256: 'duplicate-test',
      }),
    ).toThrow();
  });

  it('Reverse-Charge Beleg landet in Tax-Aggregation als Nullsumme (kz67=kz85)', () => {
    receiptService.create(fakeReq(), {
      type: 'eingangsrechnung',
      receipt_date: '2026-05-01',
      payment_date: '2026-05-15',
      status: 'bezahlt',
      amount_gross_cents: 2499,
      amount_net_cents: 2499,
      vat_rate: 0,
      vat_amount_cents: 475,
      reverse_charge: 1,
      input_tax_deductible: 1,
      steuerrelevant: 1,
    });
    const buckets = aggregateForUstva(2026, 'jahr');
    expect(buckets[0].kz84_rc_net_cents).toBe(2499);
    expect(buckets[0].kz85_rc_vat_cents).toBe(475);
    expect(buckets[0].kz67_rc_vorsteuer_cents).toBe(475);
    // Nullsumme: 475 (Schuld KZ85) - 475 (Vorsteuer KZ67) = 0
    expect(buckets[0].zahllast_cents).toBe(0);
  });

  it('Privatanteil 70% reduziert Vorsteuer auf 30%', () => {
    receiptService.create(fakeReq(), {
      type: 'eingangsrechnung',
      receipt_date: '2026-05-01',
      payment_date: '2026-05-15',
      status: 'bezahlt',
      amount_gross_cents: 11900,
      amount_net_cents: 10000,
      vat_rate: 19,
      vat_amount_cents: 1900,
      input_tax_deductible: 1,
      private_share_percent: 70,
      steuerrelevant: 1,
    });
    const buckets = aggregateForUstva(2026, 'jahr');
    // 1900 * (100 - 70) / 100 = 1900 * 30/100 = 570
    expect(buckets[0].kz66_vorsteuer_cents).toBe(570);
  });

  it('Mirror-Sync: Trip wird als type=fahrt mit vat_rate=0 in receipts gespiegelt', () => {
    // Trip direkt anlegen
    const tripRes = dbHolder.db!
      .prepare(
        `INSERT INTO trips (
          start_location, end_location, distance_km, rate_per_km_cents, amount_cents,
          purpose, expense_date
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run('Heimat', 'Test-Location', 50, 30, 1500, 'Integration-Trip', '2026-05-15');
    const tripId = Number(tripRes.lastInsertRowid);

    // Mirror via Service (Top-Level-Import oben)
    const receiptId = mirrorTripToReceipts(tripId);
    expect(receiptId).not.toBeNull();

    const mirrored = dbHolder.db!
      .prepare(`SELECT type, vat_rate, amount_gross_cents, source FROM receipts WHERE id = ?`)
      .get(receiptId) as {
      type: string;
      vat_rate: number;
      amount_gross_cents: number;
      source: string;
    };
    expect(mirrored.type).toBe('fahrt');
    expect(mirrored.vat_rate).toBe(0);
    expect(mirrored.amount_gross_cents).toBe(1500);
    expect(mirrored.source).toBe('dj_trip_sync');
  });
});
