import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from './setup';

interface SqliteMaster { name: string; type: string; }
interface ColumnInfo { name: string; type: string; notnull: number; dflt_value: string | null; pk: number; }

describe('Migration 058 — amazon_sourcing + amazon_sourcing_samples', () => {
  let db: Database.Database;
  beforeEach(() => { db = createTestDb(); });

  it('erstellt beide Tabellen', () => {
    const sourcing = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='amazon_sourcing'`
    ).get() as SqliteMaster | undefined;
    const samples = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='amazon_sourcing_samples'`
    ).get() as SqliteMaster | undefined;
    expect(sourcing).toBeDefined();
    expect(samples).toBeDefined();
  });

  it('amazon_sourcing hat alle 9 cp_-Spalten + status + is_expanded + updated_at', () => {
    const cols = db.prepare(`PRAGMA table_info(amazon_sourcing)`).all() as ColumnInfo[];
    const names = new Set(cols.map(c => c.name));
    for (const n of [
      'product_id', 'status', 'is_expanded',
      'cp_hersteller_gefiltert', 'cp_anforderungen_kommuniziert', 'cp_erste_preise_erhalten',
      'cp_usp_geprueft', 'cp_samples_angefragt', 'cp_sample_analyse',
      'cp_vergleichstabelle', 'cp_finale_verhandlung', 'cp_zahlungsziel',
      'updated_at',
    ]) {
      expect(names.has(n), `Spalte ${n} fehlt`).toBe(true);
    }
  });

  it('amazon_sourcing.status CHECK weist ungueltige Werte ab', () => {
    db.prepare(`INSERT INTO amazon_products (name) VALUES ('P')`).run();
    const productId = db.prepare(`SELECT last_insert_rowid() AS id`).get() as { id: number };
    const insert = db.prepare(`INSERT INTO amazon_sourcing (product_id, status) VALUES (?, ?)`);
    expect(() => insert.run(productId.id, 'kaputt')).toThrow();
    db.prepare(`DELETE FROM amazon_sourcing WHERE product_id=?`).run(productId.id);
    expect(() => insert.run(productId.id, 'offen')).not.toThrow();
    db.prepare(`DELETE FROM amazon_sourcing WHERE product_id=?`).run(productId.id);
    expect(() => insert.run(productId.id, 'in_bearbeitung')).not.toThrow();
    db.prepare(`DELETE FROM amazon_sourcing WHERE product_id=?`).run(productId.id);
    expect(() => insert.run(productId.id, 'erledigt')).not.toThrow();
  });

  it('amazon_sourcing_samples hat alle Spalten und Index', () => {
    const cols = db.prepare(`PRAGMA table_info(amazon_sourcing_samples)`).all() as ColumnInfo[];
    const names = new Set(cols.map(c => c.name));
    for (const n of [
      'id', 'product_id', 'sort_order', 'is_winner',
      'hersteller', 'sample_kosten', 'besonderheiten', 'lieferzeit',
      'qualitaet', 'bewertung', 'status', 'notizen',
      'created_at', 'updated_at',
    ]) {
      expect(names.has(n), `Spalte ${n} fehlt`).toBe(true);
    }
    const idx = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='index' AND name='amazon_sourcing_samples_product_idx'`
    ).get();
    expect(idx).toBeDefined();
  });

  it('amazon_sourcing_samples CHECK-Constraints', () => {
    db.prepare(`INSERT INTO amazon_products (name) VALUES ('P')`).run();
    const productId = (db.prepare(`SELECT last_insert_rowid() AS id`).get() as { id: number }).id;

    expect(() => db.prepare(
      `INSERT INTO amazon_sourcing_samples (product_id, qualitaet) VALUES (?, ?)`
    ).run(productId, 'super_gut')).toThrow();

    expect(() => db.prepare(
      `INSERT INTO amazon_sourcing_samples (product_id, bewertung) VALUES (?, ?)`
    ).run(productId, 7)).toThrow();

    expect(() => db.prepare(
      `INSERT INTO amazon_sourcing_samples (product_id, bewertung) VALUES (?, ?)`
    ).run(productId, -1)).toThrow();

    expect(() => db.prepare(
      `INSERT INTO amazon_sourcing_samples (product_id, status) VALUES (?, ?)`
    ).run(productId, 'kaputt')).toThrow();

    expect(() => db.prepare(
      `INSERT INTO amazon_sourcing_samples (product_id, is_winner) VALUES (?, ?)`
    ).run(productId, 2)).toThrow();
  });

  it('Cascade-Delete entfernt sourcing + samples bei Produkt-Loeschung', () => {
    db.prepare(`INSERT INTO amazon_products (name) VALUES ('P')`).run();
    const productId = (db.prepare(`SELECT last_insert_rowid() AS id`).get() as { id: number }).id;

    db.prepare(`INSERT INTO amazon_sourcing (product_id) VALUES (?)`).run(productId);
    db.prepare(`INSERT INTO amazon_sourcing_samples (product_id, hersteller) VALUES (?, 'A')`).run(productId);
    db.prepare(`INSERT INTO amazon_sourcing_samples (product_id, hersteller) VALUES (?, 'B')`).run(productId);

    db.prepare(`DELETE FROM amazon_products WHERE id=?`).run(productId);

    const sourcing = db.prepare(`SELECT * FROM amazon_sourcing WHERE product_id=?`).get(productId);
    const samples = db.prepare(`SELECT * FROM amazon_sourcing_samples WHERE product_id=?`).all(productId);
    expect(sourcing).toBeUndefined();
    expect(samples).toEqual([]);
  });
});
