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
 * Stellt sicher, dass unter dem geschuetzten Top-Ordner "Verträge & Fristen"
 * ein Bereichs-Unterordner (z. B. "DJ", "Amazon", "Privat", "Sonstiges") existiert,
 * und gibt dessen id zurueck. Idempotent (mehrfacher Aufruf legt nie doppelt an;
 * UNIQUE(parent_id,name) schuetzt zusaetzlich).
 *
 * area wird 1:1 als sichtbarer Ordnername verwendet (getrimmt), leer/unbekannt
 * faellt auf 'Sonstiges' zurueck — contracts_and_deadlines.area kann live weitere
 * Werte enthalten als die vier geseedeten Unterordner.
 */
export function getOrCreateContractAreaFolder(area: string): number {
  const areaName = (area ?? '').trim() || 'Sonstiges';

  let top = db
    .prepare(`SELECT id FROM doc_folders WHERE parent_id IS NULL AND name = 'Verträge & Fristen'`)
    .get() as { id: number } | undefined;

  if (!top) {
    const info = db
      .prepare(
        `INSERT INTO doc_folders (parent_id, name, is_area_root, area_slug)
         VALUES (NULL, 'Verträge & Fristen', 1, 'vertraege-fristen')`,
      )
      .run();
    top = { id: info.lastInsertRowid as number };
  }

  let sub = db
    .prepare(`SELECT id FROM doc_folders WHERE parent_id = ? AND name = ?`)
    .get(top.id, areaName) as { id: number } | undefined;

  if (!sub) {
    const info = db
      .prepare(
        `INSERT INTO doc_folders (parent_id, name, is_area_root, area_slug) VALUES (?, ?, 0, NULL)`,
      )
      .run(top.id, areaName);
    const newId = info.lastInsertRowid as number;

    // App-Speicher-Ordner anlegen (Quelle der Wahrheit)
    try {
      fs.mkdirSync(folderFsPath(newId).absolute, { recursive: true });
    } catch (err) {
      console.warn('[dokumente:contracts] App-Speicher-Ordner-Anlage fehlgeschlagen:', (err as Error).message);
    }

    // Spiegel best-effort (synchron, da getOrCreateContractAreaFolder synchron bleibt)
    const mirrorRoot = getMirrorPath();
    if (mirrorRoot !== null) {
      try {
        fs.mkdirSync(path.join(mirrorRoot, folderMirrorPath(newId).relative), { recursive: true });
      } catch (err) {
        console.warn('[dokumente:contracts] Spiegel-Ordner-Anlage fehlgeschlagen:', (err as Error).message);
      }
    }

    sub = { id: newId };
  }

  return sub.id;
}

/**
 * Stellt sicher, dass unter dem DJ-Bereichs-Wurzelordner (is_area_root=1,
 * area_slug='dj', angelegt in Migration 096) ein Unterordner "Playlisten"
 * existiert, und gibt dessen id zurueck. Modelliert nach
 * getOrCreateContractAreaFolder — idempotent, App-Speicher zuerst, Spiegel
 * best-effort.
 */
export function getOrCreatePlaylistFolder(): number {
  const djRoot = db
    .prepare(`SELECT id FROM doc_folders WHERE is_area_root = 1 AND area_slug = 'dj'`)
    .get() as { id: number } | undefined;

  if (!djRoot) {
    throw new Error('DJ-Bereichs-Wurzelordner nicht gefunden (erwartet aus Migration 096)');
  }

  let sub = db
    .prepare(`SELECT id FROM doc_folders WHERE parent_id = ? AND name = 'Playlisten'`)
    .get(djRoot.id) as { id: number } | undefined;

  if (!sub) {
    const info = db
      .prepare(
        `INSERT INTO doc_folders (parent_id, name, is_area_root, area_slug) VALUES (?, 'Playlisten', 0, NULL)`,
      )
      .run(djRoot.id);
    const newId = info.lastInsertRowid as number;

    // App-Speicher-Ordner anlegen (Quelle der Wahrheit)
    try {
      fs.mkdirSync(folderFsPath(newId).absolute, { recursive: true });
    } catch (err) {
      console.warn('[dokumente:playlists] App-Speicher-Ordner-Anlage fehlgeschlagen:', (err as Error).message);
    }

    // Spiegel best-effort (synchron, wie getOrCreateContractAreaFolder)
    const mirrorRoot = getMirrorPath();
    if (mirrorRoot !== null) {
      try {
        fs.mkdirSync(path.join(mirrorRoot, folderMirrorPath(newId).relative), { recursive: true });
      } catch (err) {
        console.warn('[dokumente:playlists] Spiegel-Ordner-Anlage fehlgeschlagen:', (err as Error).message);
      }
    }

    sub = { id: newId };
  }

  return sub.id;
}

/**
 * Stellt sicher, dass unter dem Playlisten-Ordner (getOrCreatePlaylistFolder())
 * ein Unterordner fuer den angegebenen DJ-Namen existiert, und gibt dessen id
 * zurueck. Modelliert nach getOrCreatePlaylistFolder — idempotent (Lookup
 * parent_id=playlistRoot AND name=djName), App-Speicher zuerst, Spiegel
 * best-effort.
 */
export function getOrCreatePlaylistDjFolder(djName: string): number {
  const playlistRootId = getOrCreatePlaylistFolder();
  const trimmedName = djName.trim();

  let sub = db
    .prepare(`SELECT id FROM doc_folders WHERE parent_id = ? AND name = ?`)
    .get(playlistRootId, trimmedName) as { id: number } | undefined;

  if (!sub) {
    const info = db
      .prepare(
        `INSERT INTO doc_folders (parent_id, name, is_area_root, area_slug) VALUES (?, ?, 0, NULL)`,
      )
      .run(playlistRootId, trimmedName);
    const newId = info.lastInsertRowid as number;

    // App-Speicher-Ordner anlegen (Quelle der Wahrheit)
    try {
      fs.mkdirSync(folderFsPath(newId).absolute, { recursive: true });
    } catch (err) {
      console.warn('[dokumente:playlists] DJ-Ordner-Anlage fehlgeschlagen:', (err as Error).message);
    }

    // Spiegel best-effort (synchron, wie getOrCreatePlaylistFolder)
    const mirrorRoot = getMirrorPath();
    if (mirrorRoot !== null) {
      try {
        fs.mkdirSync(path.join(mirrorRoot, folderMirrorPath(newId).relative), { recursive: true });
      } catch (err) {
        console.warn('[dokumente:playlists] DJ-Ordner-Spiegel-Anlage fehlgeschlagen:', (err as Error).message);
      }
    }

    sub = { id: newId };
  }

  return sub.id;
}

/**
 * Verschiebt eine einzelne doc_files-Zeile in einen anderen Ordner
 * (App-Speicher + Spiegel), inkl. Kollisions-Suffix am Ziel. No-op wenn die
 * Datei bereits im Zielordner liegt. Uebernimmt das Muster aus
 * moveContractDocsToArea.
 */
export async function movePlaylistFileToFolder(docFileId: number, targetFolderId: number): Promise<void> {
  const file = db
    .prepare(`SELECT id, folder_id, filename FROM doc_files WHERE id = ?`)
    .get(docFileId) as { id: number; folder_id: number; filename: string } | undefined;
  if (!file) return;
  if (file.folder_id === targetFolderId) return;

  const oldAbsPath = path.join(folderFsPath(file.folder_id).absolute, fileFsName(file.filename));
  const oldMirrorRel = folderMirrorPath(file.folder_id).relative;
  const oldMirrorName = fileMirrorName(file.filename);

  // Kollision am Ziel -> Suffix anhaengen (analog moveContractDocsToArea)
  let targetFilename = file.filename;
  const ext = path.extname(targetFilename);
  const base = path.basename(targetFilename, ext);
  let suffix = 1;
  while (
    db
      .prepare(`SELECT id FROM doc_files WHERE folder_id = ? AND filename = ? AND id != ?`)
      .get(targetFolderId, targetFilename, file.id)
  ) {
    suffix++;
    targetFilename = `${base} (${suffix})${ext}`;
  }

  db.prepare(`UPDATE doc_files SET folder_id = ?, filename = ? WHERE id = ?`).run(
    targetFolderId,
    targetFilename,
    file.id,
  );

  const newFolderAbs = folderFsPath(targetFolderId).absolute;
  const newAbsPath = path.join(newFolderAbs, fileFsName(targetFilename));
  try {
    await fsp.mkdir(newFolderAbs, { recursive: true });
    if (fs.existsSync(oldAbsPath) && oldAbsPath !== newAbsPath) {
      await fsp.rename(oldAbsPath, newAbsPath);
    }
  } catch (err) {
    console.warn('[dokumente:playlists] Datei-Umzug App-Speicher fehlgeschlagen:', (err as Error).message);
  }

  await syncMirror(async (mirrorRoot) => {
    const oldMirrorPath = path.join(mirrorRoot, oldMirrorRel, oldMirrorName);
    const newMirrorPath = path.join(
      mirrorRoot,
      folderMirrorPath(targetFolderId).relative,
      fileMirrorName(targetFilename),
    );
    if (oldMirrorPath !== newMirrorPath) {
      await fsp.mkdir(path.dirname(newMirrorPath), { recursive: true });
      if (fs.existsSync(oldMirrorPath)) {
        await fsp.rename(oldMirrorPath, newMirrorPath);
      }
    }
  });
}

/**
 * Benennt den Unterordner eines DJs unter dem Playlisten-Root um (DB +
 * App-Speicher + Spiegel). No-op wenn kein Ordner existiert (DJ hatte noch
 * keine Datei) oder oldName === newName. Exakt wie documents.routes.ts
 * PATCH /folders/:id (Zeilen 528-570).
 */
export async function renamePlaylistDjFolder(oldName: string, newName: string): Promise<void> {
  const trimmedOld = oldName.trim();
  const trimmedNew = newName.trim();
  if (trimmedOld === trimmedNew) return;

  const playlistRootId = getOrCreatePlaylistFolder();
  const folder = db
    .prepare(`SELECT id FROM doc_folders WHERE parent_id = ? AND name = ?`)
    .get(playlistRootId, trimmedOld) as { id: number } | undefined;
  if (!folder) return;

  // Alte Pfade VOR dem DB-Update ermitteln
  const oldPath = folderFsPath(folder.id);
  const oldMirrorRel = folderMirrorPath(folder.id).relative;

  db.prepare(`UPDATE doc_folders SET name = ? WHERE id = ?`).run(trimmedNew, folder.id);

  const newPath = folderFsPath(folder.id);

  // App-Speicher zuerst (Quelle der Wahrheit)
  try {
    if (oldPath.absolute !== newPath.absolute) {
      await fsp.mkdir(path.dirname(newPath.absolute), { recursive: true });
      if (fs.existsSync(oldPath.absolute)) {
        await fsp.rename(oldPath.absolute, newPath.absolute);
      } else {
        await fsp.mkdir(newPath.absolute, { recursive: true });
      }
    }
  } catch (err) {
    console.warn('[dokumente:playlists] DJ-Ordner-Umbenennen App-Speicher fehlgeschlagen:', (err as Error).message);
  }

  // Spiegel best-effort (Original-Schreibweise)
  await syncMirror(async (mirrorRoot) => {
    const oldMirror = path.join(mirrorRoot, oldMirrorRel);
    const newMirror = path.join(mirrorRoot, folderMirrorPath(folder.id).relative);
    if (oldMirror !== newMirror) {
      await fsp.mkdir(path.dirname(newMirror), { recursive: true });
      if (fs.existsSync(oldMirror)) {
        await fsp.rename(oldMirror, newMirror);
      }
    }
  });
}

/**
 * Entfernt den (leeren) Unterordner eines DJs unter dem Playlisten-Root,
 * sobald keine doc_files mehr darauf verweisen. Best-effort, wirft nie.
 * No-op wenn kein Ordner existiert.
 */
export async function removePlaylistDjFolder(djName: string): Promise<void> {
  try {
    const playlistRootId = getOrCreatePlaylistFolder();
    const trimmedName = djName.trim();
    const folder = db
      .prepare(`SELECT id FROM doc_folders WHERE parent_id = ? AND name = ?`)
      .get(playlistRootId, trimmedName) as { id: number } | undefined;
    if (!folder) return;

    const remaining = db
      .prepare(`SELECT COUNT(*) AS c FROM doc_files WHERE folder_id = ?`)
      .get(folder.id) as { c: number };
    if (remaining.c > 0) return;

    const { absolute } = folderFsPath(folder.id);
    const mirrorRel = folderMirrorPath(folder.id).relative;

    db.prepare(`DELETE FROM doc_folders WHERE id = ?`).run(folder.id);

    try {
      await fsp.rm(absolute, { recursive: true, force: true });
    } catch (err) {
      console.warn('[dokumente:playlists] DJ-Ordner-Entfernen App-Speicher fehlgeschlagen:', (err as Error).message);
    }

    await syncMirror(async (mirrorRoot) => {
      try {
        await fsp.rm(path.join(mirrorRoot, mirrorRel), { recursive: true, force: true });
      } catch (err) {
        console.warn('[dokumente:playlists] DJ-Ordner-Entfernen Spiegel fehlgeschlagen:', (err as Error).message);
      }
    });
  } catch (err) {
    console.warn('[dokumente:playlists] removePlaylistDjFolder fehlgeschlagen:', (err as Error).message);
  }
}

/**
 * Verschiebt die Dokumente eines Vertrags in den Bereichs-Unterordner des
 * neuen Bereichs (z. B. nach Bereich-Wechsel "Sonstiges" -> "Vermietung").
 *
 * Bewegt NUR Dateien, die aktuell in einem Bereichs-Unterordner von
 * "Verträge & Fristen" liegen — manuell woanders einsortierte Dateien
 * bleiben unangetastet. Gibt die Anzahl verschobener Dateien zurueck.
 */
export async function moveContractDocsToArea(contractId: number, newArea: string): Promise<number> {
  const targetFolderId = getOrCreateContractAreaFolder(newArea);

  const files = db
    .prepare(`SELECT id, folder_id, filename FROM doc_files WHERE contract_id = ?`)
    .all(contractId) as { id: number; folder_id: number; filename: string }[];

  let moved = 0;

  for (const file of files) {
    if (file.folder_id === targetFolderId) continue;

    // Nur Dateien in Bereichs-Unterordnern von "Verträge & Fristen" umziehen
    const folder = db
      .prepare(`SELECT parent_id FROM doc_folders WHERE id = ?`)
      .get(file.folder_id) as { parent_id: number | null } | undefined;
    if (!folder || folder.parent_id === null) continue;
    const parent = db
      .prepare(`SELECT parent_id, name FROM doc_folders WHERE id = ?`)
      .get(folder.parent_id) as { parent_id: number | null; name: string } | undefined;
    if (!parent || parent.parent_id !== null || parent.name !== 'Verträge & Fristen') continue;

    const oldAbsPath = path.join(folderFsPath(file.folder_id).absolute, fileFsName(file.filename));
    const oldMirrorRel = folderMirrorPath(file.folder_id).relative;
    const oldMirrorName = fileMirrorName(file.filename);

    // Kollision am Ziel -> Suffix anhaengen (analog documents.routes.ts PATCH /files/:id)
    let targetFilename = file.filename;
    const ext = path.extname(targetFilename);
    const base = path.basename(targetFilename, ext);
    let suffix = 1;
    while (
      db
        .prepare(`SELECT id FROM doc_files WHERE folder_id = ? AND filename = ? AND id != ?`)
        .get(targetFolderId, targetFilename, file.id)
    ) {
      suffix++;
      targetFilename = `${base} (${suffix})${ext}`;
    }

    db.prepare(`UPDATE doc_files SET folder_id = ?, filename = ? WHERE id = ?`).run(
      targetFolderId,
      targetFilename,
      file.id,
    );

    const newFolderAbs = folderFsPath(targetFolderId).absolute;
    const newAbsPath = path.join(newFolderAbs, fileFsName(targetFilename));
    try {
      await fsp.mkdir(newFolderAbs, { recursive: true });
      if (fs.existsSync(oldAbsPath) && oldAbsPath !== newAbsPath) {
        await fsp.rename(oldAbsPath, newAbsPath);
      }
    } catch (err) {
      console.warn('[dokumente:contracts] Bereich-Umzug App-Speicher fehlgeschlagen:', (err as Error).message);
    }

    await syncMirror(async (mirrorRoot) => {
      const oldMirrorPath = path.join(mirrorRoot, oldMirrorRel, oldMirrorName);
      const newMirrorPath = path.join(
        mirrorRoot,
        folderMirrorPath(targetFolderId).relative,
        fileMirrorName(targetFilename),
      );
      if (oldMirrorPath !== newMirrorPath) {
        await fsp.mkdir(path.dirname(newMirrorPath), { recursive: true });
        if (fs.existsSync(oldMirrorPath)) {
          await fsp.rename(oldMirrorPath, newMirrorPath);
        }
      }
    });

    moved++;
  }

  return moved;
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
