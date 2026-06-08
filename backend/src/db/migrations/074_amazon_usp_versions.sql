-- Migration 074: USP-Versionen (gespeicherte PDF je Hersteller) (2026-06-08)
-- WICHTIG: Kein FK-Pragma setzen. Rein additiv. Auto-Backup via migrate.ts.

CREATE TABLE amazon_usp_versions (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id        INTEGER NOT NULL REFERENCES amazon_products(id) ON DELETE CASCADE,
  manufacturer_name TEXT    NOT NULL DEFAULT '',
  file_path         TEXT    NOT NULL,
  created_at        INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX amazon_usp_versions_product_idx
  ON amazon_usp_versions (product_id, created_at, id);
