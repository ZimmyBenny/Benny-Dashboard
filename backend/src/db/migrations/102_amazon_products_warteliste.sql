-- Migration 102: amazon_products.status-CHECK um 'warteliste' erweitern (2026-07-06)
-- SQLite kann CHECK-Constraints nicht per ALTER aendern → Tabellen-Rebuild
-- nach dem Rename-Create-Copy-Drop-Muster (vgl. Migration 012).
-- WICHTIG: Kein PRAGMA foreign_keys — wird zentral in migrate.ts gesteuert.
-- WICHTIG: Auto-Backup laeuft via migrate.ts vor Anwendung.
-- Datensicherheit: Aktuelles Live-Schema = 7 Spalten (Migr. 057 legte 6 an,
-- Migr. 063 ergaenzte `notes`). Alle 7 Spalten MUESSEN in CREATE + INSERT SELECT,
-- sonst gehen Produkt-Notizen verloren.
--
-- KRITISCH (Fix 2026-07-06): Ohne legacy_alter_table schreibt SQLite beim RENAME
-- die Fremdschluessel-Verweise ALLER abhaengigen Tabellen (amazon_sourcing, _brand_name,
-- _checklist_product_sections, _usp*, _manufacturers, _research_topics, doc_folders, …)
-- automatisch auf `amazon_products_old` um. Nach dem DROP zeigen sie ins Leere und
-- jeder INSERT/UPDATE dort scheitert mit „no such table: amazon_products_old".
-- legacy_alter_table=ON schaltet dieses Umschreiben ab → Kind-Verweise bleiben auf
-- `amazon_products` und passen nach dem Neuaufbau wieder. Ist eine reine Schema-Rewrite-
-- Steuerung (kein foreign_keys-Pragma) und daher hier erlaubt.
PRAGMA legacy_alter_table=ON;

ALTER TABLE amazon_products RENAME TO amazon_products_old;

CREATE TABLE amazon_products (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT    NOT NULL,
  status       TEXT    NOT NULL DEFAULT 'interessant'
                       CHECK (status IN ('interessant','warteliste','aktiv','bestehend','verworfen')),
  image_path   TEXT,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  notes        TEXT
);

INSERT INTO amazon_products (id, name, status, image_path, created_at, updated_at, notes)
  SELECT id, name, status, image_path, created_at, updated_at, notes
  FROM amazon_products_old;

DROP TABLE amazon_products_old;

PRAGMA legacy_alter_table=OFF;

CREATE INDEX amazon_products_status_idx
  ON amazon_products (status, created_at DESC);
