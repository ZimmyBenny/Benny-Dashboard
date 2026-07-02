import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from './setup';

interface SqliteMaster { name: string; type: string; }
interface ColumnInfo { name: string; type: string; notnull: number; dflt_value: string | null; pk: number; }

describe('Migration 060 — amazon_brand_name + amazon_brand_name_candidates', () => {
  let db: Database.Database;
  beforeEach(() => { db = createTestDb(); });

  it('erstellt beide Brand-Tabellen', () => {
    const brand = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='amazon_brand_name'`
    ).get() as SqliteMaster | undefined;
    const cands = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='amazon_brand_name_candidates'`
    ).get() as SqliteMaster | undefined;
    expect(brand).toBeDefined();
    expect(cands).toBeDefined();
  });

  it('amazon_brand_name hat product_id PK + status + is_expanded + notes', () => {
    const cols = db.prepare(`PRAGMA table_info(amazon_brand_name)`).all() as ColumnInfo[];
    const names = new Set(cols.map(c => c.name));
    for (const n of ['product_id', 'status', 'is_expanded', 'notes', 'updated_at']) {
      expect(names.has(n), `Spalte ${n} fehlt`).toBe(true);
    }
  });

  it('amazon_brand_name.status CHECK', () => {
    db.prepare(`INSERT INTO amazon_products (name) VALUES ('P')`).run();
    const productId = (db.prepare(`SELECT last_insert_rowid() AS id`).get() as { id: number }).id;
    const insert = db.prepare(`INSERT INTO amazon_brand_name (product_id, status) VALUES (?, ?)`);
    expect(() => insert.run(productId, 'kaputt')).toThrow();
    db.prepare(`DELETE FROM amazon_brand_name WHERE product_id=?`).run(productId);
    expect(() => insert.run(productId, 'offen')).not.toThrow();
  });

  it('amazon_brand_name_candidates hat alle Spalten + Index', () => {
    const cols = db.prepare(`PRAGMA table_info(amazon_brand_name_candidates)`).all() as ColumnInfo[];
    const names = new Set(cols.map(c => c.name));
    for (const n of [
      'id', 'product_id', 'sort_order', 'name',
      'is_interesting', 'is_maybe', 'is_yes', 'is_no', 'is_favorite', 'is_archived',
      'remarks',
      'trademark_status', 'domain_com_status', 'domain_de_status', 'social_status',
      'domain_shop_status', 'tiktok_status', 'instagram_status',
      'research_url', 'research_notes',
      'created_at', 'updated_at',
    ]) {
      expect(names.has(n), `Spalte ${n} fehlt`).toBe(true);
    }
    const idx = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='index' AND name='amazon_brand_name_candidates_product_idx'`
    ).get();
    expect(idx).toBeDefined();
  });

  it('Candidates CHECK-Constraints', () => {
    db.prepare(`INSERT INTO amazon_products (name) VALUES ('P')`).run();
    const pid = (db.prepare(`SELECT last_insert_rowid() AS id`).get() as { id: number }).id;

    expect(() => db.prepare(
      `INSERT INTO amazon_brand_name_candidates (product_id, name, trademark_status) VALUES (?, 'X', ?)`
    ).run(pid, 'kaputt')).toThrow();

    expect(() => db.prepare(
      `INSERT INTO amazon_brand_name_candidates (product_id, name, domain_com_status) VALUES (?, 'X', ?)`
    ).run(pid, 'belegt')).not.toThrow();

    expect(() => db.prepare(
      `INSERT INTO amazon_brand_name_candidates (product_id, name, tiktok_status) VALUES (?, 'X', ?)`
    ).run(pid, 'belegt')).not.toThrow();

    expect(() => db.prepare(
      `INSERT INTO amazon_brand_name_candidates (product_id, name, instagram_status) VALUES (?, 'X', ?)`
    ).run(pid, 'kaputt')).toThrow();

    expect(() => db.prepare(
      `INSERT INTO amazon_brand_name_candidates (product_id, name, is_favorite) VALUES (?, 'X', ?)`
    ).run(pid, 2)).toThrow();
  });

  it('Cascade-Delete entfernt Brand-Daten beim Produkt-Loeschen', () => {
    db.prepare(`INSERT INTO amazon_products (name) VALUES ('P')`).run();
    const pid = (db.prepare(`SELECT last_insert_rowid() AS id`).get() as { id: number }).id;

    db.prepare(`INSERT INTO amazon_brand_name (product_id) VALUES (?)`).run(pid);
    db.prepare(`INSERT INTO amazon_brand_name_candidates (product_id, name) VALUES (?, 'Acme')`).run(pid);
    db.prepare(`INSERT INTO amazon_brand_name_candidates (product_id, name) VALUES (?, 'Beta')`).run(pid);

    db.prepare(`DELETE FROM amazon_products WHERE id=?`).run(pid);

    expect(db.prepare(`SELECT * FROM amazon_brand_name WHERE product_id=?`).get(pid)).toBeUndefined();
    expect(db.prepare(`SELECT * FROM amazon_brand_name_candidates WHERE product_id=?`).all(pid)).toEqual([]);
  });
});
