import { describe, it, expect, beforeEach, vi } from 'vitest';
import type Database from 'better-sqlite3';

// vi.mock-Proxy-Pattern — erlaubt swapping der :memory:-DB pro Test
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
import {
  suggest,
  recordUsage,
  normalize,
} from '../src/services/supplierMemoryService';

describe('supplierMemoryService', () => {
  beforeEach(() => {
    dbHolder.db = createTestDb();
  });

  it('normalize sanitizes input (Umlaute, lowercase, slug)', () => {
    expect(normalize('Thomann GmbH')).toBe('thomann-gmbh');
    expect(normalize('Müller & Söhne')).toBe('mueller-soehne');
    expect(normalize('  E.ON  ')).toBe('e-on');
  });

  it('suggest returns null when no memory exists', () => {
    expect(suggest('Thomann')).toBeNull();
  });

  it('recordUsage inserts a new row with usage_count=1', () => {
    recordUsage('Thomann', 2, 3);
    const r = suggest('Thomann');
    expect(r).not.toBeNull();
    expect(r!.supplier_normalized).toBe('thomann');
    expect(r!.area_id).toBe(2);
    expect(r!.tax_category_id).toBe(3);
    expect(r!.usage_count).toBe(1);
  });

  it('recordUsage 2x with identical values increments usage_count to 2', () => {
    recordUsage('Thomann', 2, 3);
    recordUsage('thomann', 2, 3); // case-insensitive via normalize
    const r = suggest('Thomann');
    expect(r).not.toBeNull();
    expect(r!.usage_count).toBe(2);
  });

  it('suggest finds memory case-insensitively via normalize', () => {
    recordUsage('Thomann GmbH', 2, 3);
    const r = suggest('thomann gmbh');
    expect(r).not.toBeNull();
    expect(r!.area_id).toBe(2);
    expect(r!.tax_category_id).toBe(3);
  });

  it('higher usage_count wins when multiple tripels exist for same supplier', () => {
    recordUsage('E.ON', 3, 13);
    recordUsage('E.ON', 3, 13);
    recordUsage('E.ON', 3, 13);
    recordUsage('E.ON', 2, 13); // weniger oft → soll NICHT gewinnen
    const r = suggest('E.ON');
    expect(r).not.toBeNull();
    expect(r!.area_id).toBe(3);
    expect(r!.usage_count).toBe(3);
  });

  it('null area + null tax_category is valid memory (Lieferant ohne Zuordnung)', () => {
    recordUsage('Unknown Co', null, null);
    const r = suggest('Unknown Co');
    expect(r).not.toBeNull();
    expect(r!.area_id).toBeNull();
    expect(r!.tax_category_id).toBeNull();
    expect(r!.usage_count).toBe(1);
  });

  it('normalize on empty/whitespace returns empty string and recordUsage skips silently', () => {
    expect(normalize('')).toBe('');
    expect(normalize('   ')).toBe('');
    recordUsage('', 1, 1);
    recordUsage('   ', 1, 1);
    // suggest('') ist ebenfalls null (kein normalized Wert)
    expect(suggest('')).toBeNull();
    // Tabelle ist leer
    const cnt = (dbHolder.db!
      .prepare(`SELECT COUNT(*) AS n FROM supplier_memory`)
      .get() as { n: number }).n;
    expect(cnt).toBe(0);
  });

  it('last_used wird beim recordUsage-Update aktualisiert (heutiges Datum)', () => {
    recordUsage('Thomann', 2, 3);
    // last_used auf 'gestern' patchen, damit ein UPDATE-Effekt sichtbar wird
    dbHolder.db!
      .prepare(
        `UPDATE supplier_memory SET last_used = datetime('now', '-1 day')
           WHERE supplier_normalized = 'thomann'`,
      )
      .run();
    recordUsage('Thomann', 2, 3);
    const second = suggest('Thomann')!;
    expect(second.usage_count).toBe(2);
    const today = new Date().toISOString().slice(0, 10);
    expect(second.last_used.startsWith(today)).toBe(true);
  });
});
