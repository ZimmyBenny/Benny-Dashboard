# Belege: Dateien nachträglich hinzufügen (Nachtrag nach Freigabe)

**Datum:** 2026-07-18 · **Status:** Von Benny freigegeben

## Problem

Ein Beleg zeigt aktuell nur die eine Datei, mit der er angelegt wurde — es gibt
KEINE Möglichkeit, einem bestehenden Beleg eine weitere Datei hinzuzufügen.
Benny erhält aber oft später ergänzende Dokumente (z. B. netcup-Ausgleichs-/
Folgerechnung zu einer bereits freigegebenen Vorauszahlungs-Rechnung) und will
sie am Ursprungs-Beleg anhängen.

Freigegebene Belege sind GoBD-gesperrt: drei Trigger auf `receipt_files` blocken
INSERT/UPDATE/DELETE. Ein nachträgliches Anhängen ist GoBD-konform, solange es
**append-only, transparent (Zeitstempel + wer) und ohne Änderung des Originals**
passiert.

## Geklärte Anforderungen

- Nachträge werden **klar als „Nachtrag" gekennzeichnet** (Frage 1: A) — mit Datum
  „hinzugefügt am …", Original bleibt unangetastet und unlöschbar, append-only.

## Datenmodell (Migration 123, additiv)

```sql
ALTER TABLE receipt_files ADD COLUMN is_nachtrag INTEGER NOT NULL DEFAULT 0;
ALTER TABLE receipt_files ADD COLUMN added_by TEXT;
```

Zeitstempel = vorhandenes `created_at`. Kein Rebuild, kein PRAGMA foreign_keys.

## GoBD-Trigger anpassen (Migration 123)

Der bestehende INSERT-Trigger `trg_receipt_files_no_insert_after_freigabe` wird
neu erstellt (DROP + CREATE), sodass er das Einfügen erlaubt, **wenn
`NEW.is_nachtrag = 1`**:

```sql
DROP TRIGGER trg_receipt_files_no_insert_after_freigabe;
CREATE TRIGGER trg_receipt_files_no_insert_after_freigabe
BEFORE INSERT ON receipt_files
FOR EACH ROW
WHEN (SELECT freigegeben_at FROM receipts WHERE id = NEW.receipt_id) IS NOT NULL
     AND NEW.is_nachtrag = 0
BEGIN
    SELECT RAISE(ABORT, 'GoBD: An einen freigegebenen Beleg dürfen nur gekennzeichnete Nachträge angefügt werden.');
END;
```

- **UPDATE-Trigger bleibt unverändert:** jede Datei eines freigegebenen Belegs
  (inkl. Nachträge) unveränderlich.
- **DELETE-Trigger bleibt unverändert:** keine Datei eines freigegebenen Belegs
  löschbar (Nachträge append-only).
- Original-Dateien (is_nachtrag=0) bleiben nach Freigabe komplett gesperrt.

## Backend

**`POST /api/belege/:id/files`** (multipart, Feld `file`, EINE Datei):
1. Beleg laden; existiert nicht → 404.
2. Datei speichern nach bestehendem Upload-Muster (belege.upload.routes.ts:
   Storage-Pfad, sha256-Hash, mime, file_size, Thumbnail/page_count best-effort).
3. Ist `freigegeben_at` gesetzt → `is_nachtrag=1`, `added_by=<actor>`. Sonst
   `is_nachtrag=0`.
4. `receipt_files`-Zeile einfügen (Trigger lässt Nachtrag bei freigegeben durch).
5. Audit-Log (`logAudit` 'nachtrag_hinzugefügt' bzw. 'datei_hinzugefügt').
6. Rückgabe: die neue receipt_files-Zeile.

Duplicate-Hash-Prüfung (file_hash_sha256 auf receipts) NICHT anwenden — die
receipt_files-Zeile hat eine eigene sha256, receipts.file_hash_sha256 bleibt das
des Original-Belegs.

**GET-Beleg** liefert bereits `files` (Array aus receipt_files); um `is_nachtrag`,
`added_by`, `created_at` je Datei erweitern.

Einzel-Operation → kein createBackup. Migration 123 läuft mit Auto-Backup via
migrate.ts.

## Frontend (BelegeDetailPage)

- **Datei-Liste** statt nur einer Datei: alle `files` auflisten, jede per Klick im
  Vollbild-Viewer ansehbar (bestehende `/:id/file/:fileId`-Route + Vollbild-Modal).
  Label je Datei: „Original" bzw. **„Nachtrag · hinzugefügt am {created_at}"**
  (deutsches Datum), Nachträge optisch abgesetzt (Badge).
- **Button** unter der Datei-Liste:
  - Beleg nicht freigegeben → „Datei hinzufügen"
  - Beleg freigegeben → **„Nachtrag hinzufügen"** + kleiner Hinweis „Wird GoBD-konform
    mit Datum ergänzt; das Original bleibt unverändert."
  - **Drag & Drop** auf den Datei-Bereich (Standard-Regel), gleiche Typ-Erlaubnis wie
    der Beleg-Upload; nach Erfolg Belege-Query invalidieren.

Echte Umlaute; keine Löschen-Aktion für Nachträge (append-only).

## Verifikation

Freigegebener Beleg 82 (netcup nc-5303654): Folge-PDF (nc-5379497) als Nachtrag
anhängen → receipt_files-Zeile mit is_nachtrag=1 entsteht (Trigger lässt durch),
Original-Datei unverändert, im Detail als „Nachtrag · hinzugefügt am …" sichtbar.
Gegentest: Insert mit is_nachtrag=0 auf freigegebenen Beleg → Trigger blockt (GoBD).
Nicht-freigegebener Beleg: zweite Datei anhängen → is_nachtrag=0.

## Nicht im Scope

- Nachträge löschen/ändern (append-only per GoBD)
- Automatische Verknüpfung/Erkennung von Folgerechnungen
- Rückwirkende Migration bestehender Belege
