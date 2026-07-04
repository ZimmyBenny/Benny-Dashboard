import os from 'os';
import path from 'path';
import fs from 'fs';
import fsp from 'fs/promises';
import db from '../db/connection';
import { sanitizeForFilename } from './filenames';

/**
 * Datei- und Pfad-Helper fuer das Dokumente-Modul.
 *
 * Speicherort-Logik (analog lib/files.ts / Belege):
 *  - App-Speicher ist Quelle der Wahrheit: `getDokumenteRoot()`
 *    (Setting `dokumente_storage_path`, leer -> DEFAULT_DOKUMENTE_ROOT)
 *  - Zusaetzlich einseitiger best-effort Spiegel nach `getMirrorPath()`
 *    (Setting `dokumente_mirror_path`; Key fehlt -> Default-Projektordner,
 *    Key vorhanden aber leer -> Spiegel AUS)
 *
 * WICHTIG: NIEMALS App-Speicher in iCloud Drive (bird daemon File-Locks) —
 * der Spiegel-Pfad DARF in iCloud liegen (das ist sein Zweck).
 */

interface KvRow {
  value: string;
}

/** Default-Speicherort (ausserhalb iCloud). */
export const DEFAULT_DOKUMENTE_ROOT = path.join(
  os.homedir(),
  '.local',
  'share',
  'benny-dashboard',
  'dokumente',
);

/**
 * Liefert den konfigurierten Dokumente-Root.
 * - Liest app_settings.dokumente_storage_path; falls leer/whitespace -> DEFAULT.
 */
export function getDokumenteRoot(): string {
  try {
    const row = db
      .prepare(`SELECT value FROM app_settings WHERE key = 'dokumente_storage_path'`)
      .get() as KvRow | undefined;
    const v = row?.value?.trim();
    return v && v.length > 0 ? v : DEFAULT_DOKUMENTE_ROOT;
  } catch {
    return DEFAULT_DOKUMENTE_ROOT;
  }
}

/**
 * Liefert den Spiegel-Pfad (iCloud Dokumente-Ordner) oder null wenn deaktiviert.
 * - Key `dokumente_mirror_path` existiert nicht in app_settings -> Default (Projektordner/Dokumente)
 * - Key existiert, ist aber leer/whitespace -> null (Spiegel AUS, User-Entscheidung)
 * - Key existiert mit Wert -> dieser Pfad
 */
export function getMirrorPath(): string | null {
  try {
    const row = db
      .prepare(`SELECT value FROM app_settings WHERE key = 'dokumente_mirror_path'`)
      .get() as KvRow | undefined;
    if (row === undefined) {
      return path.join(process.cwd(), 'Dokumente');
    }
    const v = row.value?.trim();
    return v && v.length > 0 ? v : null;
  } catch {
    return path.join(process.cwd(), 'Dokumente');
  }
}

interface FolderRow {
  id: number;
  parent_id: number | null;
  name: string;
  area_slug: string | null;
}

/**
 * Leitet die Pfad-Segmente (sanitisiert) eines Ordners aus dem DB-Baum ab —
 * rekursiv parent_id hochlaufen. Wurzel-Segment = area_slug.
 */
function folderSegments(folderId: number): string[] {
  const segments: string[] = [];
  let currentId: number | null = folderId;
  let guard = 0;
  while (currentId !== null && guard < 100) {
    guard++;
    const row = db
      .prepare(`SELECT id, parent_id, name, area_slug FROM doc_folders WHERE id = ?`)
      .get(currentId) as FolderRow | undefined;
    if (!row) break;
    if (row.parent_id === null) {
      // Wurzel: area_slug ist der Ordnername im Dateisystem
      segments.unshift(row.area_slug ?? sanitizeForFilename(row.name, 60));
    } else {
      segments.unshift(sanitizeForFilename(row.name, 60));
    }
    currentId = row.parent_id;
  }
  return segments;
}

/**
 * Leitet den Dateisystem-Pfad eines Ordners aus dem DB-Baum ab.
 * Rueckgabe: relativer Pfad (Segmente ab Wurzel) und absoluter Pfad unter getDokumenteRoot().
 */
export function folderFsPath(folderId: number): { relative: string; absolute: string } {
  const segments = folderSegments(folderId);
  const relative = path.join(...segments);
  const absolute = path.join(getDokumenteRoot(), relative);
  return { relative, absolute };
}

/**
 * Sanitisiert den Basename einer Datei fuer das Dateisystem, behaelt die
 * Original-Extension (unslugged) bei damit z.B. .pdf erhalten bleibt.
 */
export function fileFsName(dbFilename: string): string {
  const ext = path.extname(dbFilename);
  const base = path.basename(dbFilename, ext);
  const slugBase = sanitizeForFilename(base, 80) || 'datei';
  return `${slugBase}${ext.toLowerCase()}`;
}

/**
 * Fuehrt eine Spiegel-Operation best-effort aus — Fehler werden geloggt,
 * NIE geworfen (Spiegel-Fehler duerfen die Hauptoperation nie scheitern lassen).
 * No-op wenn getMirrorPath() === null (Spiegel AUS).
 */
export async function syncMirror(fn: (mirrorRoot: string) => Promise<void>): Promise<void> {
  const mirrorRoot = getMirrorPath();
  if (mirrorRoot === null) return;
  try {
    await fn(mirrorRoot);
  } catch (err) {
    console.warn('[dokumente:mirror] Spiegel-Operation fehlgeschlagen:', (err as Error).message);
  }
}

/**
 * Loescht den Spiegel-Inhalt komplett und kopiert den App-Speicher-Baum frisch.
 * Repariert manuelle Finder-Eingriffe. Fehler werden geloggt, nie geworfen.
 */
export async function rebuildMirror(): Promise<void> {
  const mirrorRoot = getMirrorPath();
  if (mirrorRoot === null) return;
  try {
    const appRoot = getDokumenteRoot();
    await fsp.rm(mirrorRoot, { recursive: true, force: true });
    await fsp.mkdir(mirrorRoot, { recursive: true });
    if (fs.existsSync(appRoot)) {
      await fsp.cp(appRoot, mirrorRoot, { recursive: true });
    }
    console.log('[dokumente:mirror] Spiegel neu aufgebaut:', mirrorRoot);
  } catch (err) {
    console.warn('[dokumente:mirror] rebuildMirror fehlgeschlagen:', (err as Error).message);
  }
}

/**
 * Verschiebt eine Datei in den Trash (.trash/<timestamp>_<basename>) statt
 * sie hart zu loeschen (Datensicherheits-Regel, soft-delete).
 */
export async function moveToTrash(absFilePath: string): Promise<void> {
  const trashDir = path.join(getDokumenteRoot(), '.trash');
  await fsp.mkdir(trashDir, { recursive: true });
  const basename = path.basename(absFilePath);
  const dest = path.join(trashDir, `${Date.now()}_${basename}`);
  await fsp.rename(absFilePath, dest);
}

/**
 * Server-Startup-Sweep: entfernt Trash-Eintraege aelter als maxAgeDays.
 * Try/catch pro Eintrag, wirft nie (Server darf nie deswegen crashen).
 */
export async function purgeTrash(maxAgeDays = 30): Promise<void> {
  const trashDir = path.join(getDokumenteRoot(), '.trash');
  try {
    if (!fs.existsSync(trashDir)) return;
    const entries = await fsp.readdir(trashDir);
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    for (const entry of entries) {
      try {
        const match = entry.match(/^(\d+)_/);
        if (!match) continue;
        const ts = parseInt(match[1], 10);
        if (Number.isFinite(ts) && ts < cutoff) {
          await fsp.rm(path.join(trashDir, entry), { recursive: true, force: true });
        }
      } catch (err) {
        console.warn(`[dokumente:trash] purge failed for "${entry}":`, (err as Error).message);
      }
    }
  } catch (err) {
    console.warn('[dokumente:trash] purgeTrash failed:', (err as Error).message);
  }
}
