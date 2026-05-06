import { describe, it, expect, beforeEach, vi } from 'vitest';
import type Database from 'better-sqlite3';

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
import { aggregateForUstva } from '../src/services/taxCalcService';

describe('taxCalcService.aggregateForUstva', () => {
  beforeEach(() => {
    dbHolder.db = createTestDb();
  });

  it('returns 12 buckets for "monat", 4 for "quartal", 1 for "jahr"', () => {
    expect(aggregateForUstva(2026, 'monat')).toHaveLength(12);
    expect(aggregateForUstva(2026, 'quartal')).toHaveLength(4);
    expect(aggregateForUstva(2026, 'jahr')).toHaveLength(1);
  });

  it('outgoing invoice 19% bezahlt im Mai 2026 erscheint in Q2 Bucket', () => {
    dbHolder.db!.prepare(`
      INSERT INTO receipts (type, source, receipt_date, payment_date, status,
        amount_net_cents, amount_gross_cents, vat_rate, vat_amount_cents, steuerrelevant)
      VALUES ('ausgangsrechnung','manual_upload','2026-05-01','2026-05-15','bezahlt',
        100000, 119000, 19, 19000, 1)
    `).run();

    const buckets = aggregateForUstva(2026, 'quartal');
    expect(buckets[1].kz81_umsatz_19_net_cents).toBe(100000);
    expect(buckets[1].kz81_vat_cents).toBe(19000);
    // Q1 leer
    expect(buckets[0].kz81_umsatz_19_net_cents).toBe(0);
    // Q3/Q4 leer
    expect(buckets[2].kz81_umsatz_19_net_cents).toBe(0);
    expect(buckets[3].kz81_umsatz_19_net_cents).toBe(0);
  });

  it('outgoing invoice 7% bezahlt → KZ 86 net', () => {
    dbHolder.db!.prepare(`
      INSERT INTO receipts (type, source, receipt_date, payment_date, status,
        amount_net_cents, amount_gross_cents, vat_rate, vat_amount_cents, steuerrelevant)
      VALUES ('ausgangsrechnung','manual_upload','2026-03-01','2026-03-10','bezahlt',
        50000, 53500, 7, 3500, 1)
    `).run();
    const buckets = aggregateForUstva(2026, 'jahr');
    expect(buckets[0].kz86_umsatz_7_net_cents).toBe(50000);
    expect(buckets[0].kz86_vat_cents).toBe(3500);
  });

  it('reverse_charge bezahlt → KZ 84/85/67 gefüllt, Zahllast 0 wenn input_tax_deductible=1', () => {
    dbHolder.db!.prepare(`
      INSERT INTO receipts (type, source, receipt_date, payment_date, status,
        amount_net_cents, amount_gross_cents, vat_rate, vat_amount_cents,
        reverse_charge, input_tax_deductible, steuerrelevant)
      VALUES ('eingangsrechnung','manual_upload','2026-05-01','2026-05-15','bezahlt',
        2499, 2499, 0, 475, 1, 1, 1)
    `).run();

    const buckets = aggregateForUstva(2026, 'jahr');
    expect(buckets[0].kz84_rc_net_cents).toBe(2499);
    expect(buckets[0].kz85_rc_vat_cents).toBe(475);
    expect(buckets[0].kz67_rc_vorsteuer_cents).toBe(475);
    expect(buckets[0].zahllast_cents).toBe(0);
  });

  it('private_share_percent=70 → 30% der Vorsteuer wird abgezogen', () => {
    dbHolder.db!.prepare(`
      INSERT INTO receipts (type, source, receipt_date, payment_date, status,
        amount_net_cents, amount_gross_cents, vat_rate, vat_amount_cents,
        input_tax_deductible, private_share_percent, steuerrelevant)
      VALUES ('eingangsrechnung','manual_upload','2026-05-01','2026-05-15','bezahlt',
        10000, 11900, 19, 1900, 1, 70, 1)
    `).run();
    const buckets = aggregateForUstva(2026, 'jahr');
    // 1900 * 30 / 100 = 570
    expect(buckets[0].kz66_vorsteuer_cents).toBe(570);
  });

  it('steuerrelevant=0 wird komplett ignoriert', () => {
    dbHolder.db!.prepare(`
      INSERT INTO receipts (type, source, receipt_date, payment_date, status,
        amount_net_cents, amount_gross_cents, vat_rate, vat_amount_cents, steuerrelevant)
      VALUES ('ausgangsrechnung','manual_upload','2026-05-01','2026-05-15','bezahlt',
        100000, 119000, 19, 19000, 0)
    `).run();
    const buckets = aggregateForUstva(2026, 'jahr');
    expect(buckets[0].kz81_umsatz_19_net_cents).toBe(0);
  });

  it('nicht-bezahlt wird ignoriert (Ist-Versteuerung über payment_date)', () => {
    dbHolder.db!.prepare(`
      INSERT INTO receipts (type, source, receipt_date, payment_date, status,
        amount_net_cents, amount_gross_cents, vat_rate, vat_amount_cents, steuerrelevant)
      VALUES ('ausgangsrechnung','manual_upload','2026-05-01', NULL, 'offen',
        100000, 119000, 19, 19000, 1)
    `).run();
    const buckets = aggregateForUstva(2026, 'jahr');
    expect(buckets[0].kz81_umsatz_19_net_cents).toBe(0);
  });

  it('EUSt (import_eust=1) erscheint in KZ 62 und reduziert Zahllast', () => {
    dbHolder.db!.prepare(`
      INSERT INTO receipts (type, source, receipt_date, payment_date, status,
        amount_net_cents, amount_gross_cents, vat_rate, vat_amount_cents,
        import_eust, input_tax_deductible, steuerrelevant)
      VALUES ('beleg','manual_upload','2026-04-01','2026-04-05','bezahlt',
        15000, 15000, 0, 0, 1, 1, 1)
    `).run();
    const buckets = aggregateForUstva(2026, 'jahr');
    expect(buckets[0].kz62_eust_cents).toBe(15000);
    // Zahllast = 0 - 15000 = -15000 (Vorsteuerguthaben)
    expect(buckets[0].zahllast_cents).toBe(-15000);
  });

  it('Zahllast korrekt: 19000 (KZ81-VAT) - 1900 (KZ66) = 17100', () => {
    dbHolder.db!.prepare(`
      INSERT INTO receipts (type, source, receipt_date, payment_date, status,
        amount_net_cents, amount_gross_cents, vat_rate, vat_amount_cents, steuerrelevant)
      VALUES ('ausgangsrechnung','manual_upload','2026-05-01','2026-05-15','bezahlt',
        100000, 119000, 19, 19000, 1)
    `).run();
    dbHolder.db!.prepare(`
      INSERT INTO receipts (type, source, receipt_date, payment_date, status,
        amount_net_cents, amount_gross_cents, vat_rate, vat_amount_cents,
        input_tax_deductible, steuerrelevant)
      VALUES ('eingangsrechnung','manual_upload','2026-05-10','2026-05-20','bezahlt',
        10000, 11900, 19, 1900, 1, 1)
    `).run();
    const buckets = aggregateForUstva(2026, 'jahr');
    expect(buckets[0].zahllast_cents).toBe(17100);
  });

  it('Monat-Buckets: payment_date 2026-05-15 nur in Index 4 (Mai)', () => {
    dbHolder.db!.prepare(`
      INSERT INTO receipts (type, source, receipt_date, payment_date, status,
        amount_net_cents, amount_gross_cents, vat_rate, vat_amount_cents, steuerrelevant)
      VALUES ('ausgangsrechnung','manual_upload','2026-05-01','2026-05-15','bezahlt',
        100000, 119000, 19, 19000, 1)
    `).run();
    const buckets = aggregateForUstva(2026, 'monat');
    // Mai = Index 4 (Jan=0, Feb=1, Mär=2, Apr=3, Mai=4)
    expect(buckets[4].kz81_umsatz_19_net_cents).toBe(100000);
    // alle anderen leer
    for (let i = 0; i < 12; i++) {
      if (i === 4) continue;
      expect(buckets[i].kz81_umsatz_19_net_cents).toBe(0);
    }
  });

  it('Bucket-Labels für Quartal/Monat/Jahr korrekt', () => {
    expect(aggregateForUstva(2026, 'jahr')[0].label).toBe('2026');
    expect(aggregateForUstva(2026, 'quartal')[0].label).toBe('2026 Q1');
    expect(aggregateForUstva(2026, 'quartal')[3].label).toBe('2026 Q4');
    expect(aggregateForUstva(2026, 'monat')[0].label).toBe('Jan 2026');
    expect(aggregateForUstva(2026, 'monat')[4].label).toBe('Mai 2026');
  });
});
