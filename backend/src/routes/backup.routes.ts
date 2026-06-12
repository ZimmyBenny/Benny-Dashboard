import { Router } from 'express';
import { exec } from 'child_process';
import { mkdir, readdir, unlink } from 'fs/promises';
import { promisify } from 'util';
import path from 'path';
import os from 'os';
import db from '../db/connection';

const execAsync = promisify(exec);
const router = Router();

// Projekt-Root: backend/src/routes → ../../.. → project root
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

// Komplettes Datenverzeichnis (alle DB- und Upload-Ordner)
const DATA_DIR = path.join(os.homedir(), '.local/share/benny-dashboard');

const ICLOUD_BACKUP_DIR = path.join(
  os.homedir(),
  'Library/Mobile Documents/com~apple~CloudDocs',
  'B E N N Y 👨🏽‍💻/09 - Benny Dashboard/Backups',
);

// Wie viele Datenbank-Snapshots in iCloud behalten werden
const KEEP_DB_BACKUPS = 30;

router.post('/', async (_req, res) => {
  const result: { git: string | null; db: string | null; files: string | null; errors: string[] } = {
    git: null,
    db: null,
    files: null,
    errors: [],
  };

  // ── 1. Git push (Code → GitHub) ──────────────────────────────────────────────
  try {
    const { stdout, stderr } = await execAsync('git push origin main', { cwd: PROJECT_ROOT });
    const out = (stdout + stderr).trim();
    result.git = out || 'Already up to date.';
  } catch (err: unknown) {
    const msg = err instanceof Error ? (err as NodeJS.ErrnoException & { stderr?: string }).stderr ?? err.message : String(err);
    // git schreibt "Everything up-to-date" nach stderr — kein echter Fehler
    if (msg.includes('up-to-date') || msg.includes('up to date')) {
      result.git = 'Already up to date.';
    } else {
      result.errors.push(`Git: ${msg.trim()}`);
    }
  }

  await mkdir(ICLOUD_BACKUP_DIR, { recursive: true }).catch(() => {});

  // ── 2. Datenbank WAL-sicher (better-sqlite3 Online-Backup) → iCloud ──────────
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = path.join(ICLOUD_BACKUP_DIR, `dashboard-${timestamp}.db`);
    await db.backup(dest);
    result.db = `Backups/dashboard-${timestamp}.db`;

    // Aufräumen: nur die letzten KEEP_DB_BACKUPS Snapshots behalten
    const dbFiles = (await readdir(ICLOUD_BACKUP_DIR)).filter((f) => /^dashboard-.*\.db$/.test(f)).sort();
    for (const old of dbFiles.slice(0, Math.max(0, dbFiles.length - KEEP_DB_BACKUPS))) {
      await unlink(path.join(ICLOUD_BACKUP_DIR, old)).catch(() => {});
    }
  } catch (err: unknown) {
    result.errors.push(`DB: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── 3. ALLE Datei-Ordner → iCloud (komplettes Datenverzeichnis) ──────────────
  // Zukunftssicher: das GANZE Datenverzeichnis wird gespiegelt (ausser den alten
  // DB-Backups und den DB-Hilfsdateien). Jeder neue Upload-Ordner eines künftigen
  // Moduls landet damit automatisch im Backup — ohne hier je etwas zu ändern.
  try {
    const filesDest = path.join(ICLOUD_BACKUP_DIR, 'files');
    await mkdir(filesDest, { recursive: true });
    await execAsync(
      `rsync -a --exclude='backups' --exclude='.DS_Store' --exclude='dashboard.db' --exclude='dashboard.db-wal' --exclude='dashboard.db-shm' "${DATA_DIR}/" "${filesDest}/"`,
    );
    result.files = 'Backups/files (alle Upload-Ordner, komplett)';
  } catch (err: unknown) {
    result.errors.push(`Dateien: ${err instanceof Error ? err.message : String(err)}`);
  }

  const status = result.errors.length === 0 ? 200 : 207;
  res.status(status).json({ success: result.errors.length === 0, ...result });
});

export default router;
