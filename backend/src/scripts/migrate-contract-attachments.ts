/**
 * Einmaliger, IDEMPOTENTER Umzug der Vertrags-Anhaenge ins Dokumente-Modul.
 * Aufruf: npx tsx src/scripts/migrate-contract-attachments.ts
 *
 * Ablauf pro Alt-Anhang (contracts_and_deadlines_attachments):
 *  1. Ziel-Ordner ermitteln/anlegen (getOrCreateContractAreaFolder).
 *  2. Quelle kopieren (NICHT verschieben) in den Dokumente-App-Speicher + Spiegel.
 *  3. doc_files-Zeile mit contract_id anlegen.
 *  4. ERST danach die Quelle loeschen + Alt-Zeile entfernen — das Entfernen der
 *     Alt-Zeile IST das Idempotenz-Signal (kein filenamebasierter Check noetig).
 *
 * Jeder Anhang wird EINZELN verarbeitet (keine Riesen-Transaktion), damit ein
 * Abbruch mittendrin nur den aktuellen Anhang betrifft — ein Re-Run erledigt
 * den Rest (die verbleibenden Alt-Zeilen sind das Signal, was noch offen ist).
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { createBackup } from '../db/backup';
import db from '../db/connection';
import { getOrCreateContractAreaFolder, folderFsPath, fileFsName, folderMirrorPath, fileMirrorName, syncMirror } from '../lib/docFiles';

const VERTRAEGE_DIR = path.join(os.homedir(), '.local', 'share', 'benny-dashboard', 'vertraege');

interface OldAttachmentRow {
  id: number;
  item_id: number;
  file_name: string;
  file_type: string | null;
  file_size: number | null;
  storage_path: string;
  area: string | null;
}

async function main() {
  console.log('');
  console.log('=== Umzug Vertrags-Anhaenge -> Dokumente-Modul ===');
  console.log('');

  // 1. Backup GANZ ZU BEGINN (Datensicherheit)
  console.log('[1/2] Erstelle Backup...');
  const backupPath = createBackup('migrate-contract-attachments');
  console.log(`      -> ${backupPath}`);
  console.log('');

  // 2. Offene Alt-Anhaenge lesen
  const rows = db
    .prepare(
      `SELECT a.id, a.item_id, a.file_name, a.file_type, a.file_size, a.storage_path, c.area
       FROM contracts_and_deadlines_attachments a
       JOIN contracts_and_deadlines c ON c.id = a.item_id`,
    )
    .all() as OldAttachmentRow[];

  if (rows.length === 0) {
    console.log('[2/2] Keine offenen Anhaenge, nichts zu tun.');
    console.log('');
    process.exit(0);
  }

  console.log(`[2/2] ${rows.length} offene Anhaenge gefunden — verarbeite einzeln...`);
  console.log('');

  let moved = 0;
  let missing = 0;

  for (const row of rows) {
    const srcAbs = path.join(VERTRAEGE_DIR, row.storage_path);

    if (!fs.existsSync(srcAbs)) {
      console.warn(`  [WARN] Anhang ${row.id} (${row.file_name}) — Quelle fehlt physisch: ${srcAbs}. Alt-Zeile bleibt erhalten.`);
      missing++;
      continue;
    }

    const folderId = getOrCreateContractAreaFolder(row.area ?? 'Sonstiges');

    // Ziel-Dateiname mit Kollisions-Aufloesung (analog documents.routes.ts POST /files)
    let dbFilename = row.file_name;
    const ext = path.extname(row.file_name);
    const base = path.basename(row.file_name, ext);
    let suffix = 1;
    while (
      db
        .prepare(`SELECT id FROM doc_files WHERE folder_id = ? AND filename = ?`)
        .get(folderId, dbFilename)
    ) {
      suffix++;
      dbFilename = `${base} (${suffix})${ext}`;
    }

    const folderAbs = folderFsPath(folderId).absolute;
    fs.mkdirSync(folderAbs, { recursive: true });
    const dstAbs = path.join(folderAbs, fileFsName(dbFilename));

    // Kopieren (App-Speicher-Kopie MUSS erfolgreich sein, sonst throw -> Re-Run versucht erneut)
    fs.copyFileSync(srcAbs, dstAbs);

    // Spiegel best-effort
    await syncMirror(async (mirrorRoot) => {
      const mirrorDir = path.join(mirrorRoot, folderMirrorPath(folderId).relative);
      fs.mkdirSync(mirrorDir, { recursive: true });
      fs.copyFileSync(dstAbs, path.join(mirrorDir, fileMirrorName(dbFilename)));
    });

    const sizeBytes = row.file_size ?? fs.statSync(dstAbs).size;

    db.prepare(
      `INSERT INTO doc_files (folder_id, filename, size_bytes, mime_type, contract_id) VALUES (?, ?, ?, ?, ?)`,
    ).run(folderId, dbFilename, sizeBytes, row.file_type, row.item_id);

    // ERST JETZT (nach erfolgreichem Kopieren + Insert) Quelle + Alt-Zeile entfernen
    try {
      fs.unlinkSync(srcAbs);
    } catch (err) {
      console.warn(`  [WARN] Quelle konnte nicht geloescht werden (${srcAbs}):`, (err as Error).message);
    }
    db.prepare(`DELETE FROM contracts_and_deadlines_attachments WHERE id = ?`).run(row.id);

    console.log(`  [OK] Anhang ${row.id} "${row.file_name}" -> Ordner ${folderId} (Bereich "${row.area ?? 'Sonstiges'}") als "${dbFilename}"`);
    moved++;
  }

  console.log('');
  console.log('══════════════════════════════════════');
  console.log(`  Verschoben (moved):  ${moved}`);
  console.log(`  Fehlend (missing):   ${missing}`);
  console.log('══════════════════════════════════════');
  console.log('');
  process.exit(0);
}

main().catch((err) => {
  console.error('[FEHLER] Umzug abgebrochen:', err);
  process.exit(1);
});
