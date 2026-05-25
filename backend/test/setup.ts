import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

// Globaler Test-DB-Handle, wird per Suite frisch erzeugt
export function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  const migrationsDir = path.join(__dirname, '..', 'src', 'db', 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();
  for (const f of files) {
    let sql = fs.readFileSync(path.join(migrationsDir, f), 'utf-8');
    // Migration 043 adds updated_at to app_settings, but 015 already created that
    // column in fresh :memory: DBs. Strip the ADD COLUMN statement so the migration
    // is idempotent in tests — the UPDATE backfill still runs safely.
    // SQLite has no ADD COLUMN IF NOT EXISTS, so we guard here in the test helper.
    if (f === '043_app_settings_updated_at.sql') {
      sql = sql.replace(/ALTER TABLE app_settings ADD COLUMN updated_at TEXT;?\s*/i, '');
    }
    db.exec(sql);
  }
  return db;
}
