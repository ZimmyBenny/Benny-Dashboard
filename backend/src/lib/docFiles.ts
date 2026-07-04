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
 * Default-Spiegel-Pfad: <Projektwurzel>/Dokumente — relativ zum Modulpfad
 * aufgeloest (backend/src/lib -> 3 Ebenen hoch), NICHT process.cwd():
 * das Backend laeuft mit cwd=backend/, cwd-basiert landete der Spiegel
 * faelschlich in backend/Dokumente statt im iCloud-Projektordner.
 */
const DEFAULT_MIRROR_PATH = path.resolve(__dirname, '..', '..', '..', 'Dokumente');

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
      return DEFAULT_MIRROR_PATH;
    }
    const v = row.value?.trim();
    return v && v.length > 0 ? v : null;
  } catch {
    return DEFAULT_MIRROR_PATH;
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
 * Minimal-Bereinigung fuer Spiegel-Namen: Original-Schreibweise (Grossschreibung,
 * Umlaute, Leerzeichen) bleibt erhalten — nur echte Verbotszeichen werden ersetzt.
 * Fuer den Finder-Spiegel gedacht; der App-Speicher nutzt weiter sanitizeForFilename.
 */
function mirrorSafeName(name: string, fallback: string): string {
  const cleaned = name
    .replace(/[/\\:*?"<>|\x00-\x1f]/g, '_')
    .replace(/^\.+/, '_') // keine versteckten Namen / Traversal
    .trim()
    .slice(0, 120);
  return cleaned.length > 0 && cleaned !== '..' ? cleaned : fallback;
}

/**
 * Spiegel-Pfad-Segmente eines Ordners: Original-Namen aus der DB
 * (z. B. "Amazon" statt "amazon"), minimal bereinigt.
 */
function folderMirrorSegments(folderId: number): string[] {
  const segments: string[] = [];
  let currentId: number | null = folderId;
  let guard = 0;
  while (currentId !== null && guard < 100) {
    guard++;
    const row = db
      .prepare(`SELECT id, parent_id, name, area_slug FROM doc_folders WHERE id = ?`)
      .get(currentId) as FolderRow | undefined;
    if (!row) break;
    segments.unshift(mirrorSafeName(row.name, row.area_slug ?? `ordner-${row.id}`));
    currentId = row.parent_id;
  }
  return segments;
}

/** Relativer Spiegel-Pfad eines Ordners (Original-Schreibweise). */
export function folderMirrorPath(folderId: number): { relative: string } {
  return { relative: path.join(...folderMirrorSegments(folderId)) };
}

/** Spiegel-Dateiname: Original-Basename (Grossschreibung/Umlaute), Extension unveraendert. */
export function fileMirrorName(dbFilename: string): string {
  const ext = path.extname(dbFilename);
  const base = path.basename(dbFilename, ext);
  return `${mirrorSafeName(base, 'datei')}${ext}`;
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
 * Loescht den Spiegel-Inhalt komplett und baut ihn frisch aus DB + App-Speicher auf.
 * Ordner/Dateien erscheinen im Spiegel mit Original-Schreibweise (mirrorSafeName),
 * waehrend der App-Speicher die sanitisierten Namen behaelt.
 * Repariert manuelle Finder-Eingriffe. Fehler werden geloggt, nie geworfen.
 */
export async function rebuildMirror(): Promise<void> {
  const mirrorRoot = getMirrorPath();
  if (mirrorRoot === null) return;
  try {
    await fsp.rm(mirrorRoot, { recursive: true, force: true });
    await fsp.mkdir(mirrorRoot, { recursive: true });

    const folders = db.prepare(`SELECT id FROM doc_folders`).all() as { id: number }[];
    for (const f of folders) {
      await fsp.mkdir(path.join(mirrorRoot, folderMirrorPath(f.id).relative), {
        recursive: true,
      });
    }

    const files = db
      .prepare(`SELECT id, folder_id, filename FROM doc_files`)
      .all() as { id: number; folder_id: number; filename: string }[];
    for (const file of files) {
      const src = path.join(folderFsPath(file.folder_id).absolute, fileFsName(file.filename));
      if (!fs.existsSync(src)) continue;
      const dest = path.join(
        mirrorRoot,
        folderMirrorPath(file.folder_id).relative,
        fileMirrorName(file.filename),
      );
      await fsp.copyFile(src, dest);
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
