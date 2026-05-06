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
import { mirrorTripToReceipts } from '../src/services/tripSyncService';

describe('tripSyncService.mirrorTripToReceipts', () => {
  beforeEach(() => {
    dbHolder.db = createTestDb();
  });

  it('mirrors trip into receipts with type=fahrt and vat_rate=0', () => {
    const r = dbHolder.db!
      .prepare(
        `INSERT INTO trips
           (start_location, end_location, distance_km, rate_per_km_cents,
            amount_cents, expense_date, purpose)
         VALUES ('Berlin', 'Hamburg', 290, 30, 8700, '2026-05-05', 'Hochzeit Mueller')`,
      )
      .run();
    const tripId = Number(r.lastInsertRowid);
    const rid = mirrorTripToReceipts(tripId);
    expect(rid).not.toBeNull();
    const receipt = dbHolder.db!
      .prepare(`SELECT * FROM receipts WHERE id = ?`)
      .get(rid!) as {
      type: string;
      source: string;
      vat_rate: number;
      amount_gross_cents: number;
      tax_category: string;
      input_tax_deductible: number;
      linked_trip_id: number;
      supplier_name: string;
      title: string;
    };
    expect(receipt.type).toBe('fahrt');
    expect(receipt.source).toBe('dj_trip_sync');
    expect(receipt.vat_rate).toBe(0);
    expect(receipt.amount_gross_cents).toBe(8700);
    expect(receipt.tax_category).toBe('Fahrtkosten');
    expect(receipt.input_tax_deductible).toBe(0);
    expect(receipt.linked_trip_id).toBe(tripId);
    expect(receipt.supplier_name).toBe('Fahrt: Berlin → Hamburg');
    expect(receipt.title).toBe('290 km');
  });

  it('is idempotent', () => {
    const r = dbHolder.db!
      .prepare(
        `INSERT INTO trips (distance_km, rate_per_km_cents, amount_cents, expense_date, purpose)
         VALUES (50, 30, 1500, '2026-05-05', 'Test')`,
      )
      .run();
    const tid = Number(r.lastInsertRowid);
    const r1 = mirrorTripToReceipts(tid);
    const r2 = mirrorTripToReceipts(tid);
    expect(r1).toBe(r2);
    const c = dbHolder.db!
      .prepare(`SELECT COUNT(*) as c FROM receipts WHERE linked_trip_id = ?`)
      .get(tid) as { c: number };
    expect(c.c).toBe(1);
  });

  it('creates DJ area link', () => {
    const r = dbHolder.db!
      .prepare(
        `INSERT INTO trips (distance_km, rate_per_km_cents, amount_cents, expense_date)
         VALUES (10, 30, 300, '2026-05-05')`,
      )
      .run();
    const tid = Number(r.lastInsertRowid);
    const rid = mirrorTripToReceipts(tid);
    const link = dbHolder.db!
      .prepare(
        `SELECT a.slug FROM receipt_area_links ral
         INNER JOIN areas a ON a.id = ral.area_id
         WHERE ral.receipt_id = ?`,
      )
      .get(rid!) as { slug: string } | undefined;
    expect(link?.slug).toBe('dj');
  });

  it('uses purpose as supplier when start/end fehlen', () => {
    const r = dbHolder.db!
      .prepare(
        `INSERT INTO trips (distance_km, rate_per_km_cents, amount_cents, expense_date, purpose)
         VALUES (10, 30, 300, '2026-05-05', 'Vorgespraech Schulz')`,
      )
      .run();
    const tid = Number(r.lastInsertRowid);
    const rid = mirrorTripToReceipts(tid);
    const receipt = dbHolder.db!
      .prepare(`SELECT supplier_name FROM receipts WHERE id = ?`)
      .get(rid!) as { supplier_name: string };
    expect(receipt.supplier_name).toBe('Vorgespraech Schulz');
  });

  it('returns null when trip does not exist', () => {
    expect(mirrorTripToReceipts(99999)).toBeNull();
  });

  it('UPDATE auf Mirror reflektiert Aenderung der Trip-Daten', () => {
    const r = dbHolder.db!
      .prepare(
        `INSERT INTO trips (distance_km, rate_per_km_cents, amount_cents, expense_date, purpose)
         VALUES (50, 30, 1500, '2026-05-05', 'Original')`,
      )
      .run();
    const tid = Number(r.lastInsertRowid);
    const rid = mirrorTripToReceipts(tid);

    // Trip aktualisieren: Distanz auf 100, amount auf 3000
    dbHolder.db!
      .prepare(
        `UPDATE trips SET distance_km = 100, amount_cents = 3000, purpose = 'Geaendert' WHERE id = ?`,
      )
      .run(tid);
    const rid2 = mirrorTripToReceipts(tid);
    expect(rid2).toBe(rid);
    const receipt = dbHolder.db!
      .prepare(`SELECT amount_gross_cents, supplier_name FROM receipts WHERE id = ?`)
      .get(rid!) as { amount_gross_cents: number; supplier_name: string };
    expect(receipt.amount_gross_cents).toBe(3000);
    expect(receipt.supplier_name).toBe('Geaendert');
  });
});
