import { Router } from 'express';
import { exec } from 'child_process';
import { copyFile, mkdir } from 'fs/promises';
import { promisify } from 'util';
import path from 'path';
import os from 'os';

const execAsync = promisify(exec);
const router = Router();

// Projekt-Root: backend/src/routes → ../../.. → project root
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

const DB_PATH = path.join(os.homedir(), '.local/share/benny-dashboard/dashboard.db');

const ICLOUD_BACKUP_DIR = path.join(
  os.homedir(),
  'Library/Mobile Documents/com~apple~CloudDocs',
  'B E N N Y 👨🏽‍💻/09 - Benny Dashboard/Backups',
);

router.post('/', async (_req, res) => {
  const result: { git: string | null; db: string | null; errors: string[] } = {
    git: null,
    db: null,
    errors: [],
  };

  // ── 1. Git push ────────────────────────────────────────────────────────────
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

  // ── 2. DB → iCloud ─────────────────────────────────────────────────────────
  try {
    await mkdir(ICLOUD_BACKUP_DIR, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dest = path.join(ICLOUD_BACKUP_DIR, `dashboard-${timestamp}.db`);
    await copyFile(DB_PATH, dest);
    result.db = `Backups/dashboard-${timestamp}.db`;
  } catch (err: unknown) {
    result.errors.push(`DB: ${err instanceof Error ? err.message : String(err)}`);
  }

  const status = result.errors.length === 0 ? 200 : 207;
  res.status(status).json({ success: result.errors.length === 0, ...result });
});

export default router;
