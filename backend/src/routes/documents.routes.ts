/**
 * Routes fuer das Dokumente-Modul.
 *
 * Mounted unter `/api/dokumente` (siehe app.ts) — `verifyToken` ist davor
 * registriert, alle Endpunkte sind also auth-protected.
 *
 * Siehe docs/superpowers/specs/2026-07-04-dokumente-modul-design.md
 *
 * Sicherheit (Threat T-jfi-01/02, siehe PLAN.md threat_model):
 *  - Dateisystem-Pfade werden AUSSCHLIESSLICH aus dem DB-Baum abgeleitet
 *    (folderFsPath + fileFsName + sanitizeForFilename) — nie aus User-Input
 *    direkt uebernommen -> kein Path-Traversal.
 *  - Upload: Extension-Blocklist + multer hard-limit 100 MB + Settings-Limit
 *    pro File (max_upload_size_mb, Default 25) -> 413.
 *  - Wurzel-Bereichsordner (is_area_root=1) sind PATCH/DELETE-geschuetzt (403).
 *  - Spiegel-Operationen sind IMMER best-effort (syncMirror) — Fehler duerfen
 *    die Hauptoperation nie scheitern lassen.
 *  - GET /search: LIKE-Wildcards escaped, area_slug grenzt auf Teilbaum ein,
 *    LIMIT 50 je Gruppe (Threat T-kgj-01/02/03, siehe PLAN.md threat_model).
 */
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import fsp from 'fs/promises';
import os from 'os';
import { ZipArchive } from 'archiver';
import db from '../db/connection';
import {
  getMirrorPath,
  folderFsPath,
  fileFsName,
  folderMirrorPath,
  fileMirrorName,
  syncMirror,
  rebuildMirror,
  moveToTrash,
  purgeTrash,
} from '../lib/docFiles';

const router = Router();

/**
 * Ermittelt ob ein Ordner ein Bereichs-Unterordner von "Verträge & Fristen" ist
 * (direktes Kind des geschuetzten Top-Ordners) und liefert dann dessen Namen
 * (=area-String, z. B. "DJ") zurueck, sonst null.
 */
function contractAreaOfFolder(folderId: number): string | null {
  const folder = db
    .prepare(`SELECT id, parent_id, name FROM doc_folders WHERE id = ?`)
    .get(folderId) as { id: number; parent_id: number | null; name: string } | undefined;
  if (!folder || folder.parent_id === null) return null;
  const parent = db
    .prepare(`SELECT id, parent_id, name FROM doc_folders WHERE id = ?`)
    .get(folder.parent_id) as { id: number; parent_id: number | null; name: string } | undefined;
  if (!parent || parent.parent_id !== null || parent.name !== 'Verträge & Fristen') return null;
  return folder.name;
}

interface KvRow {
  value: string;
}

function getSettingNum(key: string, dflt: number): number {
  try {
    const r = db.prepare(`SELECT value FROM app_settings WHERE key = ?`).get(key) as
      | KvRow
      | undefined;
    const n = r ? parseInt(r.value, 10) : NaN;
    return Number.isFinite(n) ? n : dflt;
  } catch {
    return dflt;
  }
}

interface DocFolderRow {
  id: number;
  parent_id: number | null;
  name: string;
  is_area_root: number;
  area_slug: string | null;
  created_at: string;
  file_count: number;
  product_id: number | null;
  product_name: string | null;
}

interface DocFileRow {
  id: number;
  folder_id: number;
  filename: string;
  size_bytes: number;
  mime_type: string | null;
  created_at: string;
}

/** Extension-Blocklist (Executables/Scripts) — der Rest ist erlaubt. */
const BLOCKED_EXTENSIONS = ['.exe', '.bat', '.cmd', '.sh', '.scr', '.com', '.msi', '.js', '.vbs'];

// ── Settings (VOR generischen Routen platziert) ─────────────────────────────

/** GET /api/dokumente/settings */
router.get('/settings', (_req, res) => {
  const budgetRow = db
    .prepare(`SELECT value FROM app_settings WHERE key = 'dokumente_budget_mb'`)
    .get() as KvRow | undefined;
  const mirrorRow = db
    .prepare(`SELECT value FROM app_settings WHERE key = 'dokumente_mirror_path'`)
    .get() as KvRow | undefined;
  const storageRow = db
    .prepare(`SELECT value FROM app_settings WHERE key = 'dokumente_storage_path'`)
    .get() as KvRow | undefined;

  res.json({
    dokumente_budget_mb: budgetRow?.value ?? '1024',
    dokumente_mirror_path: mirrorRow !== undefined ? mirrorRow.value : getMirrorPath() ?? '',
    dokumente_storage_path: storageRow?.value ?? '',
  });
});

/** PATCH /api/dokumente/settings — Bulk-UPSERT. */
router.patch('/settings', (req, res) => {
  const updates = (req.body ?? {}) as Record<string, unknown>;
  if (typeof updates !== 'object' || updates === null) {
    res.status(400).json({ error: 'body must be a key-value object' });
    return;
  }
  const tx = db.transaction(() => {
    for (const [k, v] of Object.entries(updates)) {
      const value = String(v ?? '');
      db.prepare(
        `INSERT INTO app_settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
      ).run(k, value);
    }
  });
  tx();
  res.json({ ok: true });
});

/** GET /api/dokumente/usage */
router.get('/usage', (_req, res) => {
  const row = db
    .prepare(`SELECT COALESCE(SUM(size_bytes), 0) AS total FROM doc_files`)
    .get() as { total: number };
  const budgetMb = getSettingNum('dokumente_budget_mb', 1024);
  res.json({ usedBytes: row.total, budgetMb });
});

/** POST /api/dokumente/mirror-rebuild */
router.post('/mirror-rebuild', async (_req, res) => {
  await rebuildMirror();
  res.json({ ok: true });
});

// ── Suche ────────────────────────────────────────────────────────────────────

/**
 * GET /api/dokumente/search — Volltext-Suche ueber Ordner- und Dateinamen.
 * Query: q (Pflicht, min. 2 Zeichen getrimmt), area_slug (optional, grenzt auf
 * den rekursiven Teilbaum der Bereichs-Wurzel ein). MUSS vor /folders/:id und
 * /files/:id registriert sein, sonst greift der :id-Parameter-Match zuerst.
 */
router.get('/search', (req, res) => {
  const qRaw = (req.query.q as string | undefined) ?? '';
  const q = qRaw.trim();
  const areaSlug = (req.query.area_slug as string | undefined) ?? undefined;

  if (q.length < 2) {
    res.json({ folders: [], files: [] });
    return;
  }

  // Wildcards escapen -> kein LIKE-Wildcard-Injection (Threat T-kgj-01)
  const like = '%' + q.replace(/[%_\\]/g, (c) => '\\' + c) + '%';

  let allowedIds: number[] | null = null;
  if (areaSlug) {
    const root = db
      .prepare(`SELECT id FROM doc_folders WHERE is_area_root = 1 AND area_slug = ?`)
      .get(areaSlug) as { id: number } | undefined;
    if (!root) {
      res.json({ folders: [], files: [] });
      return;
    }
    const rows = db
      .prepare(
        `WITH RECURSIVE sub(id) AS (
           SELECT id FROM doc_folders WHERE id = ?
           UNION ALL
           SELECT f.id FROM doc_folders f JOIN sub ON f.parent_id = sub.id
         ) SELECT id FROM sub`,
      )
      .all(root.id) as Array<{ id: number }>;
    allowedIds = rows.map((r) => r.id);
  }

  // Einmalige Map aller Ordner fuer Pfad-Aufloesung (parent-Kette bis zur Wurzel)
  const allFolders = db
    .prepare(`SELECT id, parent_id, name, is_area_root FROM doc_folders`)
    .all() as Array<{ id: number; parent_id: number | null; name: string; is_area_root: number }>;
  const folderMap = new Map(allFolders.map((f) => [f.id, f]));

  function pathSegments(folderId: number): string[] {
    // Sammelt Namen von folderId bis zur Wurzel (jeweils inkl. is_area_root-Flag)
    // und dreht danach um. Bei Bereichs-Suche (area_slug gesetzt) wird das erste
    // Segment (die Bereichs-Wurzel selbst) weggelassen — man ist dort schon "drin".
    // Bei globaler Suche bleibt der Bereich sichtbar (z. B. "Privat › Rechnungen"),
    // damit klar ist, WO der Treffer liegt.
    const chain: Array<{ name: string; is_area_root: number }> = [];
    let cursor: number | null = folderId;
    let guard = 0;
    while (cursor !== null && guard < 50) {
      guard++;
      const f = folderMap.get(cursor);
      if (!f) break;
      chain.push({ name: f.name, is_area_root: f.is_area_root });
      cursor = f.parent_id;
    }
    chain.reverse();
    if (areaSlug && chain.length > 0 && chain[0].is_area_root === 1) {
      chain.shift();
    }
    return chain.map((c) => c.name);
  }

  let folderSql = `SELECT id, parent_id, name, is_area_root, area_slug, created_at,
      (SELECT COUNT(*) FROM doc_files WHERE folder_id = doc_folders.id) AS file_count,
      product_id, NULL AS product_name
    FROM doc_folders
    WHERE name LIKE ? ESCAPE '\\' COLLATE NOCASE AND is_area_root = 0`;
  const folderParams: unknown[] = [like];
  if (allowedIds) {
    folderSql += ` AND id IN (${allowedIds.map(() => '?').join(',')})`;
    folderParams.push(...allowedIds);
  }
  folderSql += ` ORDER BY name COLLATE NOCASE ASC LIMIT 50`;
  const folderRows = db.prepare(folderSql).all(...folderParams) as DocFolderRow[];

  let fileSql = `SELECT id, folder_id, filename, size_bytes, mime_type, created_at
    FROM doc_files
    WHERE filename LIKE ? ESCAPE '\\' COLLATE NOCASE`;
  const fileParams: unknown[] = [like];
  if (allowedIds) {
    fileSql += ` AND folder_id IN (${allowedIds.map(() => '?').join(',')})`;
    fileParams.push(...allowedIds);
  }
  fileSql += ` ORDER BY filename COLLATE NOCASE ASC LIMIT 50`;
  const fileRows = db.prepare(fileSql).all(...fileParams) as DocFileRow[];

  res.json({
    folders: folderRows.map((f) => ({
      id: f.id,
      name: f.name,
      path: f.parent_id !== null ? pathSegments(f.parent_id) : [],
    })),
    files: fileRows.map((f) => ({
      id: f.id,
      folder_id: f.folder_id,
      filename: f.filename,
      size_bytes: f.size_bytes,
      mime_type: f.mime_type,
      created_at: f.created_at,
      path: pathSegments(f.folder_id),
    })),
  });
});

// ── Tree / Folders ───────────────────────────────────────────────────────────

/** GET /api/dokumente/tree — kompletter Ordnerbaum + Dateizaehler, flach. */
router.get('/tree', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT f.id, f.parent_id, f.name, f.is_area_root, f.area_slug, f.created_at,
              (SELECT COUNT(*) FROM doc_files WHERE folder_id = f.id) AS file_count,
              f.product_id, ap.name AS product_name
       FROM doc_folders f
       LEFT JOIN amazon_products ap ON ap.id = f.product_id
       ORDER BY f.is_area_root DESC, f.name COLLATE NOCASE ASC`,
    )
    .all() as DocFolderRow[];
  res.json(rows);
});

/**
 * GET /api/dokumente/folders/by-product/:productId — alle mit einem Amazon-Produkt
 * verknuepften Ordner inkl. Pfad. MUSS vor /folders/:id registriert sein, sonst
 * matcht der :id-Parameter "by-product" (Threat T-kn6-02).
 */
router.get('/folders/by-product/:productId', (req, res) => {
  const productId = parseInt(req.params.productId, 10);
  if (!Number.isFinite(productId)) {
    res.status(400).json({ error: 'Ungueltige Produkt-ID' });
    return;
  }

  const rows = db
    .prepare(
      `SELECT id, parent_id, name, area_slug FROM doc_folders WHERE product_id = ?
       ORDER BY name COLLATE NOCASE ASC`,
    )
    .all(productId) as Array<{
    id: number;
    parent_id: number | null;
    name: string;
    area_slug: string | null;
  }>;

  const allFolders = db
    .prepare(`SELECT id, parent_id, name, is_area_root FROM doc_folders`)
    .all() as Array<{ id: number; parent_id: number | null; name: string; is_area_root: number }>;
  const folderMap = new Map(allFolders.map((f) => [f.id, f]));

  function pathSegments(folderId: number): string[] {
    // Sammelt Namen von folderId bis zur Wurzel, dreht um, laesst die
    // Bereichs-Wurzel selbst weg (analog GET /search).
    const chain: Array<{ name: string; is_area_root: number }> = [];
    let cursor: number | null = folderId;
    let guard = 0;
    while (cursor !== null && guard < 50) {
      guard++;
      const f = folderMap.get(cursor);
      if (!f) break;
      chain.push({ name: f.name, is_area_root: f.is_area_root });
      cursor = f.parent_id;
    }
    chain.reverse();
    if (chain.length > 0 && chain[0].is_area_root === 1) {
      chain.shift();
    }
    return chain.map((c) => c.name);
  }

  res.json(
    rows.map((f) => ({
      id: f.id,
      name: f.name,
      area_slug: f.area_slug,
      path: f.parent_id !== null ? pathSegments(f.parent_id) : [],
    })),
  );
});

/** GET /api/dokumente/folders/:id — Unterordner + Dateien eines Ordners. */
router.get('/folders/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'Ungueltige Ordner-ID' });
    return;
  }
  const folders = db
    .prepare(
      `SELECT f.id, f.parent_id, f.name, f.is_area_root, f.area_slug, f.created_at,
              (SELECT COUNT(*) FROM doc_files WHERE folder_id = f.id) AS file_count,
              f.product_id, ap.name AS product_name
       FROM doc_folders f
       LEFT JOIN amazon_products ap ON ap.id = f.product_id
       WHERE f.parent_id = ?
       ORDER BY f.name COLLATE NOCASE ASC`,
    )
    .all(id) as DocFolderRow[];
  const files = db
    .prepare(
      `SELECT df.id, df.folder_id, df.filename, df.size_bytes, df.mime_type, df.created_at,
              df.contract_id, c.title AS contract_title
       FROM doc_files df
       LEFT JOIN contracts_and_deadlines c ON c.id = df.contract_id
       WHERE df.folder_id = ? ORDER BY df.filename COLLATE NOCASE ASC`,
    )
    .all(id) as DocFileRow[];

  // Bereichs-Unterordner unter "Verträge & Fristen" (z. B. DJ) blenden verknuepfte
  // Belege read-only ein — die echte GoBD-Belegdatei bleibt im Belege-Modul,
  // hier gibt es KEINE doc_files-Zeile und damit keinen DELETE/PATCH-Pfad.
  const area = contractAreaOfFolder(id);
  let virtualReceipts: Array<{
    receipt_id: number;
    first_file_id: number | null;
    label: string;
    amount_gross_cents: number;
    currency: string;
    readOnly: true;
    openUrl: string | null;
  }> = [];
  if (area !== null) {
    const receiptRows = db
      .prepare(
        `SELECT r.id, r.title, r.supplier_name, r.receipt_date, r.amount_gross_cents, r.currency,
                (SELECT rf.id FROM receipt_files rf WHERE rf.receipt_id = r.id ORDER BY rf.id LIMIT 1) AS first_file_id
         FROM receipts r
         JOIN contracts_and_deadlines c ON c.id = r.contract_id
         WHERE c.area = ? AND r.contract_id IS NOT NULL`,
      )
      .all(area) as Array<{
      id: number;
      title: string | null;
      supplier_name: string | null;
      receipt_date: string;
      amount_gross_cents: number;
      currency: string;
      first_file_id: number | null;
    }>;
    virtualReceipts = receiptRows.map((r) => ({
      receipt_id: r.id,
      first_file_id: r.first_file_id,
      label: `${r.supplier_name ?? r.title ?? 'Beleg'} — ${r.receipt_date}`,
      amount_gross_cents: r.amount_gross_cents,
      currency: r.currency,
      readOnly: true as const,
      openUrl: r.first_file_id !== null ? `/api/belege/${r.id}/file/${r.first_file_id}` : null,
    }));
  }

  res.json({ folders, files, virtualReceipts });
});

/** POST /api/dokumente/folders — Ordner anlegen. Body: { parent_id, name }. */
router.post('/folders', async (req, res) => {
  const { parent_id, name } = (req.body ?? {}) as { parent_id?: number | null; name?: string };
  const trimmedName = (name ?? '').trim();
  if (trimmedName.length === 0) {
    res.status(400).json({ error: 'Name darf nicht leer sein' });
    return;
  }

  // parent_id null/undefined = neuer Bereich auf oberster Ebene (User-Wunsch 2026-07-04,
  // ersetzt die urspruengliche 403-Ablehnung). is_area_root bleibt 0 -> selbst angelegte
  // Bereiche sind umbenenn-/loeschbar, nur die 4 geseedeten sind geschuetzt.
  // Expliziter Duplikat-Check noetig: UNIQUE(parent_id, name) greift nicht bei NULL
  // (SQLite behandelt NULL != NULL).
  const parentIdOrNull = parent_id ?? null;
  if (parentIdOrNull === null) {
    const dup = db
      .prepare(`SELECT id FROM doc_folders WHERE parent_id IS NULL AND name = ?`)
      .get(trimmedName);
    if (dup) {
      res.status(409).json({ error: 'Ein Bereich mit diesem Namen existiert bereits' });
      return;
    }
  }

  try {
    const info = db
      .prepare(`INSERT INTO doc_folders (parent_id, name) VALUES (?, ?)`)
      .run(parentIdOrNull, trimmedName);
    const newId = info.lastInsertRowid as number;

    await syncMirror(async (mirrorRoot) => {
      const { relative } = folderMirrorPath(newId);
      await fsp.mkdir(path.join(mirrorRoot, relative), { recursive: true });
    });
    // App-Speicher-Ordner ebenfalls anlegen
    const { absolute } = folderFsPath(newId);
    await fsp.mkdir(absolute, { recursive: true });

    const row = db
      .prepare(
        `SELECT id, parent_id, name, is_area_root, area_slug, created_at,
                0 AS file_count, NULL AS product_id, NULL AS product_name
         FROM doc_folders WHERE id = ?`,
      )
      .get(newId);
    res.status(201).json(row);
  } catch (err) {
    const message = (err as Error).message;
    if (message.includes('UNIQUE')) {
      res.status(409).json({ error: 'Ein Ordner mit diesem Namen existiert bereits' });
      return;
    }
    throw err;
  }
});

/** PATCH /api/dokumente/folders/:id — umbenennen / verschieben. */
router.patch('/folders/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'Ungueltige Ordner-ID' });
    return;
  }
  const folder = db.prepare(`SELECT * FROM doc_folders WHERE id = ?`).get(id) as
    | DocFolderRow
    | undefined;
  if (!folder) {
    res.status(404).json({ error: 'Ordner nicht gefunden' });
    return;
  }
  if (folder.is_area_root) {
    res.status(403).json({ error: 'Bereichs-Ordner koennen nicht geaendert werden' });
    return;
  }
  if (contractAreaOfFolder(id) !== null) {
    res.status(403).json({ error: 'Dieser Ordner ist geschuetzt und kann nicht geaendert werden' });
    return;
  }

  const { name, parent_id, product_id } = (req.body ?? {}) as {
    name?: string;
    parent_id?: number;
    product_id?: number | null;
  };

  // Zyklus-Schutz: ein Ordner darf nicht in sich selbst oder in einen seiner
  // eigenen Nachkommen verschoben werden (wuerde einen unerreichbaren Zyklus
  // im Ordner-Baum erzeugen und den Mirror-Move in eine Schleife schicken).
  if (parent_id !== undefined) {
    let cycle = parent_id === id;
    let cursor: number | null = parent_id;
    let guard = 0;
    while (!cycle && cursor !== null && guard < 1000) {
      guard++;
      if (cursor === id) {
        cycle = true;
        break;
      }
      const parentRow = db
        .prepare(`SELECT parent_id FROM doc_folders WHERE id = ?`)
        .get(cursor) as { parent_id: number | null } | undefined;
      if (!parentRow) break;
      cursor = parentRow.parent_id;
    }
    if (cycle) {
      res.status(400).json({
        error: 'Ordner kann nicht in sich selbst oder einen seiner Unterordner verschoben werden',
      });
      return;
    }
  }

  // Alte Pfade VOR dem DB-Update ermitteln (beide lesen aus der DB)
  const oldPath = folderFsPath(id);
  const oldMirrorRel = folderMirrorPath(id).relative;

  try {
    const tx = db.transaction(() => {
      if (name !== undefined) {
        const trimmed = name.trim();
        if (trimmed.length === 0) throw new Error('Name darf nicht leer sein');
        db.prepare(`UPDATE doc_folders SET name = ? WHERE id = ?`).run(trimmed, id);
      }
      if (parent_id !== undefined) {
        db.prepare(`UPDATE doc_folders SET parent_id = ? WHERE id = ?`).run(parent_id, id);
      }
      if (product_id !== undefined) {
        db.prepare(`UPDATE doc_folders SET product_id = ? WHERE id = ?`).run(product_id, id);
      }
    });
    tx();

    const newPath = folderFsPath(id);

    // App-Speicher zuerst (Quelle der Wahrheit)
    if (oldPath.absolute !== newPath.absolute) {
      await fsp.mkdir(path.dirname(newPath.absolute), { recursive: true });
      if (fs.existsSync(oldPath.absolute)) {
        await fsp.rename(oldPath.absolute, newPath.absolute);
      } else {
        await fsp.mkdir(newPath.absolute, { recursive: true });
      }
    }

    // Spiegel best-effort (Original-Schreibweise)
    await syncMirror(async (mirrorRoot) => {
      const oldMirror = path.join(mirrorRoot, oldMirrorRel);
      const newMirror = path.join(mirrorRoot, folderMirrorPath(id).relative);
      if (oldMirror !== newMirror) {
        await fsp.mkdir(path.dirname(newMirror), { recursive: true });
        if (fs.existsSync(oldMirror)) {
          await fsp.rename(oldMirror, newMirror);
        }
      }
    });

    const updated = db
      .prepare(
        `SELECT f.id, f.parent_id, f.name, f.is_area_root, f.area_slug, f.created_at,
                (SELECT COUNT(*) FROM doc_files WHERE folder_id = f.id) AS file_count,
                f.product_id, ap.name AS product_name
         FROM doc_folders f
         LEFT JOIN amazon_products ap ON ap.id = f.product_id
         WHERE f.id = ?`,
      )
      .get(id);
    res.json(updated);
  } catch (err) {
    const message = (err as Error).message;
    if (message.includes('UNIQUE')) {
      res.status(409).json({ error: 'Ein Ordner mit diesem Namen existiert bereits' });
      return;
    }
    if (message.includes('Name darf nicht leer sein')) {
      res.status(400).json({ error: message });
      return;
    }
    throw err;
  }
});

/** DELETE /api/dokumente/folders/:id — soft delete (Dateien in Trash, DB-CASCADE). */
router.delete('/folders/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'Ungueltige Ordner-ID' });
    return;
  }
  const folder = db.prepare(`SELECT * FROM doc_folders WHERE id = ?`).get(id) as
    | DocFolderRow
    | undefined;
  if (!folder) {
    res.status(404).json({ error: 'Ordner nicht gefunden' });
    return;
  }
  if (folder.is_area_root) {
    res.status(403).json({ error: 'Bereichs-Ordner koennen nicht geloescht werden' });
    return;
  }
  if (contractAreaOfFolder(id) !== null) {
    res.status(403).json({ error: 'Dieser Ordner ist geschuetzt und kann nicht geloescht werden' });
    return;
  }

  // Rekursiv alle betroffenen Unterordner-IDs (inkl. sich selbst) ermitteln
  const descendantRows = db
    .prepare(
      `WITH RECURSIVE sub(id) AS (
         SELECT id FROM doc_folders WHERE id = ?
         UNION ALL
         SELECT f.id FROM doc_folders f JOIN sub ON f.parent_id = sub.id
       )
       SELECT id FROM sub`,
    )
    .all(id) as Array<{ id: number }>;
  const folderIds = descendantRows.map((r) => r.id);
  const folderCount = folderIds.length - 1; // ohne sich selbst

  const placeholders = folderIds.map(() => '?').join(',');
  const files = db
    .prepare(`SELECT id, folder_id, filename FROM doc_files WHERE folder_id IN (${placeholders})`)
    .all(...folderIds) as Array<{ id: number; folder_id: number; filename: string }>;

  // Alle Dateien in Trash verschieben (best-effort pro Datei)
  for (const file of files) {
    try {
      const { absolute: folderAbs } = folderFsPath(file.folder_id);
      const fsName = fileFsName(file.filename);
      const absFilePath = path.join(folderAbs, fsName);
      if (fs.existsSync(absFilePath)) {
        await moveToTrash(absFilePath);
      }
    } catch (err) {
      console.warn(`[dokumente] Trash-Move fuer Datei ${file.id} fehlgeschlagen:`, (err as Error).message);
    }
  }

  const { absolute } = folderFsPath(id);
  const mirrorRel = folderMirrorPath(id).relative; // vor dem DELETE erfassen (liest DB)

  db.prepare(`DELETE FROM doc_folders WHERE id = ?`).run(id);

  // App-Speicher-Ordner entfernen (Dateien liegen bereits im Trash)
  try {
    if (fs.existsSync(absolute)) {
      await fsp.rm(absolute, { recursive: true, force: true });
    }
  } catch (err) {
    console.warn('[dokumente] App-Speicher-Ordner-Loeschung fehlgeschlagen:', (err as Error).message);
  }

  // Spiegel best-effort
  await syncMirror(async (mirrorRoot) => {
    const mirrorAbs = path.join(mirrorRoot, mirrorRel);
    await fsp.rm(mirrorAbs, { recursive: true, force: true });
  });

  res.json({ ok: true, files: files.length, folders: folderCount });
});

// ── Files ─────────────────────────────────────────────────────────────────

const TMP_DIR = path.join(os.tmpdir(), 'benny-dokumente-tmp');
const upload = multer({
  dest: TMP_DIR,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (BLOCKED_EXTENSIONS.includes(ext)) {
      cb(new Error(`Nicht erlaubter Dateityp: ${ext}`));
    } else {
      cb(null, true);
    }
  },
});

/** POST /api/dokumente/files — Multi-Upload (multipart, Feld 'file'). */
router.post('/files', upload.array('file', 20), async (req, res) => {
  const files = req.files as Express.Multer.File[] | undefined;
  const folderId = parseInt((req.body?.folder_id ?? '') as string, 10);

  if (!files || files.length === 0) {
    res.status(400).json({ error: 'Keine Dateien hochgeladen' });
    return;
  }
  if (!Number.isFinite(folderId)) {
    for (const f of files) await fsp.unlink(f.path).catch(() => undefined);
    res.status(400).json({ error: 'Ungueltige folder_id' });
    return;
  }

  const folder = db.prepare(`SELECT id FROM doc_folders WHERE id = ?`).get(folderId);
  if (!folder) {
    for (const f of files) await fsp.unlink(f.path).catch(() => undefined);
    res.status(404).json({ error: 'Ordner nicht gefunden' });
    return;
  }

  const maxBytes = getSettingNum('max_upload_size_mb', 25) * 1024 * 1024;
  const { absolute: folderAbs } = folderFsPath(folderId);
  await fsp.mkdir(folderAbs, { recursive: true });

  const created: Array<{ id: number; filename: string }> = [];

  for (const file of files) {
    if (file.size > maxBytes) {
      await fsp.unlink(file.path).catch(() => undefined);
      res.status(413).json({
        error: `Datei "${file.originalname}" ueberschreitet ${maxBytes / 1024 / 1024} MB`,
      });
      return;
    }

    // Namens-Kollision -> " (2)", " (3)" ... anhaengen (am DB-Filename, Original bleibt sichtbar)
    let dbFilename = file.originalname;
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext);
    let suffix = 1;
    while (
      db
        .prepare(`SELECT id FROM doc_files WHERE folder_id = ? AND filename = ?`)
        .get(folderId, dbFilename)
    ) {
      suffix++;
      dbFilename = `${base} (${suffix})${ext}`;
    }

    const fsName = fileFsName(dbFilename);
    const finalPath = path.join(folderAbs, fsName);
    await fsp.rename(file.path, finalPath);

    const info = db
      .prepare(
        `INSERT INTO doc_files (folder_id, filename, size_bytes, mime_type) VALUES (?, ?, ?, ?)`,
      )
      .run(folderId, dbFilename, file.size, file.mimetype);
    const newId = info.lastInsertRowid as number;

    await syncMirror(async (mirrorRoot) => {
      const { relative } = folderMirrorPath(folderId);
      const mirrorDir = path.join(mirrorRoot, relative);
      await fsp.mkdir(mirrorDir, { recursive: true });
      await fsp.copyFile(finalPath, path.join(mirrorDir, fileMirrorName(dbFilename)));
    });

    created.push({ id: newId, filename: dbFilename });
  }

  res.status(201).json({ created });
});

/**
 * POST /api/dokumente/files/zip — mehrere Dateien als ZIP herunterladen.
 *
 * WICHTIG: literaler Pfad `/files/zip` MUSS vor `/files/:id`-Routen stehen,
 * sonst wuerde `:id = "zip"` matchen.
 *
 * Body: { ids: number[], filename?: string }.
 * Pfad-Logik identisch zum Einzel-Blob-Endpoint (folderFsPath + fileFsName).
 * Fehlende Dateien werden uebersprungen; leere/ungueltige Liste -> 400.
 */
router.post('/files/zip', (req, res) => {
  const body = (req.body ?? {}) as { ids?: unknown; filename?: unknown };
  const ids = Array.isArray(body.ids)
    ? body.ids.map((v) => Number(v)).filter((n) => Number.isFinite(n))
    : [];
  if (ids.length === 0) {
    res.status(400).json({ error: 'Keine gueltigen Datei-IDs uebergeben' });
    return;
  }

  // Gueltige Dateien mit existierendem Pfad sammeln.
  const files: { absPath: string; entryName: string }[] = [];
  const usedNames = new Set<string>();
  for (const id of ids) {
    const file = db.prepare(`SELECT * FROM doc_files WHERE id = ?`).get(id) as
      | DocFileRow
      | undefined;
    if (!file) continue;
    // Pfad NIE aus User-Input -> ausschliesslich aus DB-Baum abgeleitet (kein Path-Traversal).
    const { absolute: folderAbs } = folderFsPath(file.folder_id);
    const fsName = fileFsName(file.filename);
    const absPath = path.join(folderAbs, fsName);
    if (!fs.existsSync(absPath)) continue;

    // Eintragsname = echter Filename; bei Kollision Zaehler-Praefix.
    let entryName = file.filename.replace(/[/\\]/g, '_') || 'datei';
    if (usedNames.has(entryName)) {
      let n = 2;
      while (usedNames.has(`${n}_${entryName}`)) n++;
      entryName = `${n}_${entryName}`;
    }
    usedNames.add(entryName);
    files.push({ absPath, entryName });
  }

  if (files.length === 0) {
    res.status(400).json({ error: 'Keine der ausgewaehlten Dateien ist verfuegbar' });
    return;
  }

  // ZIP-Name aus optionalem Body (Sonderzeichen bereinigt) oder Default.
  const rawName = typeof body.filename === 'string' && body.filename.trim() ? body.filename.trim() : 'Dokumente.zip';
  const zipName = rawName.toLowerCase().endsWith('.zip') ? rawName : `${rawName}.zip`;
  const asciiZip = zipName.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '') || 'Dokumente.zip';

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="${asciiZip}"; filename*=UTF-8''${encodeURIComponent(zipName)}`,
  );

  const archive = new ZipArchive({ zlib: { level: 9 } });
  archive.on('error', (err) => {
    if (!res.headersSent) res.status(500).json({ error: err.message });
    else {
      try {
        res.destroy();
      } catch {
        /* ignore */
      }
    }
  });
  archive.pipe(res);
  for (const f of files) {
    archive.file(f.absPath, { name: f.entryName });
  }
  archive.finalize();
});

/** GET /api/dokumente/files/:id/blob — Datei ausliefern (Vorschau/Download). */
router.get('/files/:id/blob', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'Ungueltige Datei-ID' });
    return;
  }
  const file = db.prepare(`SELECT * FROM doc_files WHERE id = ?`).get(id) as DocFileRow | undefined;
  if (!file) {
    res.status(404).json({ error: 'Datei nicht gefunden' });
    return;
  }
  // Pfad NIE aus User-Input -> ausschliesslich aus DB-Baum abgeleitet (kein Path-Traversal)
  const { absolute: folderAbs } = folderFsPath(file.folder_id);
  const fsName = fileFsName(file.filename);
  const absPath = path.join(folderAbs, fsName);

  if (!fs.existsSync(absPath)) {
    res.status(404).json({ error: 'Datei fehlt auf dem Dateisystem' });
    return;
  }

  res.setHeader('Content-Type', file.mime_type || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${path.basename(file.filename)}"`);
  fs.createReadStream(absPath).pipe(res);
});

/** PATCH /api/dokumente/files/:id — umbenennen / verschieben. */
router.patch('/files/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'Ungueltige Datei-ID' });
    return;
  }
  const file = db.prepare(`SELECT * FROM doc_files WHERE id = ?`).get(id) as DocFileRow | undefined;
  if (!file) {
    res.status(404).json({ error: 'Datei nicht gefunden' });
    return;
  }

  const { filename, folder_id } = (req.body ?? {}) as { filename?: string; folder_id?: number };

  const oldFolderAbs = folderFsPath(file.folder_id).absolute;
  const oldFsName = fileFsName(file.filename);
  const oldAbsPath = path.join(oldFolderAbs, oldFsName);
  const oldMirrorRel = folderMirrorPath(file.folder_id).relative;
  const oldMirrorName = fileMirrorName(file.filename);

  const targetFolderId = folder_id !== undefined ? folder_id : file.folder_id;
  let targetFilename = filename !== undefined ? filename.trim() : file.filename;
  if (targetFilename.length === 0) {
    res.status(400).json({ error: 'Name darf nicht leer sein' });
    return;
  }

  // Kollision am Ziel -> Suffix anhaengen
  const ext = path.extname(targetFilename);
  const base = path.basename(targetFilename, ext);
  let suffix = 1;
  let candidate = targetFilename;
  while (
    db
      .prepare(`SELECT id FROM doc_files WHERE folder_id = ? AND filename = ? AND id != ?`)
      .get(targetFolderId, candidate, id)
  ) {
    suffix++;
    candidate = `${base} (${suffix})${ext}`;
  }
  targetFilename = candidate;

  db.prepare(`UPDATE doc_files SET folder_id = ?, filename = ? WHERE id = ?`).run(
    targetFolderId,
    targetFilename,
    id,
  );

  const newFolderAbs = folderFsPath(targetFolderId).absolute;
  const newFsName = fileFsName(targetFilename);
  const newAbsPath = path.join(newFolderAbs, newFsName);
  const newMirrorRel = folderMirrorPath(targetFolderId).relative;
  const newMirrorName = fileMirrorName(targetFilename);

  try {
    await fsp.mkdir(newFolderAbs, { recursive: true });
    if (fs.existsSync(oldAbsPath) && oldAbsPath !== newAbsPath) {
      await fsp.rename(oldAbsPath, newAbsPath);
    }
  } catch (err) {
    console.warn('[dokumente] App-Speicher-Datei-Move fehlgeschlagen:', (err as Error).message);
  }

  await syncMirror(async (mirrorRoot) => {
    const oldMirrorPath = path.join(mirrorRoot, oldMirrorRel, oldMirrorName);
    const newMirrorPath = path.join(mirrorRoot, newMirrorRel, newMirrorName);
    if (oldMirrorPath !== newMirrorPath) {
      await fsp.mkdir(path.dirname(newMirrorPath), { recursive: true });
      if (fs.existsSync(oldMirrorPath)) {
        await fsp.rename(oldMirrorPath, newMirrorPath);
      }
    }
  });

  const updated = db.prepare(`SELECT * FROM doc_files WHERE id = ?`).get(id);
  res.json(updated);
});

/** DELETE /api/dokumente/files/:id — soft delete (Trash). */
router.delete('/files/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'Ungueltige Datei-ID' });
    return;
  }
  const file = db.prepare(`SELECT * FROM doc_files WHERE id = ?`).get(id) as DocFileRow | undefined;
  if (!file) {
    res.status(404).json({ error: 'Datei nicht gefunden' });
    return;
  }

  const { absolute: folderAbs } = folderFsPath(file.folder_id);
  const fsName = fileFsName(file.filename);
  const absPath = path.join(folderAbs, fsName);
  const mirrorRel = folderMirrorPath(file.folder_id).relative;
  const mirrorName = fileMirrorName(file.filename);

  db.prepare(`DELETE FROM doc_files WHERE id = ?`).run(id);

  try {
    if (fs.existsSync(absPath)) {
      await moveToTrash(absPath);
    }
  } catch (err) {
    console.warn('[dokumente] Trash-Move fehlgeschlagen:', (err as Error).message);
  }

  await syncMirror(async (mirrorRoot) => {
    const mirrorPath = path.join(mirrorRoot, mirrorRel, mirrorName);
    await fsp.rm(mirrorPath, { force: true });
  });

  res.json({ ok: true });
});

export default router;
export { purgeTrash };
