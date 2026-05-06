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
import { findBySha256, findByHeuristic } from '../src/services/duplicateCheckService';

describe('duplicateCheckService', () => {
  beforeEach(() => {
    dbHolder.db = createTestDb();
  });

  it('findBySha256 returns null for unknown hash', () => {
    expect(findBySha256('nonexistent')).toBeNull();
  });

  it('findBySha256 returns null for empty string', () => {
    expect(findBySha256('')).toBeNull();
  });

  it('findBySha256 returns row for existing hash', () => {
    dbHolder.db!.prepare(`
      INSERT INTO receipts (type, source, receipt_date, file_hash_sha256, amount_gross_cents)
      VALUES ('beleg','manual_upload','2026-05-05','abc123', 100)
    `).run();
    const r = findBySha256('abc123');
    expect(r).not.toBeNull();
    expect(r!.file_hash_sha256).toBe('abc123');
    expect(r!.amount_gross_cents).toBe(100);
  });

  it('findByHeuristic matches on supplier + invoice_number + date (case-insensitive supplier)', () => {
    dbHolder.db!.prepare(`
      INSERT INTO receipts (type, source, receipt_date, supplier_name, supplier_invoice_number, amount_gross_cents)
      VALUES ('eingangsrechnung','manual_upload','2026-05-05','Thomann','RE-12345', 49900)
    `).run();
    const matches = findByHeuristic('thomann', 'RE-12345', '2026-05-05');
    expect(matches).toHaveLength(1);
    expect(matches[0].amount_gross_cents).toBe(49900);
    expect(matches[0].supplier_name).toBe('Thomann');
  });

  it('findByHeuristic returns empty when supplier_name differs', () => {
    dbHolder.db!.prepare(`
      INSERT INTO receipts (type, source, receipt_date, supplier_name, supplier_invoice_number, amount_gross_cents)
      VALUES ('eingangsrechnung','manual_upload','2026-05-05','Thomann','RE-12345', 49900)
    `).run();
    expect(findByHeuristic('Bose', 'RE-12345', '2026-05-05')).toEqual([]);
  });

  it('findByHeuristic returns empty when any field is null', () => {
    expect(findByHeuristic(null, 'X', '2026-05-05')).toEqual([]);
    expect(findByHeuristic('Thomann', null, '2026-05-05')).toEqual([]);
    expect(findByHeuristic('Thomann', 'X', null)).toEqual([]);
  });

  it('findByHeuristic returns up to 5 matches', () => {
    for (let i = 0; i < 7; i++) {
      dbHolder.db!.prepare(`
        INSERT INTO receipts (type, source, receipt_date, supplier_name, supplier_invoice_number, amount_gross_cents)
        VALUES ('eingangsrechnung','manual_upload','2026-05-05','Thomann','RE-12345', ?)
      `).run(100 * (i + 1));
    }
    const matches = findByHeuristic('thomann', 'RE-12345', '2026-05-05');
    expect(matches).toHaveLength(5);
  });
});
