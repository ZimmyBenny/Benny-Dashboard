-- Migration 115 — Vertrags-Anhaenge zentral ins Dokumente-Modul (2026-07-09)
-- Additiv, KEIN Rebuild, KEIN PRAGMA foreign_keys (zentral in migrate.ts gesteuert).
-- Nummern-Kontext: 114 war zuletzt (amazon_product_doc_sends).
--
-- Zweck:
--  1. doc_files.contract_id verknuepft eine Dokumente-Datei optional mit einem
--     Vertrag (contracts_and_deadlines) — analog receipts.contract_id (Migration 092).
--     ON DELETE SET NULL: Vertrag geloescht => Datei bleibt im Dokumente-Modul,
--     nur die Verknuepfung faellt weg (kein Datenverlust).
--  2. Geschuetzter Ordnerbaum "Verträge & Fristen" (is_area_root=1, damit die
--     bestehende PATCH/DELETE-403-Schutzlogik in documents.routes.ts ohne
--     Code-Aenderung greift) mit Unterordnern DJ/Amazon/Privat darunter.
--     HINWEIS: Die Unterordner selbst sind is_area_root=0 (sonst wuerden
--     folderSegments() den area_slug=NULL nutzen und pathSegments sie
--     faelschlich als eigene Bereichs-Wurzel behandeln). Ihr Loesch-/Umbenenn-
--     Schutz wird separat in documents.routes.ts (Task 3) per Namens-/Parent-
--     Guard ergaenzt, NICHT ueber is_area_root.
--  3. Idempotent: alle INSERTs nutzen WHERE NOT EXISTS, damit Re-Runs/
--     Testumgebungen nicht brechen.

ALTER TABLE doc_files ADD COLUMN contract_id INTEGER REFERENCES contracts_and_deadlines(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_doc_files_contract ON doc_files(contract_id);

-- Top-Ordner "Verträge & Fristen" (geschuetzt via is_area_root=1)
INSERT INTO doc_folders (parent_id, name, is_area_root, area_slug)
SELECT NULL, 'Verträge & Fristen', 1, 'vertraege-fristen'
WHERE NOT EXISTS (SELECT 1 FROM doc_folders WHERE parent_id IS NULL AND name = 'Verträge & Fristen');

-- Unterordner DJ/Amazon/Privat (is_area_root=0, Schutz per Code-Guard in documents.routes.ts)
INSERT INTO doc_folders (parent_id, name, is_area_root, area_slug)
SELECT (SELECT id FROM doc_folders WHERE parent_id IS NULL AND name = 'Verträge & Fristen'),
       'DJ', 0, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM doc_folders
  WHERE parent_id = (SELECT id FROM doc_folders WHERE parent_id IS NULL AND name = 'Verträge & Fristen')
    AND name = 'DJ'
);

INSERT INTO doc_folders (parent_id, name, is_area_root, area_slug)
SELECT (SELECT id FROM doc_folders WHERE parent_id IS NULL AND name = 'Verträge & Fristen'),
       'Amazon', 0, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM doc_folders
  WHERE parent_id = (SELECT id FROM doc_folders WHERE parent_id IS NULL AND name = 'Verträge & Fristen')
    AND name = 'Amazon'
);

INSERT INTO doc_folders (parent_id, name, is_area_root, area_slug)
SELECT (SELECT id FROM doc_folders WHERE parent_id IS NULL AND name = 'Verträge & Fristen'),
       'Privat', 0, NULL
WHERE NOT EXISTS (
  SELECT 1 FROM doc_folders
  WHERE parent_id = (SELECT id FROM doc_folders WHERE parent_id IS NULL AND name = 'Verträge & Fristen')
    AND name = 'Privat'
);
