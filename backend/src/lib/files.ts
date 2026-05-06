import os from 'os';
import path from 'path';
import fs from 'fs';
import fsp from 'fs/promises';
import crypto from 'crypto';
import db from '../db/connection';

/**
 * Datei- und Pfad-Helper für das Belege-Modul.
 *
 * Speicherort-Logik:
 *  - Wenn `app_settings.belege_storage_path` einen non-empty Wert hat → diesen Pfad nutzen
 *  - Sonst → DEFAULT_BELEGE_ROOT (~/.local/share/benny-dashboard/belege)
 *
 * WICHTIG: NIEMALS in iCloud Drive — bird daemon konfligiert mit File-Locks (s. db/connection.ts).
 */

interface KvRow {
  value: string;
}

/** Default-Speicherort (außerhalb iCloud). */
export const DEFAULT_BELEGE_ROOT = path.join(
  os.homedir(),
  '.local',
  'share',
  'benny-dashboard',
  'belege',
);

/**
 * Liefert den konfigurierten Belege-Root.
 * - Liest app_settings.belege_storage_path; falls leer/whitespace → DEFAULT_BELEGE_ROOT.
 */
export function getBelegeRoot(): string {
  try {
    const row = db
      .prepare(`SELECT value FROM app_settings WHERE key = 'belege_storage_path'`)
      .get() as KvRow | undefined;
    const v = row?.value?.trim();
    return v && v.length > 0 ? v : DEFAULT_BELEGE_ROOT;
  } catch {
    // Falls DB / Tabelle (noch) nicht verfügbar → Fallback
    return DEFAULT_BELEGE_ROOT;
  }
}

/**
 * Liefert den YYYY/MM-Sub-Pfad innerhalb des Belege-Roots für ein Beleg-Datum.
 * Beispiel: '2026-05-05' → '<root>/2026/05'
 */
export function receiptStoragePath(receiptDate: string): string {
  const [yyyy, mm] = receiptDate.split('-');
  return path.join(getBelegeRoot(), yyyy, mm);
}

/**
 * Stellt sicher, dass das Speicherverzeichnis existiert (mkdir -p) und gibt es zurück.
 */
export async function ensureStorageDir(receiptDate: string): Promise<string> {
  const dir = receiptStoragePath(receiptDate);
  await fsp.mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Berechnet SHA-256 (hex) einer Datei via Stream.
 * Für Duplicate-Detection und Audit-Lock.
 */
export async function sha256OfFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk: Buffer | string) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}
