-- Migration 102: amazon_products.status-CHECK um 'warteliste' erweitern (2026-07-06)
-- SQLite kann CHECK-Constraints nicht per ALTER aendern → Tabellen-Rebuild
-- nach dem Rename-Create-Copy-Drop-Muster (vgl. Migration 012).
-- WICHTIG: Kein PRAGMA foreign_keys — wird zentral in migrate.ts gesteuert.
-- WICHTIG: Auto-Backup laeuft via migrate.ts vor Anwendung.
-- Datensicherheit: Aktuelles Live-Schema = 7 Spalten (Migr. 057 legte 6 an,
-- Migr. 063 ergaenzte `notes`). Alle 7 Spalten MUESSEN in CREATE + INSERT SELECT,
-- sonst gehen Produkt-Notizen verloren.

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

CREATE INDEX amazon_products_status_idx
  ON amazon_products (status, created_at DESC);
