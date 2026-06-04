import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from './setup';

interface SqliteMaster { name: string; type: string; }
interface ColumnInfo { name: string; type: string; notnull: number; dflt_value: string | null; pk: number; }

describe('Migration 062 — amazon_checklist (Master + Product)', () => {
  let db: Database.Database;
  beforeEach(() => { db = createTestDb(); });

  it('erstellt alle 4 Tabellen', () => {
    for (const name of [
      'amazon_checklist_master_sections',
      'amazon_checklist_master_items',
      'amazon_checklist_product_sections',
      'amazon_checklist_product_items',
    ]) {
      const row = db.prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
      ).get(name) as SqliteMaster | undefined;
      expect(row, `Tabelle ${name} fehlt`).toBeDefined();
    }
  });

  it('hat Indizes', () => {
    for (const name of [
      'amazon_checklist_master_items_section_idx',
      'amazon_checklist_product_sections_product_idx',
      'amazon_checklist_product_items_section_idx',
    ]) {
      const row = db.prepare(
        `SELECT name FROM sqlite_master WHERE type='index' AND name=?`
      ).get(name);
      expect(row, `Index ${name} fehlt`).toBeDefined();
    }
  });

  it('master_items hat is_done mit CHECK', () => {
    const cols = db.prepare(`PRAGMA table_info(amazon_checklist_master_items)`).all() as ColumnInfo[];
    const isDone = cols.find(c => c.name === 'is_done');
    expect(isDone).toBeDefined();
    expect(() => db.prepare(
      `INSERT INTO amazon_checklist_master_sections (title) VALUES ('S1')`
    ).run()).not.toThrow();
    const sid = (db.prepare(`SELECT last_insert_rowid() AS id`).get() as { id: number }).id;
    expect(() => db.prepare(
      `INSERT INTO amazon_checklist_master_items (section_id, description, is_done) VALUES (?, 'X', ?)`
    ).run(sid, 2)).toThrow();
  });

  it('Seed: 5 Master-Sections mit erwarteten Titeln und Item-Counts', () => {
    const sections = db.prepare(
      `SELECT id, title FROM amazon_checklist_master_sections ORDER BY sort_order, id`
    ).all() as Array<{ id: number; title: string }>;
    const titles = sections.map(s => s.title);
    expect(titles).toEqual([
      'Gründung und einmalige Aufgaben',
      'Produktsuche',
      'Produkteinkauf',
      'Amazon Listing erstellen',
      'Bei Verkäufen außerhalb der EU',
    ]);

    function count(title: string): number {
      const s = sections.find(s => s.title === title);
      if (!s) return -1;
      return (db.prepare(
        `SELECT COUNT(*) AS c FROM amazon_checklist_master_items WHERE section_id = ?`
      ).get(s.id) as { c: number }).c;
    }
    expect(count('Gründung und einmalige Aufgaben')).toBe(14);
    expect(count('Produktsuche')).toBe(13);
    expect(count('Produkteinkauf')).toBe(19);
    expect(count('Amazon Listing erstellen')).toBe(19);
    expect(count('Bei Verkäufen außerhalb der EU')).toBe(1);
  });

  it('Section "Produktsuche" hat ein Item mit Link auf EZT Online', () => {
    const sec = db.prepare(
      `SELECT id FROM amazon_checklist_master_sections WHERE title = 'Produktsuche'`
    ).get() as { id: number };
    const item = db.prepare(
      `SELECT description, link_url FROM amazon_checklist_master_items
       WHERE section_id = ? AND description LIKE 'Zolltarifnummer%'`
    ).get(sec.id) as { description: string; link_url: string | null } | undefined;
    expect(item).toBeDefined();
    expect(item!.link_url).toContain('ezt-online.de');
  });

  it('Cascade: Produkt löschen entfernt product_sections + items', () => {
    db.prepare(`INSERT INTO amazon_products (name) VALUES ('P')`).run();
    const pid = (db.prepare(`SELECT last_insert_rowid() AS id`).get() as { id: number }).id;
    db.prepare(`INSERT INTO amazon_checklist_product_sections (product_id, title) VALUES (?, 'S')`).run(pid);
    const sid = (db.prepare(`SELECT last_insert_rowid() AS id`).get() as { id: number }).id;
    db.prepare(`INSERT INTO amazon_checklist_product_items (section_id, description) VALUES (?, 'I')`).run(sid);

    db.prepare(`DELETE FROM amazon_products WHERE id=?`).run(pid);

    expect(db.prepare(`SELECT * FROM amazon_checklist_product_sections WHERE product_id=?`).all(pid)).toEqual([]);
    expect(db.prepare(`SELECT * FROM amazon_checklist_product_items WHERE section_id=?`).all(sid)).toEqual([]);
  });
});
