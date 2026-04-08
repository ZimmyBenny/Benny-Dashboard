import Database from 'better-sqlite3';
import type BetterSqlite3 from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';

// CRITICAL: DB must live OUTSIDE iCloud Drive.
// This project directory is inside com~apple~CloudDocs.
// iCloud's bird daemon conflicts with SQLite WAL file locking.
// Default path uses HOME env to ensure it's always outside iCloud.
function resolveDbPath(): string {
  const envPath = process.env.DB_PATH;
  if (envPath) {
    // Expand tilde if present
    return envPath.startsWith('~')
      ? path.join(os.homedir(), envPath.slice(1))
      : envPath;
  }
  // Fallback: safe default outside iCloud Drive
  return path.join(os.homedir(), '.local', 'share', 'benny-dashboard', 'dashboard.db');
}

const DB_PATH = resolveDbPath();

// Ensure parent directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(DB_PATH);

// Critical pragmas — set BEFORE any queries
db.pragma('journal_mode = WAL');   // Prevents read-write locks; enables concurrent reads
db.pragma('foreign_keys = ON');    // Enforce FK constraints (good hygiene for future migrations)
db.pragma('busy_timeout = 5000'); // Wait up to 5s before returning SQLITE_BUSY

// Checkpoint on startup to prevent WAL file accumulation over time
db.pragma('wal_checkpoint(TRUNCATE)');

console.log(`[db] Connected to ${DB_PATH}`);
console.log(`[db] WAL mode: ${(db.pragma('journal_mode') as Array<{ journal_mode: string }>)[0].journal_mode}`);

const typedDb: BetterSqlite3.Database = db;

export default typedDb;
