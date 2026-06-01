import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from './setup';

interface SqliteMaster { name: string; type: string; }
interface ColumnInfo { name: string; type: string; notnull: number; dflt_value: string | null; pk: number; }
interface IndexInfo { name: string; }

describe('Migration 057 — amazon_products', () => {
  let db: Database.Database;
  beforeEach(() => { db = createTestDb(); });

  it('erstellt Tabelle amazon_products', () => {
    const row = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='amazon_products'`
    ).get() as SqliteMaster | undefined;
    expect(row).toBeDefined();
  });

  it('hat alle Pflichtspalten in korrekten Typen', () => {
    const cols = db.prepare(`PRAGMA table_info(amazon_products)`).all() as ColumnInfo[];
    const byName = Object.fromEntries(cols.map(c => [c.name, c]));

    expect(byName.id?.pk).toBe(1);
    expect(byName.name?.notnull).toBe(1);
    expect(byName.status?.notnull).toBe(1);
    expect(byName.status?.dflt_value).toContain("'interessant'");
    expect(byName.image_path?.notnull).toBe(0);
    expect(byName.created_at?.type.toUpperCase()).toBe('INTEGER');
    expect(byName.updated_at?.type.toUpperCase()).toBe('INTEGER');
  });

  it('Status-CHECK weist ungueltige Werte ab', () => {
    const insert = db.prepare(`INSERT INTO amazon_products (name, status) VALUES (?, ?)`);
    expect(() => insert.run('Test', 'kaputt')).toThrow();
    expect(() => insert.run('Test', 'interessant')).not.toThrow();
    expect(() => insert.run('Test', 'aktiv')).not.toThrow();
    expect(() => insert.run('Test', 'bestehend')).not.toThrow();
    expect(() => insert.run('Test', 'verworfen')).not.toThrow();
  });

  it('hat Index amazon_products_status_idx', () => {
    const row = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='index' AND name='amazon_products_status_idx'`
    ).get() as IndexInfo | undefined;
    expect(row).toBeDefined();
  });
});
