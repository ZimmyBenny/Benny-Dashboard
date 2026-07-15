/**
 * Routes fuer das DJ-Playlisten-Modul.
 *
 * Duenne DJ-Schicht ueber dem Dokumente-Speicher (Muster von documents.routes.ts,
 * spezialisiert auf EINE Datei pro Upload + Metadaten in dj_playlists/dj_playlist_categories).
 * Mounted als zweiter /api/dj-Mount in app.ts (verifyToken ist bereits davor registriert).
 *
 * Siehe docs/superpowers/specs/2026-07-13-dj-playlisten-design.md
 *
 * Sicherheit (Threat T-dk0-01/02/03, siehe PLAN.md threat_model):
 *  - Upload-Allowlist (.xlsx/.xls/.pdf/.html/.htm) via path.extname.toLowerCase + multer
 *    hard-limit 100 MB.
 *  - Dateisystem-Pfade werden AUSSCHLIESSLICH aus dem DB-Baum abgeleitet
 *    (folderFsPath + fileFsName) — nie aus User-Input direkt uebernommen.
 *  - Spiegel-Operationen sind best-effort (syncMirror) — Fehler duerfen die
 *    Hauptoperation nie scheitern lassen.
 *
 * Einzel-CRUD -> kein createBackup (CLAUDE.md-Regel).
 */
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import fsp from 'fs/promises';
import os from 'os';
import db from '../db/connection';
import {
  folderFsPath,
  fileFsName,
  folderMirrorPath,
  fileMirrorName,
  syncMirror,
  moveToTrash,
  getOrCreatePlaylistFolder,
} from '../lib/docFiles';

const router = Router();

interface DocFileRow {
  id: number;
  folder_id: number;
  filename: string;
  size_bytes: number;
  mime_type: string | null;
}

const PLAYLIST_JOIN_SELECT = `
  SELECT p.id, p.title, p.category_id, c.name AS category_name,
         p.doc_file_id, df.filename, df.mime_type, df.size_bytes,
         p.created_at, p.updated_at
  FROM dj_playlists p
  JOIN doc_files df ON df.id = p.doc_file_id
  LEFT JOIN dj_playlist_categories c ON c.id = p.category_id
`;

/** Erlaubte Extensions fuer Playlist-Uploads (Threat T-dk0-01). */
const ALLOWED_EXTENSIONS = ['.xlsx', '.xls', '.pdf', '.html', '.htm'];

const TMP_DIR = path.join(os.tmpdir(), 'benny-dj-playlists-tmp');
const upload = multer({
  dest: TMP_DIR,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      cb(new Error(`Nicht erlaubter Dateityp: ${ext}`));
    } else {
      cb(null, true);
    }
  },
});

// ── Kategorien (eigenes Pfad-Praefix /playlist-categories, unkritisch vs. :id) ──

/** GET /api/dj/playlist-categories */
router.get('/playlist-categories', (_req, res) => {
  const rows = db
    .prepare(`SELECT id, name, sort_order, created_at FROM dj_playlist_categories ORDER BY sort_order ASC, name COLLATE NOCASE ASC`)
    .all();
  res.json(rows);
});

/** POST /api/dj/playlist-categories — Body: { name }. */
router.post('/playlist-categories', (req, res) => {
  const { name } = (req.body ?? {}) as { name?: string };
  const trimmed = (name ?? '').trim();
  if (trimmed.length === 0) {
    res.status(400).json({ error: 'Name darf nicht leer sein' });
    return;
  }
  const info = db
    .prepare(`INSERT INTO dj_playlist_categories (name) VALUES (?)`)
    .run(trimmed);
  const row = db
    .prepare(`SELECT id, name, sort_order, created_at FROM dj_playlist_categories WHERE id = ?`)
    .get(info.lastInsertRowid);
  res.status(201).json(row);
});

/** PATCH /api/dj/playlist-categories/:id — Body: { name?, sort_order? }. */
router.patch('/playlist-categories/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'Ungueltige Kategorie-ID' });
    return;
  }
  const existing = db.prepare(`SELECT id FROM dj_playlist_categories WHERE id = ?`).get(id);
  if (!existing) {
    res.status(404).json({ error: 'Kategorie nicht gefunden' });
    return;
  }
  const { name, sort_order } = (req.body ?? {}) as { name?: string; sort_order?: number };
  if (name !== undefined) {
    const trimmed = name.trim();
    if (trimmed.length === 0) {
      res.status(400).json({ error: 'Name darf nicht leer sein' });
      return;
    }
    db.prepare(`UPDATE dj_playlist_categories SET name = ? WHERE id = ?`).run(trimmed, id);
  }
  if (sort_order !== undefined) {
    db.prepare(`UPDATE dj_playlist_categories SET sort_order = ? WHERE id = ?`).run(sort_order, id);
  }
  const row = db
    .prepare(`SELECT id, name, sort_order, created_at FROM dj_playlist_categories WHERE id = ?`)
    .get(id);
  res.json(row);
});

/** DELETE /api/dj/playlist-categories/:id — Playlists werden "Ohne Kategorie" (SET NULL). */
router.delete('/playlist-categories/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'Ungueltige Kategorie-ID' });
    return;
  }
  const existing = db.prepare(`SELECT id FROM dj_playlist_categories WHERE id = ?`).get(id);
  if (!existing) {
    res.status(404).json({ error: 'Kategorie nicht gefunden' });
    return;
  }
  db.prepare(`DELETE FROM dj_playlist_categories WHERE id = ?`).run(id);
  res.json({ ok: true });
});

// ── Playlists ────────────────────────────────────────────────────────────────

/** GET /api/dj/playlists */
router.get('/playlists', (_req, res) => {
  const rows = db.prepare(`${PLAYLIST_JOIN_SELECT} ORDER BY p.id DESC`).all();
  res.json(rows);
});

/**
 * POST /api/dj/playlists — multipart, EINE Datei pro Request (Frontend loopt
 * bei Mehrfach-Auswahl). Body: title (Pflicht), category_id? (leer -> NULL).
 */
router.post('/playlists', upload.single('file'), async (req, res) => {
  const file = req.file;
  const { title, category_id } = (req.body ?? {}) as { title?: string; category_id?: string };

  if (!file) {
    res.status(400).json({ error: 'Keine Datei hochgeladen' });
    return;
  }
  const trimmedTitle = (title ?? '').trim();
  if (trimmedTitle.length === 0) {
    await fsp.unlink(file.path).catch(() => undefined);
    res.status(400).json({ error: 'Anzeigename darf nicht leer sein' });
    return;
  }

  const categoryId =
    category_id !== undefined && category_id !== '' && category_id !== 'null'
      ? parseInt(category_id, 10)
      : null;
  if (categoryId !== null && !Number.isFinite(categoryId)) {
    await fsp.unlink(file.path).catch(() => undefined);
    res.status(400).json({ error: 'Ungueltige category_id' });
    return;
  }

  const folderId = getOrCreatePlaylistFolder();
  const { absolute: folderAbs } = folderFsPath(folderId);
  await fsp.mkdir(folderAbs, { recursive: true });

  // Namens-Kollision -> " (2)", " (3)" ... anhaengen (analog documents.routes.ts POST /files)
  let dbFilename = file.originalname;
  const ext = path.extname(file.originalname);
  const base = path.basename(file.originalname, ext);
  let suffix = 1;
  while (
    db.prepare(`SELECT id FROM doc_files WHERE folder_id = ? AND filename = ?`).get(folderId, dbFilename)
  ) {
    suffix++;
    dbFilename = `${base} (${suffix})${ext}`;
  }

  const fsName = fileFsName(dbFilename);
  const finalPath = path.join(folderAbs, fsName);
  await fsp.rename(file.path, finalPath);

  const tx = db.transaction(() => {
    const docFileInfo = db
      .prepare(`INSERT INTO doc_files (folder_id, filename, size_bytes, mime_type) VALUES (?, ?, ?, ?)`)
      .run(folderId, dbFilename, file.size, file.mimetype);
    const docFileId = docFileInfo.lastInsertRowid as number;

    const playlistInfo = db
      .prepare(`INSERT INTO dj_playlists (title, category_id, doc_file_id) VALUES (?, ?, ?)`)
      .run(trimmedTitle, categoryId, docFileId);

    return { docFileId, playlistId: playlistInfo.lastInsertRowid as number };
  });
  const { playlistId } = tx();

  await syncMirror(async (mirrorRoot) => {
    const { relative } = folderMirrorPath(folderId);
    const mirrorDir = path.join(mirrorRoot, relative);
    await fsp.mkdir(mirrorDir, { recursive: true });
    await fsp.copyFile(finalPath, path.join(mirrorDir, fileMirrorName(dbFilename)));
  });

  const row = db.prepare(`${PLAYLIST_JOIN_SELECT} WHERE p.id = ?`).get(playlistId);
  res.status(201).json(row);
});

/** PATCH /api/dj/playlists/:id — Body: { title?, category_id? } (category_id null erlaubt). */
router.patch('/playlists/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'Ungueltige Playlist-ID' });
    return;
  }
  const existing = db.prepare(`SELECT id FROM dj_playlists WHERE id = ?`).get(id);
  if (!existing) {
    res.status(404).json({ error: 'Playlist nicht gefunden' });
    return;
  }

  const { title, category_id } = (req.body ?? {}) as { title?: string; category_id?: number | null };

  if (title !== undefined) {
    const trimmed = title.trim();
    if (trimmed.length === 0) {
      res.status(400).json({ error: 'Anzeigename darf nicht leer sein' });
      return;
    }
    db.prepare(`UPDATE dj_playlists SET title = ?, updated_at = datetime('now') WHERE id = ?`).run(trimmed, id);
  }
  if (category_id !== undefined) {
    db.prepare(`UPDATE dj_playlists SET category_id = ?, updated_at = datetime('now') WHERE id = ?`).run(
      category_id,
      id,
    );
  }

  const row = db.prepare(`${PLAYLIST_JOIN_SELECT} WHERE p.id = ?`).get(id);
  res.json(row);
});

/**
 * DELETE /api/dj/playlists/:id — analog documents.routes.ts DELETE /files/:id:
 * doc_files-Row loeschen (dj_playlists faellt per CASCADE), Datei in Trash.
 */
router.delete('/playlists/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'Ungueltige Playlist-ID' });
    return;
  }
  const playlist = db
    .prepare(`SELECT id, doc_file_id FROM dj_playlists WHERE id = ?`)
    .get(id) as { id: number; doc_file_id: number } | undefined;
  if (!playlist) {
    res.status(404).json({ error: 'Playlist nicht gefunden' });
    return;
  }

  const file = db.prepare(`SELECT * FROM doc_files WHERE id = ?`).get(playlist.doc_file_id) as
    | DocFileRow
    | undefined;
  if (!file) {
    // doc_files-Row fehlt bereits -> nur Playlist-Zeile aufraeumen
    db.prepare(`DELETE FROM dj_playlists WHERE id = ?`).run(id);
    res.json({ ok: true });
    return;
  }

  const { absolute: folderAbs } = folderFsPath(file.folder_id);
  const fsName = fileFsName(file.filename);
  const absPath = path.join(folderAbs, fsName);
  const mirrorRel = folderMirrorPath(file.folder_id).relative;
  const mirrorName = fileMirrorName(file.filename);

  // DELETE doc_files -> dj_playlists faellt per ON DELETE CASCADE
  db.prepare(`DELETE FROM doc_files WHERE id = ?`).run(file.id);

  try {
    if (fs.existsSync(absPath)) {
      await moveToTrash(absPath);
    }
  } catch (err) {
    console.warn('[dj:playlists] Trash-Move fehlgeschlagen:', (err as Error).message);
  }

  await syncMirror(async (mirrorRoot) => {
    const mirrorPath = path.join(mirrorRoot, mirrorRel, mirrorName);
    await fsp.rm(mirrorPath, { force: true });
  });

  res.json({ ok: true });
});

export default router;
