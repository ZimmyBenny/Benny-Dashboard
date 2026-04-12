import { Router } from 'express';
import { exec } from 'child_process';
import { copyFile, mkdir, readdir, unlink } from 'fs/promises';
import { promisify } from 'util';
import path from 'path';
import os from 'os';
import db from '../db/connection';

const execAsync = promisify(exec);
const router = Router();

// Projekt-Root: backend/src/routes → ../../.. → project root
const PROJECT_ROOT = path.resolve(__dirname, '../../..');

const DB_PATH = path.join(os.homedir(), '.local/share/benny-dashboard/dashboard.db');
const UPLOADS_PATH = path.join(os.homedir(), '.local/share/benny-dashboard/uploads');
const VERTRAEGE_PATH = path.join(os.homedir(), '.local/share/benny-dashboard/vertraege');

const ICLOUD_BACKUP_DIR = path.join(
  os.homedir(),
  'Library/Mobile Documents/com~apple~CloudDocs',
  'B E N N Y 👨🏽‍💻/09 - Benny Dashboard/Backups',
);

router.post('/', async (_req, res) => {
  const result: { git: string | null; db: string | null; uploads: string | null; vertraege: string | null; errors: string[] } = {
    git: null,
    db: null,
    uploads: null,
    vertraege: null,
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

  // ── 3. Uploads → iCloud (kopieren; Cleanup nach 7 Tagen Abwesenheit aus DB) ────
  try {
    const uploadsBackupDir = path.join(ICLOUD_BACKUP_DIR, 'uploads');
    await mkdir(uploadsBackupDir, { recursive: true });

    // Aktuelle Anhänge aus DB mit Originalnamen holen
    type AttRow = { id: number; file_name: string; storage_path: string };
    const attachments = db.prepare('SELECT id, file_name, storage_path FROM workbook_attachments').all() as AttRow[];
    const validNames = new Set(attachments.map((a) => a.file_name));

    // Immer: neue/geänderte Dateien ins Backup kopieren
    await Promise.all(
      attachments.map(async (att) => {
        const src = path.join(UPLOADS_PATH, att.storage_path);
        const dest = path.join(uploadsBackupDir, att.file_name);
        try { await copyFile(src, dest); } catch { /* Datei fehlt lokal — überspringen */ }
      })
    );

    // Backup-Dateien die nicht in DB sind: Abwesenheit tracken
    const backupFiles = await readdir(uploadsBackupDir).catch(() => [] as string[]);
    const now = new Date();
    const GRACE_DAYS = 7;

    for (const f of backupFiles) {
      if (validNames.has(f)) {
        // Wieder in DB vorhanden → aus Pending-Liste entfernen
        db.prepare('DELETE FROM backup_pending_cleanup WHERE file_name = ?').run(f);
      } else {
        // Nicht in DB → Eintrag anlegen falls noch nicht vorhanden
        db.prepare('INSERT OR IGNORE INTO backup_pending_cleanup (file_name, first_absent_at) VALUES (?, ?)').run(f, now.toISOString());
      }
    }

    // Dateien löschen die seit mehr als 7 Tagen nicht mehr in der DB sind
    type PendingRow = { file_name: string; first_absent_at: string };
    const pending = db.prepare('SELECT file_name, first_absent_at FROM backup_pending_cleanup').all() as PendingRow[];
    for (const p of pending) {
      const absentSince = new Date(p.first_absent_at);
      const daysSince = (now.getTime() - absentSince.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince >= GRACE_DAYS) {
        await unlink(path.join(uploadsBackupDir, p.file_name)).catch(() => {});
        db.prepare('DELETE FROM backup_pending_cleanup WHERE file_name = ?').run(p.file_name);
      }
    }

    result.uploads = attachments.length > 0
      ? `Backups/uploads (${attachments.length} Datei${attachments.length === 1 ? '' : 'en'})`
      : 'Keine Anhänge vorhanden';
  } catch (err: unknown) {
    result.errors.push(`Uploads: ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── 4. Vertrags-Anhänge → iCloud ──────────────────────────────────────────
  try {
    const vertraegeBackupDir = path.join(ICLOUD_BACKUP_DIR, 'vertraege');
    await mkdir(vertraegeBackupDir, { recursive: true });

    type VAttRow = { id: number; file_name: string; storage_path: string };
    const vAttachments = db.prepare('SELECT id, file_name, storage_path FROM contracts_and_deadlines_attachments').all() as VAttRow[];
    const validVNames = new Set(vAttachments.map((a) => a.file_name));

    await Promise.all(
      vAttachments.map(async (att) => {
        const src = path.join(VERTRAEGE_PATH, att.storage_path);
        const dest = path.join(vertraegeBackupDir, att.file_name);
        try { await copyFile(src, dest); } catch { /* Datei fehlt lokal — überspringen */ }
      })
    );

    // Backup-Dateien bereinigen die nicht mehr in DB sind (7 Tage Karenzzeit)
    const vBackupFiles = await readdir(vertraegeBackupDir).catch(() => [] as string[]);
    const now2 = new Date();
    for (const f of vBackupFiles) {
      if (validVNames.has(f)) {
        db.prepare('DELETE FROM backup_pending_cleanup WHERE file_name = ?').run(`vertraege/${f}`);
      } else {
        db.prepare('INSERT OR IGNORE INTO backup_pending_cleanup (file_name, first_absent_at) VALUES (?, ?)').run(`vertraege/${f}`, now2.toISOString());
      }
    }
    type PendingRow2 = { file_name: string; first_absent_at: string };
    const pending2 = db.prepare("SELECT file_name, first_absent_at FROM backup_pending_cleanup WHERE file_name LIKE 'vertraege/%'").all() as PendingRow2[];
    for (const p of pending2) {
      const daysSince = (now2.getTime() - new Date(p.first_absent_at).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince >= 7) {
        await unlink(path.join(vertraegeBackupDir, p.file_name.replace('vertraege/', ''))).catch(() => {});
        db.prepare('DELETE FROM backup_pending_cleanup WHERE file_name = ?').run(p.file_name);
      }
    }

    result.vertraege = vAttachments.length > 0
      ? `Backups/vertraege (${vAttachments.length} Datei${vAttachments.length === 1 ? '' : 'en'})`
      : 'Keine Vertrags-Anhänge vorhanden';
  } catch (err: unknown) {
    result.errors.push(`Vertraege: ${err instanceof Error ? err.message : String(err)}`);
  }

  const status = result.errors.length === 0 ? 200 : 207;
  res.status(status).json({ success: result.errors.length === 0, ...result });
});

export default router;
