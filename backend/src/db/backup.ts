import fs from 'fs';
import path from 'path';
import os from 'os';

const DB_PATH = path.join(os.homedir(), '.local', 'share', 'benny-dashboard', 'dashboard.db');
const BACKUP_DIR = path.join(os.homedir(), '.local', 'share', 'benny-dashboard', 'backups');

/**
 * Erstellt ein Backup der Datenbank vor destruktiven Operationen.
 *
 * Regel: Jede destruktive Bulk-Operation (Migration mit DROP, CSV/VCF-Import,
 * Massen-Delete) ruft createBackup(label) auf, bevor sie Daten verändert.
 *
 * @param label  Kurzer Bezeichner der Operation, z.B. 'pre-migration', 'contact-import'
 * @returns      Pfad des erstellten Backups, oder null bei Fehler
 */
export function createBackup(label: string): string | null {
  try {
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(BACKUP_DIR, `${label}-${timestamp}.db`);
    fs.copyFileSync(DB_PATH, backupPath);
    console.log(`[backup] Backup erstellt: ${backupPath}`);
    return backupPath;
  } catch (err) {
    // Backup-Fehler blockieren die Operation nicht — nur warnen
    console.warn(`[backup] WARNUNG: Backup (${label}) fehlgeschlagen:`, err);
    return null;
  }
}
