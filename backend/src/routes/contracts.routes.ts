import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import os from 'os';
import fs from 'fs';
import fsp from 'fs/promises';
import { execFile } from 'child_process';
import db from '../db/connection';
import {
  getOrCreateContractAreaFolder,
  folderFsPath,
  fileFsName,
  folderMirrorPath,
  fileMirrorName,
  syncMirror,
  moveToTrash,
} from '../lib/docFiles';

// ── Upload-Speicher ────────────────────────────────────────────────────────────
// VERTRAEGE_DIR bleibt fuer den Alt-Download-Fallback (contracts_and_deadlines_attachments,
// Rueckfallebene) — der POST-Upload schreibt seit dieser Umstellung nicht mehr hierhin,
// sondern via getOrCreateContractAreaFolder in den Dokumente-Speicher.

const VERTRAEGE_DIR = path.join(os.homedir(), '.local', 'share', 'benny-dashboard', 'vertraege');
if (!fs.existsSync(VERTRAEGE_DIR)) fs.mkdirSync(VERTRAEGE_DIR, { recursive: true });

// Temporaerer Upload-Ordner (analog documents.routes.ts TMP_DIR) — Datei landet danach
// per fsp.rename im Dokumente-Speicher, nicht mehr in VERTRAEGE_DIR.
const TMP_UPLOAD_DIR = path.join(os.tmpdir(), 'benny-contracts-tmp');
const upload = multer({ dest: TMP_UPLOAD_DIR, limits: { fileSize: 50 * 1024 * 1024 } });

const router = Router();

// ---------------------------------------------------------------------------
// SQL für berechnete Kündigungsfenster-Felder
// ---------------------------------------------------------------------------
const COMPUTED_FIELDS_SQL = `,
  CASE WHEN auto_renews = 1 AND cost_interval = 'jaehrlich' AND start_date IS NOT NULL THEN
    date(
      CASE WHEN strftime('%m-%d', 'now') <= strftime('%m-%d', start_date)
        THEN strftime('%Y', 'now') || '-' || strftime('%m-%d', start_date)
        ELSE (CAST(strftime('%Y', 'now') AS INTEGER) + 1) || '-' || strftime('%m-%d', start_date) END
    )
  ELSE NULL END AS next_anniversary_date,
  CASE WHEN auto_renews = 1 AND cost_interval = 'jaehrlich' AND start_date IS NOT NULL THEN
    CAST(julianday(
      date(
        CASE WHEN strftime('%m-%d', 'now') <= strftime('%m-%d', start_date)
          THEN strftime('%Y', 'now') || '-' || strftime('%m-%d', start_date)
          ELSE (CAST(strftime('%Y', 'now') AS INTEGER) + 1) || '-' || strftime('%m-%d', start_date) END
      )
    ) - julianday(date('now')) AS INTEGER)
  ELSE NULL END AS days_to_anniversary,
  CASE WHEN auto_renews = 1 AND cost_interval = 'jaehrlich' AND start_date IS NOT NULL THEN
    date(
      CASE WHEN strftime('%m-%d', 'now') <= strftime('%m-%d', start_date)
        THEN strftime('%Y', 'now') || '-' || strftime('%m-%d', start_date)
        ELSE (CAST(strftime('%Y', 'now') AS INTEGER) + 1) || '-' || strftime('%m-%d', start_date) END,
      '-56 days')
  ELSE NULL END AS auto_reminder_date,
  CASE WHEN auto_renews = 1 AND cost_interval = 'jaehrlich' AND start_date IS NOT NULL THEN
    date(
      CASE WHEN strftime('%m-%d', 'now') <= strftime('%m-%d', start_date)
        THEN strftime('%Y', 'now') || '-' || strftime('%m-%d', start_date)
        ELSE (CAST(strftime('%Y', 'now') AS INTEGER) + 1) || '-' || strftime('%m-%d', start_date) END,
      '-' || (cancellation_notice_weeks * 7) || ' days')
  ELSE NULL END AS cancellation_deadline,
  /* ── Bestehende Felder unverändert beibehalten (für Rückwärtskompatibilität) ── */
  CASE WHEN auto_renews = 1 AND cost_interval = 'jaehrlich' AND start_date IS NOT NULL THEN
    date(
      CASE WHEN strftime('%m-%d', 'now') <= strftime('%m-%d', start_date)
        THEN strftime('%Y', 'now') || '-' || strftime('%m-%d', start_date)
        ELSE (CAST(strftime('%Y', 'now') AS INTEGER) + 1) || '-' || strftime('%m-%d', start_date) END,
      '-' || (cancellation_notice_weeks * 7) || ' days')
  ELSE NULL END AS cancellation_window_end,
  CASE WHEN auto_renews = 1 AND cost_interval = 'jaehrlich' AND start_date IS NOT NULL THEN
    date(
      CASE WHEN strftime('%m-%d', 'now') <= strftime('%m-%d', start_date)
        THEN strftime('%Y', 'now') || '-' || strftime('%m-%d', start_date)
        ELSE (CAST(strftime('%Y', 'now') AS INTEGER) + 1) || '-' || strftime('%m-%d', start_date) END,
      '-' || (cancellation_notice_weeks * 7 + 14) || ' days')
  ELSE NULL END AS cancellation_window_start,
  CASE
    WHEN auto_renews = 1 AND cost_interval = 'jaehrlich' AND start_date IS NOT NULL
      AND date('now') >= date(
        CASE WHEN strftime('%m-%d', 'now') <= strftime('%m-%d', start_date)
          THEN strftime('%Y', 'now') || '-' || strftime('%m-%d', start_date)
          ELSE (CAST(strftime('%Y', 'now') AS INTEGER) + 1) || '-' || strftime('%m-%d', start_date) END,
        '-' || (cancellation_notice_weeks * 7 + 14) || ' days')
      AND date('now') <= date(
        CASE WHEN strftime('%m-%d', 'now') <= strftime('%m-%d', start_date)
          THEN strftime('%Y', 'now') || '-' || strftime('%m-%d', start_date)
          ELSE (CAST(strftime('%Y', 'now') AS INTEGER) + 1) || '-' || strftime('%m-%d', start_date) END,
        '-' || (cancellation_notice_weeks * 7) || ' days')
    THEN 1
    ELSE 0
  END AS is_in_cancellation_window,
  CASE WHEN auto_renews = 1 AND cost_interval = 'jaehrlich' AND start_date IS NOT NULL THEN
    CAST(julianday(
      date(
        CASE WHEN strftime('%m-%d', 'now') <= strftime('%m-%d', start_date)
          THEN strftime('%Y', 'now') || '-' || strftime('%m-%d', start_date)
          ELSE (CAST(strftime('%Y', 'now') AS INTEGER) + 1) || '-' || strftime('%m-%d', start_date) END,
        '-' || (cancellation_notice_weeks * 7 + 14) || ' days')
    ) - julianday(date('now')) AS INTEGER)
  ELSE NULL END AS days_until_cancellation_window`;

// ---------------------------------------------------------------------------
// Hilfsfunktion: Detail laden (Eintrag + Activity Log)
// ---------------------------------------------------------------------------
function loadDetail(id: number) {
  const item = db.prepare(`SELECT * ${COMPUTED_FIELDS_SQL} FROM contracts_and_deadlines WHERE id = ?`).get(id);
  if (!item) return null;
  const activity_log = db.prepare(
    `SELECT * FROM contracts_and_deadlines_activity_log WHERE item_id = ? ORDER BY created_at DESC LIMIT 50`
  ).all(id);
  return { ...(item as object), activity_log };
}

// ---------------------------------------------------------------------------
// GET / — Liste mit Query-Params
// ---------------------------------------------------------------------------
router.get('/', (req, res) => {
  const {
    search, item_type, area, status, priority,
    segment = 'all',
    limit: limitStr = '50',
    offset: offsetStr = '0',
  } = req.query as Record<string, string | undefined>;

  const limitNum = Math.min(200, Math.max(1, parseInt(limitStr ?? '50', 10)));
  const offsetNum = Math.max(0, parseInt(offsetStr ?? '0', 10));

  const conditions: string[] = [];
  const params: (string | number)[] = [];

  // Segment-Filter
  if (segment === 'soon') {
    conditions.push(`expiration_date BETWEEN date('now') AND date('now', '+30 days')`);
    conditions.push(`status = 'aktiv'`);
    conditions.push(`is_archived = 0`);
    conditions.push(`unbefristet = 0`);
  } else if (segment === 'overdue') {
    conditions.push(`expiration_date < date('now')`);
    conditions.push(`status = 'aktiv'`);
    conditions.push(`is_archived = 0`);
    conditions.push(`unbefristet = 0`);
  } else if (segment === 'cancellable') {
    conditions.push(`auto_renews = 1`);
    conditions.push(`cost_interval = 'jaehrlich'`);
    conditions.push(`start_date IS NOT NULL`);
    conditions.push(`status = 'aktiv'`);
    conditions.push(`is_archived = 0`);
    // Im Fenster: heute <= anniversary-Datum UND anniversary-heute <= 56 Tage
    conditions.push(`CAST(julianday(
      date(CASE WHEN strftime('%m-%d','now') <= strftime('%m-%d',start_date)
        THEN strftime('%Y','now') || '-' || strftime('%m-%d',start_date)
        ELSE (CAST(strftime('%Y','now') AS INTEGER) + 1) || '-' || strftime('%m-%d',start_date) END)
    ) - julianday(date('now')) AS INTEGER) BETWEEN 0 AND 56`);
  } else if (segment === 'archive') {
    conditions.push(`is_archived = 1`);
  } else if (segment === 'gesamt') {
    // alle Einträge — kein is_archived-Filter
  } else if (segment === 'unbefristet') {
    conditions.push(`unbefristet = 1`);
    conditions.push(`is_archived = 0`);
  } else {
    // 'all'
    conditions.push(`is_archived = 0`);
  }

  // Optionale Zusatzfilter (nur wenn kein Segment-Status-Filter bereits gesetzt)
  if (item_type) { conditions.push(`item_type = ?`); params.push(item_type); }
  if (area) { conditions.push(`area = ?`); params.push(area); }
  if (status && (segment === 'all' || segment === 'gesamt')) { conditions.push(`status = ?`); params.push(status); }
  if (priority) { conditions.push(`priority = ?`); params.push(priority); }

  if (search) {
    const like = `%${search}%`;
    conditions.push(`(title LIKE ? OR provider_name LIKE ? OR reference_number LIKE ? OR tags LIKE ? OR description LIKE ? OR notes LIKE ?)`);
    params.push(like, like, like, like, like, like);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const totalRow = db.prepare(
    `SELECT COUNT(*) AS total FROM contracts_and_deadlines ${where}`
  ).get(...params) as { total: number };
  const total = totalRow.total;

  const rows = db.prepare(
    `SELECT * ${COMPUTED_FIELDS_SQL} FROM contracts_and_deadlines ${where}
     ORDER BY expiration_date ASC NULLS LAST, created_at DESC
     LIMIT ? OFFSET ?`
  ).all(...params, limitNum, offsetNum);

  res.json({ data: rows, total });
});

// ---------------------------------------------------------------------------
// GET /:id/attachments — Anhänge-Liste (aus Dokumente-Modul, doc_files.contract_id)
// ---------------------------------------------------------------------------
router.get('/:id/attachments', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const rows = db.prepare(
    `SELECT id, contract_id AS item_id, filename AS file_name, mime_type AS file_type,
            size_bytes AS file_size, created_at AS uploaded_at
     FROM doc_files WHERE contract_id = ? ORDER BY created_at ASC`
  ).all(id);
  return res.json(rows);
});

// ---------------------------------------------------------------------------
// POST /:id/attachments — Anhang hochladen (landet im Dokumente-Modul)
// ---------------------------------------------------------------------------
router.post('/:id/attachments', upload.single('file'), async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  const file = req.file;
  if (!file) { res.status(400).json({ error: 'Keine Datei übermittelt' }); return; }

  const contract = db.prepare('SELECT id, area FROM contracts_and_deadlines WHERE id = ?').get(id) as
    | { id: number; area: string | null }
    | undefined;
  if (!contract) {
    await fsp.unlink(file.path).catch(() => undefined);
    res.status(404).json({ error: 'Vertrag nicht gefunden' });
    return;
  }

  // Multer liest Dateinamen als Latin-1 — in UTF-8 umwandeln
  const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');

  const folderId = getOrCreateContractAreaFolder(contract.area ?? 'Sonstiges');

  // Namens-Kollision -> " (2)", " (3)" ... (identisch documents.routes.ts POST /files)
  let dbFilename = originalName;
  const ext = path.extname(originalName);
  const base = path.basename(originalName, ext);
  let suffix = 1;
  while (
    db.prepare(`SELECT id FROM doc_files WHERE folder_id = ? AND filename = ?`).get(folderId, dbFilename)
  ) {
    suffix++;
    dbFilename = `${base} (${suffix})${ext}`;
  }

  const folderAbs = folderFsPath(folderId).absolute;
  await fsp.mkdir(folderAbs, { recursive: true });
  const finalPath = path.join(folderAbs, fileFsName(dbFilename));
  await fsp.rename(file.path, finalPath);

  const result = db.prepare(
    `INSERT INTO doc_files (folder_id, filename, size_bytes, mime_type, contract_id)
     VALUES (?, ?, ?, ?, ?)`
  ).run(folderId, dbFilename, file.size, file.mimetype, id);

  await syncMirror(async (mirrorRoot) => {
    const mirrorDir = path.join(mirrorRoot, folderMirrorPath(folderId).relative);
    await fsp.mkdir(mirrorDir, { recursive: true });
    await fsp.copyFile(finalPath, path.join(mirrorDir, fileMirrorName(dbFilename)));
  });

  db.prepare(
    `INSERT INTO contracts_and_deadlines_activity_log (item_id, event_type, message) VALUES (?, ?, ?)`
  ).run(id, 'attachment_added', `Anhang hinzugefügt: ${dbFilename}`);

  const attachment = db.prepare(
    `SELECT id, contract_id AS item_id, filename AS file_name, mime_type AS file_type,
            size_bytes AS file_size, created_at AS uploaded_at
     FROM doc_files WHERE id = ?`
  ).get(result.lastInsertRowid);
  res.status(201).json(attachment);
});

// ---------------------------------------------------------------------------
// DELETE /:id/attachments/:attachmentId — Anhang entfernen (ZWEI Modi via ?mode=)
//   unlink (Default, sicher): nur Verknuepfung loesen, Datei bleibt in Dokumente
//   delete: Zeile + physische Datei (moveToTrash) + Spiegel entfernen
// ---------------------------------------------------------------------------
router.delete('/:id/attachments/:attachmentId', async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const attachmentId = parseInt(req.params.attachmentId, 10);
  const mode = (req.query.mode as string | undefined) ?? 'unlink';

  if (mode !== 'unlink' && mode !== 'delete') {
    res.status(400).json({ error: 'Ungueltiger mode — erwartet "unlink" oder "delete"' });
    return;
  }

  const row = db.prepare(
    'SELECT * FROM doc_files WHERE id = ? AND contract_id = ?'
  ).get(attachmentId, id) as { id: number; folder_id: number; filename: string } | undefined;
  if (!row) { res.status(404).json({ error: 'Anhang nicht gefunden' }); return; }

  if (mode === 'unlink') {
    db.prepare('UPDATE doc_files SET contract_id = NULL WHERE id = ? AND contract_id = ?').run(attachmentId, id);
    db.prepare(
      `INSERT INTO contracts_and_deadlines_activity_log (item_id, event_type, message) VALUES (?, ?, ?)`
    ).run(id, 'attachment_unlinked', `Anhang vom Vertrag entfernt (Datei bleibt in Dokumente): ${row.filename}`);
    res.status(204).send();
    return;
  }

  // mode === 'delete'
  const folderAbs = folderFsPath(row.folder_id).absolute;
  const absPath = path.join(folderAbs, fileFsName(row.filename));
  const mirrorRel = folderMirrorPath(row.folder_id).relative;
  const mirrorName = fileMirrorName(row.filename);

  db.prepare('DELETE FROM doc_files WHERE id = ?').run(attachmentId);

  try {
    if (fs.existsSync(absPath)) await moveToTrash(absPath);
  } catch (err) {
    console.warn('[contracts] Trash-Move fuer Anhang fehlgeschlagen:', (err as Error).message);
  }

  await syncMirror(async (mirrorRoot) => {
    await fsp.rm(path.join(mirrorRoot, mirrorRel, mirrorName), { force: true });
  });

  db.prepare(
    `INSERT INTO contracts_and_deadlines_activity_log (item_id, event_type, message) VALUES (?, ?, ?)`
  ).run(id, 'attachment_removed', `Anhang entfernt: ${row.filename}`);

  res.status(204).send();
});

// ---------------------------------------------------------------------------
// GET /:id/attachments/:attachmentId/reveal — Anhang im Finder anzeigen
// ---------------------------------------------------------------------------
router.get('/:id/attachments/:attachmentId/reveal', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const attachmentId = parseInt(req.params.attachmentId, 10);

  const row = db.prepare(
    'SELECT folder_id, filename FROM doc_files WHERE id = ? AND contract_id = ?'
  ).get(attachmentId, id) as { folder_id: number; filename: string } | undefined;
  if (!row) { res.status(404).json({ error: 'Anhang nicht gefunden' }); return; }

  const absolutePath = path.join(folderFsPath(row.folder_id).absolute, fileFsName(row.filename));
  if (!fs.existsSync(absolutePath)) { res.status(404).json({ error: 'Datei nicht gefunden' }); return; }

  execFile('open', ['-R', absolutePath], (err) => {
    if (err) { res.status(500).json({ error: 'Finder konnte nicht geöffnet werden' }); return; }
    res.json({ ok: true });
  });
});

// ---------------------------------------------------------------------------
// GET /:id/attachments/:attachmentId/download — Anhang herunterladen
// ---------------------------------------------------------------------------
router.get('/:id/attachments/:attachmentId/download', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const attachmentId = parseInt(req.params.attachmentId, 10);

  const row = db.prepare(
    'SELECT folder_id, filename FROM doc_files WHERE id = ? AND contract_id = ?'
  ).get(attachmentId, id) as { folder_id: number; filename: string } | undefined;
  if (!row) { res.status(404).json({ error: 'Anhang nicht gefunden' }); return; }

  const filePath = path.join(folderFsPath(row.folder_id).absolute, fileFsName(row.filename));
  if (!fs.existsSync(filePath)) { res.status(404).json({ error: 'Datei nicht gefunden' }); return; }

  res.download(filePath, row.filename);
});

// ---------------------------------------------------------------------------
// GET /:id/receipts — Zugehörige Belege (Rückrichtung, Feature 3, Plan quick-260702-vz7)
// ---------------------------------------------------------------------------
router.get('/:id/receipts', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Ungueltige id' });
  const rows = db.prepare(
    `SELECT id, receipt_date, amount_gross_cents, currency, supplier_name, title
     FROM receipts WHERE contract_id = ? ORDER BY receipt_date DESC`
  ).all(id);
  return res.json(rows);
});

// ---------------------------------------------------------------------------
// GET /:id — Detail
// ---------------------------------------------------------------------------
router.get('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const detail = loadDetail(id);
  if (!detail) return res.status(404).json({ error: 'Nicht gefunden' });
  return res.json(detail);
});

// ---------------------------------------------------------------------------
// POST / — Erstellen
// ---------------------------------------------------------------------------
router.post('/', (req, res) => {
  const body = req.body as Record<string, unknown>;
  const title = (body.title as string | undefined)?.trim();
  if (!title) return res.status(400).json({ error: 'Titel ist erforderlich' });

  const unbefristetValue = body.unbefristet ? 1 : 0;

  const stmt = db.prepare(`
    INSERT INTO contracts_and_deadlines (
      title, item_type, area, status, priority,
      provider_name, reference_number,
      start_date, expiration_date, cancellation_date, reminder_date,
      cost_amount, currency, cost_interval,
      description, notes, tags,
      linked_contact_id, linked_task_id, linked_calendar_event_id,
      is_archived,
      unbefristet, vertragsinhaber, kontoname,
      split_count, split_amount, is_business, amount_type, vat_rate,
      cancellation_notice_weeks, auto_renews, last_reviewed_at
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?,
      ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?
    )
  `);

  const result = stmt.run(
    title,
    (body.item_type as string) || 'Sonstiges',
    (body.area as string) || 'Sonstiges',
    (body.status as string) || 'aktiv',
    (body.priority as string) || 'mittel',
    (body.provider_name as string | null) ?? null,
    (body.reference_number as string | null) ?? null,
    (body.start_date as string | null) ?? null,
    unbefristetValue === 1 ? null : ((body.expiration_date as string | null) ?? null),
    (body.cancellation_date as string | null) ?? null,
    (body.reminder_date as string | null) ?? null,
    (body.cost_amount as number | null) ?? null,
    (body.currency as string) || 'EUR',
    (body.cost_interval as string | null) ?? null,
    (body.description as string | null) ?? null,
    (body.notes as string | null) ?? null,
    (body.tags as string | null) ?? null,
    (body.linked_contact_id as number | null) ?? null,
    (body.linked_task_id as number | null) ?? null,
    (body.linked_calendar_event_id as string | null) ?? null,
    0,
    unbefristetValue,
    (body.vertragsinhaber as string | null) ?? null,
    (body.kontoname as string | null) ?? null,
    Number(body.split_count) || 1,
    (body.split_amount as number | null) ?? null,
    body.is_business ? 1 : 0,
    (body.amount_type as string) || 'brutto',
    Number(body.vat_rate) || 19,
    Number(body.cancellation_notice_weeks) || 4,
    body.auto_renews !== undefined ? (body.auto_renews ? 1 : 0) : 1,
    (body.last_reviewed_at as string | null) ?? null,
  );

  const newId = result.lastInsertRowid as number;

  db.prepare(
    `INSERT INTO contracts_and_deadlines_activity_log (item_id, event_type, message) VALUES (?, ?, ?)`
  ).run(newId, 'created', 'Eintrag erstellt');

  const detail = loadDetail(newId);
  return res.status(201).json(detail);
});

// ---------------------------------------------------------------------------
// PUT /:id — Aktualisieren
// ---------------------------------------------------------------------------
router.put('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = db.prepare(`SELECT * FROM contracts_and_deadlines WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  if (!existing) return res.status(404).json({ error: 'Nicht gefunden' });

  const body = req.body as Record<string, unknown>;

  const newUnbefristet = body.unbefristet !== undefined
    ? (body.unbefristet ? 1 : 0)
    : (existing.unbefristet as number ?? 0);

  // Wenn unbefristet gesetzt wird, expiration_date auf null erzwingen
  const newExpirationDate = newUnbefristet === 1
    ? null
    : (body.expiration_date !== undefined ? ((body.expiration_date as string | null) ?? null) : (existing.expiration_date as string | null));

  db.prepare(`
    UPDATE contracts_and_deadlines SET
      title = ?,
      item_type = ?,
      area = ?,
      status = ?,
      priority = ?,
      provider_name = ?,
      reference_number = ?,
      start_date = ?,
      expiration_date = ?,
      cancellation_date = ?,
      reminder_date = ?,
      cost_amount = ?,
      currency = ?,
      cost_interval = ?,
      description = ?,
      notes = ?,
      tags = ?,
      linked_contact_id = ?,
      linked_task_id = ?,
      linked_calendar_event_id = ?,
      unbefristet = ?,
      vertragsinhaber = ?,
      kontoname = ?,
      split_count = ?,
      split_amount = ?,
      is_business = ?,
      amount_type = ?,
      vat_rate = ?,
      cancellation_notice_weeks = ?,
      auto_renews = ?,
      last_reviewed_at = ?,
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    (body.title as string | undefined)?.trim() ?? (existing.title as string),
    (body.item_type as string) || (existing.item_type as string),
    (body.area as string) || (existing.area as string),
    (body.status as string) || (existing.status as string),
    (body.priority as string) || (existing.priority as string),
    body.provider_name !== undefined ? ((body.provider_name as string | null) ?? null) : (existing.provider_name as string | null),
    body.reference_number !== undefined ? ((body.reference_number as string | null) ?? null) : (existing.reference_number as string | null),
    body.start_date !== undefined ? ((body.start_date as string | null) ?? null) : (existing.start_date as string | null),
    newExpirationDate,
    body.cancellation_date !== undefined ? ((body.cancellation_date as string | null) ?? null) : (existing.cancellation_date as string | null),
    body.reminder_date !== undefined ? ((body.reminder_date as string | null) ?? null) : (existing.reminder_date as string | null),
    body.cost_amount !== undefined ? ((body.cost_amount as number | null) ?? null) : (existing.cost_amount as number | null),
    (body.currency as string) || (existing.currency as string) || 'EUR',
    body.cost_interval !== undefined ? ((body.cost_interval as string | null) ?? null) : (existing.cost_interval as string | null),
    body.description !== undefined ? ((body.description as string | null) ?? null) : (existing.description as string | null),
    body.notes !== undefined ? ((body.notes as string | null) ?? null) : (existing.notes as string | null),
    body.tags !== undefined ? ((body.tags as string | null) ?? null) : (existing.tags as string | null),
    body.linked_contact_id !== undefined ? ((body.linked_contact_id as number | null) ?? null) : (existing.linked_contact_id as number | null),
    body.linked_task_id !== undefined ? ((body.linked_task_id as number | null) ?? null) : (existing.linked_task_id as number | null),
    body.linked_calendar_event_id !== undefined ? ((body.linked_calendar_event_id as string | null) ?? null) : (existing.linked_calendar_event_id as string | null),
    newUnbefristet,
    body.vertragsinhaber !== undefined ? ((body.vertragsinhaber as string | null) ?? null) : (existing.vertragsinhaber as string | null),
    body.kontoname !== undefined ? ((body.kontoname as string | null) ?? null) : (existing.kontoname as string | null),
    body.split_count !== undefined ? (Number(body.split_count) || 1) : (existing.split_count as number ?? 1),
    body.split_amount !== undefined ? ((body.split_amount as number | null) ?? null) : (existing.split_amount as number | null),
    body.is_business !== undefined ? (body.is_business ? 1 : 0) : (existing.is_business as number ?? 0),
    body.amount_type !== undefined ? ((body.amount_type as string) || 'brutto') : (existing.amount_type as string ?? 'brutto'),
    body.vat_rate !== undefined ? (Number(body.vat_rate) || 19) : (existing.vat_rate as number ?? 19),
    body.cancellation_notice_weeks !== undefined ? (Number(body.cancellation_notice_weeks) || 4) : (existing.cancellation_notice_weeks as number ?? 4),
    body.auto_renews !== undefined ? (body.auto_renews ? 1 : 0) : (existing.auto_renews as number ?? 1),
    body.last_reviewed_at !== undefined ? ((body.last_reviewed_at as string | null) ?? null) : (existing.last_reviewed_at as string | null),
    id
  );

  db.prepare(
    `INSERT INTO contracts_and_deadlines_activity_log (item_id, event_type, message) VALUES (?, ?, ?)`
  ).run(id, 'updated', 'Eintrag bearbeitet');

  // Wenn Status sich geändert hat → zusätzlicher Log-Eintrag
  const newStatus = (body.status as string) || (existing.status as string);
  if (body.status && body.status !== existing.status) {
    db.prepare(
      `INSERT INTO contracts_and_deadlines_activity_log (item_id, event_type, message) VALUES (?, ?, ?)`
    ).run(id, 'status_changed', `Status geändert: ${existing.status} → ${newStatus}`);
  }

  const detail = loadDetail(id);
  return res.json(detail);
});

// ---------------------------------------------------------------------------
// POST /:id/archive — Toggle Archiv
// ---------------------------------------------------------------------------
router.post('/:id/archive', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = db.prepare(`SELECT * FROM contracts_and_deadlines WHERE id = ?`).get(id) as Record<string, unknown> | undefined;
  if (!existing) return res.status(404).json({ error: 'Nicht gefunden' });

  const currentArchived = existing.is_archived as number;
  const newArchived = currentArchived === 0 ? 1 : 0;

  db.prepare(
    `UPDATE contracts_and_deadlines SET is_archived = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(newArchived, id);

  const eventType = newArchived === 1 ? 'archived' : 'restored';
  const message = newArchived === 1 ? 'Archiviert' : 'Wiederhergestellt';
  db.prepare(
    `INSERT INTO contracts_and_deadlines_activity_log (item_id, event_type, message) VALUES (?, ?, ?)`
  ).run(id, eventType, message);

  const detail = loadDetail(id);
  return res.json(detail);
});

// ---------------------------------------------------------------------------
// DELETE /:id — Hard Delete
// ---------------------------------------------------------------------------
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const existing = db.prepare(`SELECT id FROM contracts_and_deadlines WHERE id = ?`).get(id);
  if (!existing) return res.status(404).json({ error: 'Nicht gefunden' });

  db.prepare(`DELETE FROM contracts_and_deadlines WHERE id = ?`).run(id);
  return res.status(204).send();
});

export default router;
