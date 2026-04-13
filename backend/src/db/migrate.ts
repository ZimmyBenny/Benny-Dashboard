import fs from 'fs';
import path from 'path';
import db from './connection';

const migrationsDir = path.join(__dirname, 'migrations');

export function runMigrations(): void {
  // Create migrations tracking table if it doesn't exist
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Get set of already-applied migration filenames
  const applied = new Set<string>(
    (db.prepare('SELECT name FROM _migrations').all() as Array<{ name: string }>)
      .map((row) => row.name)
  );

  // Read migration files, sort alphabetically (001_ prefix ensures chronological order)
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let appliedCount = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`[migrate] Skipping ${file} (already applied)`);
      continue;
    }

    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    // Transaktion: Migration komplett oder gar nicht (verhindert Halb-Migrationen)
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file);
    })();
    console.log(`[migrate] Applied ${file}`);
    appliedCount++;
  }

  if (appliedCount === 0) {
    console.log('[migrate] All migrations up to date.');
  } else {
    console.log(`[migrate] Applied ${appliedCount} migration(s).`);
  }
}
