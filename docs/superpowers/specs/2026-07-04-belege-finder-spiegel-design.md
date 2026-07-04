# Belege-Finder-Spiegel — Design

**Datum:** 2026-07-04
**Status:** Vom User freigegeben (Diskussion 2026-07-04)

## Ziel

Bennys iCloud-Ordner `<Projekt>/Belege/` wird ein automatisch gepflegter, menschenlesbarer Spiegel aller Beleg-Dateien — strukturiert nach Bereich und Jahr, mit „Zu prüfen"-Eingangskorb. Vorbild: der Dokumente-Spiegel (App-Speicher = Quelle der Wahrheit, GoBD-sicher; Finder = einseitige Kopie).

## Gelockte Entscheidungen (User, 2026-07-04)

1. **Struktur:** `Belege/Zu prüfen/` für Status `zu_pruefen`; sonst `Belege/<Primär-Bereich>/<Jahr>/` (Bereichsname in Original-Schreibweise aus der areas-Tabelle; Jahr aus `receipt_date`).
2. **Dateinamen lesbar:** `YYYY-MM-DD_Lieferant_Rechnungsnr.ext` (z. B. `2026-06-26_netcup-GmbH_nc-5303654.pdf`). Interner technischer Name (mit Hash) bleibt nur im App-Speicher.
3. **Multi-Bereich-Belege:** Datei liegt genau EINMAL — im Primär-Bereich. Keine Kopien.
4. **DJ-Rechnungs-Regel:** Beim Finalisieren einer DJ-Rechnung wird das PDF automatisch erzeugt (bestehender `dj.pdf.service`) und als Datei am gespiegelten Beleg gespeichert; beim Stornieren ebenso das Storno-PDF am Storno-Beleg. **Einmaliger Backfill** für alle bereits finalisierten DJ-Rechnungen ohne Datei.
5. **Fahrten bleiben draußen** (kein Dokument existiert); Belege ohne Datei erscheinen generell nicht im Spiegel. Automatischer „Fahrtenbeleg" = späterer, separater Ausbau.

## Spiegel-Mechanik

- **Setting `belege_mirror_path`:** Key fehlt → Default `<Projektwurzel>/Belege` (via `__dirname` aufgelöst, NIE `process.cwd()` — Lektion aus dem Dokumente-Spiegel); Key vorhanden aber leer → Spiegel AUS; Wert → dieser Pfad.
- **Einseitig + best-effort:** Jede Spiegel-Operation in try/catch — Fehler werden geloggt, die Hauptoperation scheitert NIE am Spiegel. Finder-Eingriffe werden nicht zurückgelesen.
- **Tracking:** Neue Spalte `receipt_files.mirror_path` (Migration, nächste freie Nummer, additiv, KEIN PRAGMA foreign_keys) speichert den zuletzt gespiegelten relativen Pfad. Zentraler Service `belegeMirrorService.syncReceipt(receiptId)`:
  1. Ziel-Pfad je Datei berechnen (Status/Primär-Bereich/Jahr/Name),
  2. weicht er von `mirror_path` ab → Datei im Spiegel verschieben/neu kopieren, alten Pfad entfernen, Spalte aktualisieren,
  3. leere Jahres-/Bereichs-Ordner im Spiegel best-effort aufräumen.
- **Sync-Trigger** (jeweils `syncReceipt` aufrufen): Datei-Upload/-Löschung; PATCH mit Status-, `receipt_date`-, `supplier_name`- oder `supplier_invoice_number`-Änderung; Änderung der Bereichs-Zuordnung (POST /:id/areas); Freigeben/Bezahlt-Markieren (Statuswechsel); Korrekturbeleg-Erstellung; DJ-Finalisieren/Stornieren (s. u.).
- **`POST /api/belege/mirror-rebuild`** + Button „Spiegel neu aufbauen" in den Belege-Einstellungen: leert den Spiegel und baut ihn komplett aus DB + App-Speicher neu (deckt auch Bereichs-Umbenennungen ab).
- **Initialbefüllung:** Nach Migration + Backfill einmal Rebuild — die Bestandsbelege sind ab Tag 1 einsortiert.

## Pfad- und Namensregeln

- Bereichs-Segment: Primär-Bereichsname via mirrorSafeName-Muster (Original-Schreibweise, nur Verbotszeichen ersetzt). Kein Primär-Bereich (und nicht zu_pruefen) → `Ohne Bereich/`.
- Jahr: aus `receipt_date`; fehlt es → Jahr aus `created_at`.
- Dateiname: `YYYY-MM-DD_<Lieferant>_<Rechnungsnr>.ext`; ohne Rechnungsnr entfällt das Segment; Lieferant fehlt → `unbekannt`. Kollision im Ziel-Ordner → ` (2)`, ` (3)` …
- Mehrere Dateien eines Belegs: gleiche Basis + laufende Nummer (`…_2.pdf`).

## DJ-Integration

- **Finalisieren** (`dj.invoices.routes`): nach dem bestehenden `mirrorInvoiceToReceipts` das Rechnungs-PDF über den bestehenden PDF-Service rendern, im Belege-App-Speicher ablegen, als `receipt_files`-Zeile am gespiegelten Beleg registrieren, dann `syncReceipt`.
- **Stornieren:** analog für den Storno-Beleg (Storno-PDF).
- **Backfill** (`POST /api/belege/dj-pdf-backfill`, einmalig manuell auslösbar): alle Belege mit `source_invoice_id`/DJ-Herkunft ohne receipt_files-Eintrag → PDF nachgenerieren + anhängen. **WICHTIG (GoBD):** Backfill schreibt AUSSCHLIESSLICH in `receipt_files` — niemals gesperrte `receipts`-Spalten (u. a. `file_hash_sha256` steht im Lock-Trigger von Migration 040!).
- Vor dem Backfill (Massen-Insert): `createBackup('dj-pdf-backfill')` gemäß CLAUDE.md-Regel.

## Nicht-Ziele (YAGNI)

- Kein Fahrtenbeleg-PDF (später separat).
- Kein Rück-Import aus dem Finder, keine Zwei-Wege-Synchronisation.
- Keine Datei-Kopien in mehreren Bereichs-Ordnern.
- Keine Änderung an GoBD-Logik, UStVA oder Beleg-Workflows — der Spiegel ist reine Anzeige-Schicht plus DJ-PDF-Anhang-Regel.

## Betroffene Bereiche

- **DB:** 1 additive Migration (`receipt_files.mirror_path TEXT NULL`).
- **Backend:** `lib/belegeMirror.ts` (neu: Pfadregeln + syncReceipt + rebuild), `belege.routes.ts` / `belege.upload.routes.ts` (Trigger-Aufrufe + rebuild-Endpoint + Settings-Key), `dj.invoices.routes.ts` (PDF-Anhang bei Finalisieren/Stornieren + Backfill-Endpoint), Wiederverwendung `dj.pdf.service`.
- **Frontend:** Belege-Einstellungen (Spiegel-Pfad-Feld + „Spiegel neu aufbauen"-Button + einmaliger „DJ-PDFs nachtragen"-Button), sonst nichts.
- **Datensicherheit:** Spiegel ist Kopie; App-Speicher unangetastet; `Belege/` in `.gitignore` aufnehmen (persönliche Dokumente, analog `Dokumente/`).
