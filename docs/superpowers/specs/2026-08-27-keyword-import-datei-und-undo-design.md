# Import-Datei speichern + Auto-Vorschlag-Undo — Design-Spec

**Datum:** 2026-08-27
**Status:** Freigegeben, direkt bauen
**Baut auf:** [[2026-08-27-keyword-auswertung-listing-prompt-design]]

## A) Helium-10-Import-Datei speichern & für Claude bereitstellen

**Ziel:** Die hochgeladene Datei (komplette Zahlen) beim Import mitspeichern, damit
man sie zum Claude-Prompt **mit anhängen** kann (Claude sieht dann alle Zahlen).

- **Migration 137:** `amazon_keyword_import_files` — **eine Datei je Produkt**
  (aktuellste; neuer Import ersetzt):
  `product_id INTEGER PRIMARY KEY REFERENCES amazon_products(id) ON DELETE CASCADE,
   file_path TEXT, original_name TEXT, mime TEXT, size INTEGER,
   imported_at INTEGER NOT NULL DEFAULT (unixepoch())`.
- **Speicher:** `~/.local/share/benny-dashboard/amazon-keyword-import-files` (UUID-Dateiname).
- **Backend** (in `amazon.keywords.routes.ts`):
  - `POST /products/:id/keyword-import-file` — multer single `file`; originalname
    latin1→utf8; vorherige Datei (Platte + Zeile) ersetzen (Upsert auf product_id).
  - `GET /products/:id/keyword-import-file` — Metadaten oder `{ file: null }`.
  - `GET /products/:id/keyword-import-file/blob` — Download-Stream (Content-Disposition).
- **Frontend:**
  - API/Hooks: `uploadKeywordImportFile`, `fetchKeywordImportFile`,
    `getKeywordImportFileObjectUrl`; `useKeywordImportFile`, `useUploadKeywordImportFile`.
  - `Helium10ImportModal`: nach erfolgreichem Import die **rohe Datei** hochladen
    (File-Objekt in State halten).
  - `ListingPromptModal`: wenn eine Datei existiert, Zeile „Import-Datei: <Name>"
    + Knopf **„Datei herunterladen"** + Hinweis „zusätzlich in den Claude-Chat
    ziehen, dann sieht Claude alle Zahlen". Download via Blob-`<a download>`.

## B) „Rückgängig" für „Felder automatisch vorschlagen"

**Ziel:** Den Auto-Vorschlag mit einem Klick zurücknehmen.

- Rein clientseitig auf `AmazonKeywordsPage`:
  - Vor dem Auto-Vorschlag den aktuellen Zustand als Snapshot merken:
    `snapshot = keywords.map(k => ({ id, target_field }))` (State).
  - Nach erfolgreichem Vorschlag einen **„Rückgängig"-Knopf** zeigen.
  - Klick → `assignKeywordFields(snapshot)` (bestehender Bulk-Endpoint) → Snapshot
    löschen. Snapshot ist flüchtig (bis Reload/andere Aktion).
- Kein neues Backend nötig (nutzt `assign-fields`; Backup läuft dort ohnehin).

## Konventionen
- multer-Route dekodiert `originalname` latin1→utf8. Datei-Ersetzen löscht die
  alte Datei von der Platte. Kein Backup nötig (Einzeldatei, keine Massen-Op).
- Echte Umlaute; Download über Blob (App-Kontext, kein Artifact-CSP).

## NICHT im Scope
- Historie mehrerer Import-Dateien (nur die aktuellste je Produkt).
- Auto-Anhängen an Claude (Claude-Chat ist extern — Nutzer zieht die Datei rein).
- Undo über Reload hinaus / mehrstufige Undo-Historie.
