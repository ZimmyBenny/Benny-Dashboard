import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from './setup';

describe('audit_log (Plan 00 smoke)', () => {
  let db: Database.Database;
  beforeEach(() => {
    db = createTestDb();
  });

  it('accepts INSERT', () => {
    const result = db.prepare(`
      INSERT INTO audit_log (entity_type, entity_id, action, actor)
      VALUES ('receipt', 1, 'create', 'tester')
    `).run();
    expect(result.changes).toBe(1);
  });

  it('blocks UPDATE via BEFORE UPDATE trigger', () => {
    db.prepare(`INSERT INTO audit_log (entity_type, entity_id, action) VALUES ('receipt', 1, 'create')`).run();
    expect(() =>
      db.prepare(`UPDATE audit_log SET action = 'tampered' WHERE id = 1`).run()
    ).toThrow(/GoBD/);
  });

  it('blocks DELETE via BEFORE DELETE trigger', () => {
    db.prepare(`INSERT INTO audit_log (entity_type, entity_id, action) VALUES ('receipt', 1, 'create')`).run();
    expect(() =>
      db.prepare(`DELETE FROM audit_log WHERE id = 1`).run()
    ).toThrow(/GoBD/);
  });
});
