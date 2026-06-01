-- Migration 057: Amazon ECO-Dashboard — Produkt-Tabelle (2026-06-01)
-- WICHTIG: Kein FK-Pragma setzen — wird zentral in migrate.ts gesteuert
-- WICHTIG: Auto-Backup laeuft via migrate.ts vor Anwendung

CREATE TABLE amazon_products (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT    NOT NULL,
  status       TEXT    NOT NULL DEFAULT 'interessant'
                       CHECK (status IN ('interessant','aktiv','bestehend','verworfen')),
  image_path   TEXT,
  created_at   INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at   INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX amazon_products_status_idx
  ON amazon_products (status, created_at DESC);
