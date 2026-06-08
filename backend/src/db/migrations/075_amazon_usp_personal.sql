-- Migration 075: USP persoenlicher Bereich (2026-06-08)
-- WICHTIG: Kein FK-Pragma setzen. Rein additiv. Auto-Backup via migrate.ts.

ALTER TABLE amazon_usp ADD COLUMN bsp_amazon      TEXT;
ALTER TABLE amazon_usp ADD COLUMN bsp_alibaba     TEXT;
ALTER TABLE amazon_usp ADD COLUMN bsp_pinterest   TEXT;
ALTER TABLE amazon_usp ADD COLUMN differenzierung TEXT;

CREATE TABLE amazon_usp_kaufgruende (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL REFERENCES amazon_products(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  text        TEXT    NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX amazon_usp_kaufgruende_product_idx
  ON amazon_usp_kaufgruende (product_id, sort_order, id);

CREATE TABLE amazon_usp_files (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id    INTEGER NOT NULL REFERENCES amazon_products(id) ON DELETE CASCADE,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  file_path     TEXT    NOT NULL,
  original_name TEXT    NOT NULL DEFAULT '',
  mime          TEXT    NOT NULL DEFAULT '',
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX amazon_usp_files_product_idx
  ON amazon_usp_files (product_id, sort_order, id);
