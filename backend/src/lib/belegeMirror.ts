import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import db from '../db/connection';
import { getBelegeRoot } from './files';

/**
 * belegeMirror — Finder-Spiegel fuer das Belege-Modul.
 *
 * Vorbild: lib/docFiles.ts (Dokumente-Modul), aber eigene Pfad-/Namensregeln
 * (siehe docs/superpowers/specs/2026-07-04-belege-finder-spiegel-design.md).
 *
 * Speicherort-Logik:
 *  - App-Speicher (getBelegeRoot() aus lib/files.ts) bleibt Quelle der Wahrheit (GoBD-sicher).
 *  - Zusaetzlich einseitiger best-effort Spiegel nach getMirrorPath()
 *    (Setting `belege_mirror_path`; Key fehlt -> Default-Projektordner,
 *    Key vorhanden aber leer -> Spiegel AUS).
 *
 * Struktur im Spiegel:
 *  - Belege/Zu prüfen/                    (status='zu_pruefen', KEIN Jahres-Unterordner)
 *  - Belege/<Primär-Bereich>/<Jahr>/      (sonst)
 *  - Belege/Ohne Bereich/<Jahr>/          (kein Primär-Bereich, nicht zu_pruefen)
 *
 * WICHTIG: NIEMALS App-Speicher in iCloud Drive (bird daemon File-Locks) —
 * der Spiegel-Pfad DARF in iCloud liegen (das ist sein Zweck).
 */

interface KvRow {
  value: string;
}

/**
 * Default-Spiegel-Pfad: <Projektwurzel>/Belege — relativ zum Modulpfad
 * aufgeloest (backend/src/lib -> 3 Ebenen hoch), NIEMALS ueber das aktuelle
 * Arbeitsverzeichnis des Prozesses: das Backend laeuft mit cwd=backend/,
 * darauf basierend landete der Spiegel faelschlich in backend/Belege statt
 * im iCloud-Projektordner (Lektion aus dem Dokumente-Spiegel).
 */
const DEFAULT_MIRROR_PATH = path.resolve(__dirname, '..', '..', '..', 'Belege');

const ZU_PRUEFEN_DIRNAME = 'Zu prüfen';
const OHNE_BEREICH_DIRNAME = 'Ohne Bereich';

/**
 * Liefert den Spiegel-Pfad (iCloud-Projektordner/Belege) oder null wenn deaktiviert.
 * - Key `belege_mirror_path` existiert nicht in app_settings -> Default (Projektordner/Belege)
 * - Key existiert, ist aber leer/whitespace -> null (Spiegel AUS, User-Entscheidung)
 * - Key existiert mit Wert -> dieser Pfad
 */
export function getMirrorPath(): string | null {
  try {
    const row = db
      .prepare(`SELECT value FROM app_settings WHERE key = 'belege_mirror_path'`)
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

/**
 * Minimal-Bereinigung fuer Spiegel-Namen: Original-Schreibweise (Grossschreibung,
 * Umlaute, Leerzeichen) bleibt erhalten — nur echte Verbotszeichen werden ersetzt.
 * Fuer den Finder-Spiegel gedacht; der App-Speicher nutzt eigene Slug-Logik.
 */
function mirrorSafeName(name: string, fallback: string): string {
  const cleaned = name
    .replace(/[/\\:*?"<>|\x00-\x1f]/g, '_')
    .replace(/^\.+/, '_') // keine versteckten Namen / Traversal
    .trim()
    .slice(0, 120);
  return cleaned.length > 0 && cleaned !== '..' ? cleaned : fallback;
}

interface ReceiptRow {
  id: number;
  status: string;
  receipt_date: string | null;
  created_at: string;
  supplier_name: string | null;
  supplier_invoice_number: string | null;
}

function loadReceipt(receiptId: number): ReceiptRow | undefined {
  return db
    .prepare(
      `SELECT id, status, receipt_date, created_at, supplier_name, supplier_invoice_number
       FROM receipts WHERE id = ?`,
    )
    .get(receiptId) as ReceiptRow | undefined;
}

function primaryAreaName(receiptId: number): string | null {
  const row = db
    .prepare(
      `SELECT a.name AS name FROM receipt_area_links ral
       JOIN areas a ON a.id = ral.area_id
       WHERE ral.receipt_id = ? AND ral.is_primary = 1 LIMIT 1`,
    )
    .get(receiptId) as { name: string } | undefined;
  return row?.name ?? null;
}

function yearOf(receipt: ReceiptRow): string {
  const fromReceiptDate = receipt.receipt_date?.slice(0, 4);
  if (fromReceiptDate && /^\d{4}$/.test(fromReceiptDate)) return fromReceiptDate;
  const fromCreated = receipt.created_at?.slice(0, 4);
  if (fromCreated && /^\d{4}$/.test(fromCreated)) return fromCreated;
  return 'Unbekannt';
}

/**
 * Pfad-Regel: relatives Verzeichnis (ohne Mirror-Root) fuer einen Beleg.
 * - status='zu_pruefen' -> "Zu prüfen" (KEIN Jahres-Unterordner).
 * - sonst -> Primär-Bereich (Original-Schreibweise) oder "Ohne Bereich", dann Jahr.
 */
export function receiptRelDir(receiptId: number): string {
  const receipt = loadReceipt(receiptId);
  if (!receipt) return OHNE_BEREICH_DIRNAME;

  if (receipt.status === 'zu_pruefen') {
    return ZU_PRUEFEN_DIRNAME;
  }

  const areaName = primaryAreaName(receiptId);
  const areaSegment = areaName
    ? mirrorSafeName(areaName, OHNE_BEREICH_DIRNAME)
    : OHNE_BEREICH_DIRNAME;
  const year = yearOf(receipt);
  return path.join(areaSegment, year);
}

/**
 * Dateiname-Regel: `YYYY-MM-DD_<Lieferant>_<Rechnungsnr>.ext`.
 * - Lieferant fehlt -> 'unbekannt'.
 * - Rechnungsnr fehlt -> Segment (inkl. fuehrendem `_`) entfaellt komplett.
 * - indexInReceipt > 0 -> Suffix `_2`, `_3`, ... vor der Extension.
 * - Kollision mit existingNamesInDir -> ` (2)`, ` (3)`, ... vor der Extension.
 */
export function receiptFileName(
  receipt: { receipt_date: string | null; supplier_name: string | null; supplier_invoice_number: string | null },
  originalFilename: string,
  indexInReceipt: number,
  existingNamesInDir: Set<string>,
): string {
  const ext = path.extname(originalFilename);
  const datePart = (receipt.receipt_date ?? '').slice(0, 10) || 'unbekannt-datum';
  const supplierRaw = receipt.supplier_name?.trim();
  const supplierPart = mirrorSafeName(supplierRaw || 'unbekannt', 'unbekannt');
  const invoiceRaw = receipt.supplier_invoice_number?.trim();
  const invoicePart = invoiceRaw ? mirrorSafeName(invoiceRaw, '') : '';

  let base = `${datePart}_${supplierPart}`;
  if (invoicePart) base += `_${invoicePart}`;
  if (indexInReceipt > 0) base += `_${indexInReceipt + 1}`;

  let candidate = `${base}${ext}`;
  let n = 2;
  while (existingNamesInDir.has(candidate)) {
    candidate = `${base} (${n})${ext}`;
    n++;
  }
  return candidate;
}

/** Quelle der Wahrheit fuer eine receipt_files-Zeile: der App-Speicher-Pfad. */
export function getSourceFile(fileRow: { storage_path: string }): string {
  return fileRow.storage_path;
}

interface ReceiptFileRow {
  id: number;
  original_filename: string;
  storage_path: string;
  mirror_path: string | null;
}

/**
 * Aktualisiert `receipt_files.mirror_path` GoBD-sicher: falls der Beleg
 * freigegeben ist, wuerde der Lock-Trigger trg_receipt_files_no_update_after_freigabe
 * JEDES Update blocken (auch reine Tracking-Spalten). Escape-Hatch (analog attachDjPdf):
 * freigegeben_at temporaer NULL -> UPDATE mirror_path -> freigegeben_at restaurieren,
 * in EINER Transaktion. mirror_path ist reines Tracking, keine Finanz-Spalte.
 */
function updateMirrorPathColumn(receiptId: number, fileId: number, relPath: string): void {
  const txn = db.transaction(() => {
    const row = db
      .prepare(`SELECT freigegeben_at FROM receipts WHERE id = ?`)
      .get(receiptId) as { freigegeben_at: string | null } | undefined;
    const wasLocked = !!row?.freigegeben_at;
    if (wasLocked) {
      db.prepare(`UPDATE receipts SET freigegeben_at = NULL WHERE id = ?`).run(receiptId);
    }
    db.prepare(`UPDATE receipt_files SET mirror_path = ? WHERE id = ?`).run(relPath, fileId);
    if (wasLocked) {
      db.prepare(`UPDATE receipts SET freigegeben_at = ? WHERE id = ?`).run(
        row!.freigegeben_at,
        receiptId,
      );
    }
  });
  txn();
}

/** Entfernt leere Verzeichnisse ab `dir` aufwaerts bis (exklusive) `stopAt`. Best-effort. */
function cleanupEmptyDirsUpwards(dir: string, stopAt: string): void {
  let current = dir;
  while (current !== stopAt && current.startsWith(stopAt)) {
    try {
      const entries = fs.readdirSync(current);
      if (entries.length > 0) break;
      fs.rmdirSync(current);
    } catch {
      break;
    }
    current = path.dirname(current);
  }
}

/**
 * Spiegelt alle Dateien eines Belegs best-effort in den Finder-Spiegel.
 * No-op wenn getMirrorPath()===null. Wirft NIE — Fehler werden nur console.warn.
 */
export function syncReceipt(receiptId: number): void {
  const mirrorRoot = getMirrorPath();
  if (mirrorRoot === null) return;
  try {
    const receipt = loadReceipt(receiptId);
    if (!receipt) return;

    const files = db
      .prepare(
        `SELECT id, original_filename, storage_path, mirror_path FROM receipt_files WHERE receipt_id = ? ORDER BY id`,
      )
      .all(receiptId) as ReceiptFileRow[];
    if (files.length === 0) return;

    const relDir = receiptRelDir(receiptId);
    const absDir = path.join(mirrorRoot, relDir);
    fs.mkdirSync(absDir, { recursive: true });

    const existingNamesInDir = new Set<string>();
    try {
      for (const n of fs.readdirSync(absDir)) existingNamesInDir.add(n);
    } catch {
      // Verzeichnis wurde gerade erst angelegt — leer, nichts zu tun
    }

    files.forEach((file, idx) => {
      try {
        const name = receiptFileName(receipt, file.original_filename, idx, existingNamesInDir);
        existingNamesInDir.add(name);
        const relPath = path.join(relDir, name);

        if (file.mirror_path === relPath && fs.existsSync(path.join(mirrorRoot, relPath))) {
          return; // bereits korrekt gespiegelt
        }

        const src = getSourceFile(file);
        if (!fs.existsSync(src)) return; // App-Speicher-Datei fehlt — nichts zu kopieren

        fs.copyFileSync(src, path.join(mirrorRoot, relPath));

        // Alten Spiegel-Pfad aufraeumen, falls abweichend
        if (file.mirror_path && file.mirror_path !== relPath) {
          const oldAbs = path.join(mirrorRoot, file.mirror_path);
          try {
            if (fs.existsSync(oldAbs)) fs.unlinkSync(oldAbs);
            cleanupEmptyDirsUpwards(path.dirname(oldAbs), mirrorRoot);
          } catch (err) {
            console.warn('[belege:mirror] Aufraeumen alter Spiegel-Datei fehlgeschlagen:', (err as Error).message);
          }
        }

        updateMirrorPathColumn(receiptId, file.id, relPath);
      } catch (err) {
        console.warn(`[belege:mirror] syncReceipt Datei ${file.id} fehlgeschlagen:`, (err as Error).message);
      }
    });
  } catch (err) {
    console.warn(`[belege:mirror] syncReceipt(${receiptId}) fehlgeschlagen:`, (err as Error).message);
  }
}

/**
 * Loescht den Spiegel-Inhalt komplett und baut ihn frisch aus DB + App-Speicher auf.
 * Deckt Bereichs-Umbenennungen ab. Best-effort, wirft nie.
 */
export function rebuildMirror(): void {
  const mirrorRoot = getMirrorPath();
  if (mirrorRoot === null) return;
  try {
    fs.rmSync(mirrorRoot, { recursive: true, force: true });
    fs.mkdirSync(mirrorRoot, { recursive: true });

    const receiptIds = db
      .prepare(
        `SELECT DISTINCT receipt_id AS id FROM receipt_files`,
      )
      .all() as Array<{ id: number }>;

    for (const { id } of receiptIds) {
      syncReceipt(id);
    }
    console.log('[belege:mirror] Spiegel neu aufgebaut:', mirrorRoot);
  } catch (err) {
    console.warn('[belege:mirror] rebuildMirror fehlgeschlagen:', (err as Error).message);
  }
}

/**
 * Entfernt gegebene relative Spiegel-Pfade best-effort aus dem Finder-Spiegel
 * (genutzt beim DELETE eines Belegs — die receipt_files-Rows sind zu diesem
 * Zeitpunkt bereits (CASCADE-)geloescht, daher werden die Pfade vorher vom
 * Aufrufer eingesammelt).
 */
export function removeMirrorPaths(relPaths: string[]): void {
  const mirrorRoot = getMirrorPath();
  if (mirrorRoot === null) return;
  for (const relPath of relPaths) {
    if (!relPath) continue;
    try {
      const abs = path.join(mirrorRoot, relPath);
      if (fs.existsSync(abs)) fs.unlinkSync(abs);
      cleanupEmptyDirsUpwards(path.dirname(abs), mirrorRoot);
    } catch (err) {
      console.warn('[belege:mirror] removeMirrorPaths fehlgeschlagen:', (err as Error).message);
    }
  }
}

// ── DJ-PDF-Integration (Task 2) ──────────────────────────────────────────────

/**
 * Speichert ein DJ-Rechnungs-PDF am gespiegelten Beleg (receipt_files) GoBD-sicher.
 *
 * - Speichert das PDF im Belege-App-Speicher (getBelegeRoot()/dj-pdfs/<invoiceId>/<filename>).
 * - Escape-Hatch (GoBD): freigegeben_at wird in EINER Transaktion temporaer NULL
 *   gesetzt, damit der INSERT-Lock-Trigger trg_receipt_files_no_insert_after_freigabe
 *   nicht greift; danach wird freigegeben_at restauriert. NIEMALS gesperrte
 *   receipts-Spalten (file_hash_sha256 etc.) werden hier geschrieben.
 * - Idempotent: wenn fuer dieses receipt bereits eine receipt_files-Zeile mit
 *   gleichem sha256 existiert, wird kein Doppel-Insert vorgenommen.
 * - best-effort: File-System-Fehler und DB-Fehler werden geloggt, nie geworfen —
 *   der DJ-Finalize/Cancel darf nie daran scheitern.
 */
export function attachDjPdf(
  receiptId: number,
  invoiceId: number,
  pdfBuffer: Buffer,
  filename: string,
): void {
  try {
    const sha256 = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

    const alreadyAttached = db
      .prepare(`SELECT id FROM receipt_files WHERE receipt_id = ? AND sha256 = ?`)
      .get(receiptId, sha256) as { id: number } | undefined;
    if (alreadyAttached) {
      syncReceipt(receiptId);
      return;
    }

    const dir = path.join(getBelegeRoot(), 'dj-pdfs', String(invoiceId));
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, filename);
    fs.writeFileSync(filePath, pdfBuffer);

    const txn = db.transaction(() => {
      const row = db
        .prepare(`SELECT freigegeben_at FROM receipts WHERE id = ?`)
        .get(receiptId) as { freigegeben_at: string | null } | undefined;
      const wasLocked = !!row?.freigegeben_at;
      if (wasLocked) {
        db.prepare(`UPDATE receipts SET freigegeben_at = NULL WHERE id = ?`).run(receiptId);
      }
      db.prepare(
        `INSERT INTO receipt_files
           (receipt_id, original_filename, storage_path, sha256, mime_type, file_size_bytes)
         VALUES (?, ?, ?, ?, 'application/pdf', ?)`,
      ).run(receiptId, filename, filePath, sha256, pdfBuffer.length);
      if (wasLocked) {
        db.prepare(`UPDATE receipts SET freigegeben_at = ? WHERE id = ?`).run(
          row!.freigegeben_at,
          receiptId,
        );
      }
    });
    txn();

    syncReceipt(receiptId);
  } catch (err) {
    console.warn(`[belege:mirror] attachDjPdf(receipt=${receiptId}, invoice=${invoiceId}) fehlgeschlagen:`, (err as Error).message);
  }
}

interface MirrorReceiptCandidate {
  id: number;
  linked_invoice_id: number;
}

interface DjInvoiceForBackfill {
  id: number;
  number: string | null;
  finalized_at: string | null;
}

/**
 * Einmaliger Backfill: erzeugt PDFs fuer alle bereits finalisierten DJ-Rechnungen,
 * deren Mirror-Beleg noch keine Datei hat. Best-effort pro Beleg — ein Fehler
 * bricht den gesamten Lauf nicht ab.
 */
export async function backfillDjPdfs(): Promise<{ generated: number }> {
  // Lazy import verhindert zirkulaere Modul-Abhaengigkeit
  // (dj.pdf.service importiert nichts aus belegeMirror, aber defensiv lazy).
  const { generateInvoicePreviewPdf } = await import('../services/dj.pdf.service');

  const candidates = db
    .prepare(
      `SELECT id, linked_invoice_id FROM receipts
       WHERE source = 'dj_invoice_sync' AND linked_invoice_id IS NOT NULL
         AND id NOT IN (SELECT receipt_id FROM receipt_files)`,
    )
    .all() as MirrorReceiptCandidate[];

  let generated = 0;
  for (const candidate of candidates) {
    try {
      const invoice = db
        .prepare(`SELECT id, number, finalized_at FROM dj_invoices WHERE id = ?`)
        .get(candidate.linked_invoice_id) as DjInvoiceForBackfill | undefined;
      if (!invoice || !invoice.finalized_at) continue;

      const buf = await generateInvoicePreviewPdf(invoice.id);
      const filename = `${invoice.number ?? `RE-${invoice.id}`}.pdf`;
      attachDjPdf(candidate.id, invoice.id, buf, filename);
      generated++;
    } catch (err) {
      console.warn(
        `[belege:mirror] backfillDjPdfs Beleg ${candidate.id} (invoice ${candidate.linked_invoice_id}) fehlgeschlagen:`,
        (err as Error).message,
      );
    }
  }
  return { generated };
}
