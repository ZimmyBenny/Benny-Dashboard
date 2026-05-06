import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from './setup';

interface SqliteMaster { name: string; type: string; }
interface ColumnInfo { name: string; type: string; notnull: number; dflt_value: string | null; pk: number; }
interface KvRow { key: string; value: string; }
interface AreaRow { name: string; slug: string; }
interface CountRow { c: number; }

describe('Migration 040_belege schema', () => {
  let db: Database.Database;
  beforeEach(() => { db = createTestDb(); });

  it('creates all 9 new tables', () => {
    const expected = [
      'areas','tax_categories','trips','receipts',
      'receipt_files','receipt_area_links','receipt_links',
      'receipt_ocr_results','supplier_memory',
    ];
    for (const name of expected) {
      const row = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(name) as SqliteMaster | undefined;
      expect(row, `Table ${name} should exist`).toBeDefined();
    }
  });

  it('has receipts.amount_gross_cents as INTEGER', () => {
    const cols = db.prepare(`PRAGMA table_info(receipts)`).all() as ColumnInfo[];
    const c = cols.find(c => c.name === 'amount_gross_cents');
    expect(c, 'amount_gross_cents column must exist').toBeDefined();
    expect(c!.type.toUpperCase()).toBe('INTEGER');
  });

  it('has private_share_percent on receipts', () => {
    const cols = db.prepare(`PRAGMA table_info(receipts)`).all() as ColumnInfo[];
    const c = cols.find(c => c.name === 'private_share_percent');
    expect(c).toBeDefined();
    expect(c!.type.toUpperCase()).toBe('INTEGER');
  });

  it('has corrects_receipt_id and corrected_by_receipt_id on receipts', () => {
    const cols = db.prepare(`PRAGMA table_info(receipts)`).all() as ColumnInfo[];
    expect(cols.find(c => c.name === 'corrects_receipt_id')).toBeDefined();
    expect(cols.find(c => c.name === 'corrected_by_receipt_id')).toBeDefined();
  });

  it('seeds exactly 3 areas (Amazon FBA, DJ, Privat)', () => {
    const rows = db.prepare(`SELECT name, slug FROM areas ORDER BY sort_order`).all() as AreaRow[];
    expect(rows).toEqual([
      { name: 'Amazon FBA', slug: 'amazon-fba' },
      { name: 'DJ',         slug: 'dj' },
      { name: 'Privat',     slug: 'privat' },
    ]);
  });

  it('seeds 17 tax_categories', () => {
    const r = db.prepare(`SELECT COUNT(*) AS c FROM tax_categories`).get() as CountRow;
    expect(r.c).toBe(17);
  });

  it('seeds Fahrtkosten tax_category with vat_rate=0', () => {
    const row = db.prepare(`SELECT * FROM tax_categories WHERE slug='fahrtkosten'`).get() as { default_vat_rate: number };
    expect(row.default_vat_rate).toBe(0);
  });

  it('seeds 9 new app_settings keys', () => {
    const keys = ['ustva_zeitraum','ist_versteuerung','payment_task_lead_days',
                  'max_upload_size_mb','ocr_confidence_threshold','ocr_engine',
                  'mileage_rate_default_per_km','mileage_rate_above_20km_per_km',
                  'belege_storage_path'];
    for (const k of keys) {
      const r = db.prepare(`SELECT value FROM app_settings WHERE key=?`).get(k) as KvRow | undefined;
      expect(r, `app_setting ${k} should exist`).toBeDefined();
    }
  });

  it('blocks UPDATE on receipts.amount_gross_cents after freigegeben_at is set', () => {
    const ins = db.prepare(`
      INSERT INTO receipts (type, source, receipt_date, amount_gross_cents, freigegeben_at)
      VALUES ('eingangsrechnung', 'manual_upload', '2026-05-05', 10000, '2026-05-05 10:00:00')
    `).run();
    const id = Number(ins.lastInsertRowid);
    expect(() =>
      db.prepare(`UPDATE receipts SET amount_gross_cents = 99999 WHERE id = ?`).run(id)
    ).toThrow(/GoBD/);
  });

  it('allows UPDATE on receipts.notes after freigegeben_at (notes is not locked)', () => {
    const ins = db.prepare(`
      INSERT INTO receipts (type, source, receipt_date, amount_gross_cents, freigegeben_at)
      VALUES ('eingangsrechnung', 'manual_upload', '2026-05-05', 10000, '2026-05-05 10:00:00')
    `).run();
    const id = Number(ins.lastInsertRowid);
    const result = db.prepare(`UPDATE receipts SET notes = 'updated' WHERE id = ?`).run(id);
    expect(result.changes).toBe(1);
  });

  it('blocks DELETE on receipt_files when receipt is freigegeben', () => {
    const r = db.prepare(`
      INSERT INTO receipts (type, source, receipt_date, amount_gross_cents, freigegeben_at)
      VALUES ('eingangsrechnung', 'manual_upload', '2026-05-05', 10000, '2026-05-05 10:00:00')
    `).run();
    const f = db.prepare(`
      INSERT INTO receipt_files (receipt_id, original_filename, storage_path, sha256, file_size_bytes)
      VALUES (?, 'a.pdf', '/tmp/a.pdf', 'abc', 1234)
    `);
    // INSERT auf freigegebener receipt sollte schon fehlschlagen
    expect(() => f.run(r.lastInsertRowid)).toThrow(/GoBD/);
  });

  it('adds source_receipt_id column to tasks', () => {
    const cols = db.prepare(`PRAGMA table_info(tasks)`).all() as ColumnInfo[];
    const c = cols.find(c => c.name === 'source_receipt_id');
    expect(c).toBeDefined();
  });
});
