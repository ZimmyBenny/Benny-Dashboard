import { describe, it, expect, beforeEach, vi } from 'vitest';
import type Database from 'better-sqlite3';

const dbHolder: { db: Database.Database | null } = { db: null };

vi.mock('../src/db/connection', () => ({
  default: new Proxy({}, {
    get(_t, p) {
      if (!dbHolder.db) throw new Error('Test DB not initialized');
      const v = (dbHolder.db as unknown as Record<string | symbol, unknown>)[p];
      return typeof v === 'function' ? (v as (...a: unknown[]) => unknown).bind(dbHolder.db) : v;
    },
  }),
}));

import { createTestDb } from './setup';
import { calcProfit, COMMITTED_STATUSES, type ReviewStatus } from '../src/lib/profitCalc';

describe('calcProfit', () => {
  it('vorgemerkt zaehlt nicht (noch nicht gekauft) - User-Decision 2026-05-26', () => {
    expect(calcProfit({ status: 'vorgemerkt', purchase_price_cents: 1000, refund_amount_cents: 999, sale_amount_cents: 999 })).toBe(0);
  });
  it('bestellt ohne Refund -> negativ (User-Decision 2026-05-26)', () => {
    // Bestellt + kein Refund -> -purchase
    expect(calcProfit({ status: 'bestellt', purchase_price_cents: 1000, refund_amount_cents: null, sale_amount_cents: null })).toBe(-1000);
    expect(calcProfit({ status: 'erhalten', purchase_price_cents: 1000, refund_amount_cents: null, sale_amount_cents: null })).toBe(-1000);
    expect(calcProfit({ status: 'bewertet', purchase_price_cents: 1000, refund_amount_cents: null, sale_amount_cents: null })).toBe(-1000);
  });
  it('returns (refund+sale)-purchase for committed statuses', () => {
    expect(calcProfit({ status: 'geld_erhalten', purchase_price_cents: 1000, refund_amount_cents: 1000, sale_amount_cents: 0 })).toBe(0);
    expect(calcProfit({ status: 'verkauft', purchase_price_cents: 1000, refund_amount_cents: 1000, sale_amount_cents: 500 })).toBe(500);
    expect(calcProfit({ status: 'behalten', purchase_price_cents: 1000, refund_amount_cents: 1000, sale_amount_cents: null })).toBe(0);
    expect(calcProfit({ status: 'verschenkt', purchase_price_cents: 1000, refund_amount_cents: 1000, sale_amount_cents: null })).toBe(0);
    expect(calcProfit({ status: 'entsorgt', purchase_price_cents: 1000, refund_amount_cents: 1000, sale_amount_cents: null })).toBe(0);
  });
  it('allows negative profit (User-Decision 2026-05-25)', () => {
    expect(calcProfit({ status: 'verkauft', purchase_price_cents: 1000, refund_amount_cents: 900, sale_amount_cents: 0 })).toBe(-100);
    expect(calcProfit({ status: 'entsorgt', purchase_price_cents: 1000, refund_amount_cents: null, sale_amount_cents: null })).toBe(-1000);
  });
  it('COMMITTED_STATUSES contains all 9 post-purchase statuses (excludes vorgemerkt)', () => {
    expect(COMMITTED_STATUSES).toEqual([
      'bestellt','erhalten','bewertet',
      'geld_erhalten','bereit_verkauf',
      'behalten','verkauft','verschenkt','entsorgt',
    ]);
  });
});

describe('amazon_reviews migration', () => {
  beforeEach(() => { dbHolder.db = createTestDb(); });

  it('creates table with default status vorgemerkt', () => {
    dbHolder.db!.prepare(`INSERT INTO amazon_reviews (product_name, purchase_price_cents) VALUES (?, ?)`)
      .run('Anker USB-C Hub', 2990);
    const row = dbHolder.db!.prepare(`SELECT * FROM amazon_reviews WHERE product_name = ?`).get('Anker USB-C Hub') as { status: string };
    expect(row.status).toBe('vorgemerkt');
  });

  it('CHECK constraint blocks invalid status', () => {
    expect(() =>
      dbHolder.db!.prepare(`INSERT INTO amazon_reviews (product_name, purchase_price_cents, status) VALUES (?, ?, ?)`)
        .run('X', 100, 'unknown_status')
    ).toThrow();
  });

  it('CHECK constraint blocks purchase_price_cents <= 0', () => {
    expect(() =>
      dbHolder.db!.prepare(`INSERT INTO amazon_reviews (product_name, purchase_price_cents) VALUES (?, ?)`)
        .run('X', 0)
    ).toThrow();
  });

  it('all 10 status slugs are accepted', () => {
    const all: ReviewStatus[] = [
      'vorgemerkt','bestellt','erhalten','bewertet',
      'geld_erhalten','bereit_verkauf',
      'behalten','verkauft','verschenkt','entsorgt',
    ];
    for (const s of all) {
      expect(() =>
        dbHolder.db!.prepare(`INSERT INTO amazon_reviews (product_name, purchase_price_cents, status) VALUES (?, ?, ?)`)
          .run(`P-${s}`, 1000, s)
      ).not.toThrow();
    }
  });
});

describe('reviews stats aggregation (D-17)', () => {
  beforeEach(() => { dbHolder.db = createTestDb(); });

  function insert(row: { product_name: string; purchase_price_cents: number; status: ReviewStatus; refund_amount_cents?: number | null; sale_amount_cents?: number | null; received_date?: string | null; }) {
    dbHolder.db!.prepare(`
      INSERT INTO amazon_reviews (product_name, purchase_price_cents, status, refund_amount_cents, sale_amount_cents, received_date)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(row.product_name, row.purchase_price_cents, row.status, row.refund_amount_cents ?? null, row.sale_amount_cents ?? null, row.received_date ?? null);
  }

  it('total counts all rows when no year filter', () => {
    insert({ product_name: 'A', purchase_price_cents: 100, status: 'vorgemerkt' });
    insert({ product_name: 'B', purchase_price_cents: 200, status: 'geld_erhalten', refund_amount_cents: 200 });
    const total = (dbHolder.db!.prepare(`SELECT COUNT(*) AS c FROM amazon_reviews`).get() as { c: number }).c;
    expect(total).toBe(2);
  });

  it('open_refunds counts only pending statuses', () => {
    insert({ product_name: 'P1', purchase_price_cents: 100, status: 'vorgemerkt' });
    insert({ product_name: 'P2', purchase_price_cents: 100, status: 'bestellt' });
    insert({ product_name: 'P3', purchase_price_cents: 100, status: 'erhalten' });
    insert({ product_name: 'P4', purchase_price_cents: 100, status: 'bewertet' });
    insert({ product_name: 'R1', purchase_price_cents: 100, status: 'geld_erhalten', refund_amount_cents: 100 });
    const openRefunds = (dbHolder.db!.prepare(
      `SELECT COUNT(*) AS c FROM amazon_reviews WHERE status IN ('vorgemerkt','bestellt','erhalten','bewertet')`
    ).get() as { c: number }).c;
    expect(openRefunds).toBe(4);
  });

  it('realized_profit_cents sums calcProfit over committed statuses (User-Decision 2026-05-26)', () => {
    insert({ product_name: 'Win', purchase_price_cents: 1000, status: 'verkauft', refund_amount_cents: 1000, sale_amount_cents: 500 });
    insert({ product_name: 'Loss', purchase_price_cents: 1000, status: 'entsorgt', refund_amount_cents: 800 });
    insert({ product_name: 'Ordered', purchase_price_cents: 1000, status: 'bestellt', refund_amount_cents: 999 });
    insert({ product_name: 'Vorgemerkt', purchase_price_cents: 1000, status: 'vorgemerkt' });
    const rows = dbHolder.db!.prepare(
      `SELECT * FROM amazon_reviews WHERE status IN ('bestellt','erhalten','bewertet','geld_erhalten','bereit_verkauf','behalten','verkauft','verschenkt','entsorgt')`
    ).all() as Array<{ status: ReviewStatus; purchase_price_cents: number; refund_amount_cents: number | null; sale_amount_cents: number | null; }>;
    const sum = rows.reduce((acc, r) => acc + calcProfit(r), 0);
    // Win: 500, Loss: -200, Ordered: -1, Vorgemerkt: nicht enthalten
    expect(sum).toBe(299);
  });

  it('year filter uses COALESCE(received_date, order_date, created_at)', () => {
    insert({ product_name: '2025', purchase_price_cents: 100, status: 'vorgemerkt', received_date: '2025-06-15' });
    insert({ product_name: '2026', purchase_price_cents: 100, status: 'vorgemerkt', received_date: '2026-03-01' });
    const c2025 = (dbHolder.db!.prepare(
      `SELECT COUNT(*) AS c FROM amazon_reviews WHERE strftime('%Y', COALESCE(received_date, order_date, created_at)) = ?`
    ).get('2025') as { c: number }).c;
    expect(c2025).toBe(1);
  });
});
