-- Migration 095: amazon_research_topics.product_id NULLABLE (2026-07-04)
--
-- Zweck: Globale Recherche-Themen sollen produktunabhaengig existieren koennen
--   (product_id IS NULL). Bisher war product_id NOT NULL. SQLite unterstuetzt kein
--   "ALTER COLUMN DROP NOT NULL" -> Tabellen-Rebuild (DROP + CREATE + INSERT SELECT).
--
-- WICHTIG:
-- - Kein PRAGMA foreign_keys hier (zentral in migrate.ts gesteuert; Auto-Backup dort).
-- - Alle bestehenden Zeilen werden 1:1 erhalten (INSERT SELECT aller Spalten).
-- - Struktur identisch zu 084 — nur product_id verliert NOT NULL.
-- - Indizes werden neu angelegt.

CREATE TABLE amazon_research_topics_new (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER REFERENCES amazon_products(id),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  title       TEXT    NOT NULL DEFAULT '',
  is_expanded INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

INSERT INTO amazon_research_topics_new
  (id, product_id, sort_order, title, is_expanded, created_at, updated_at)
SELECT id, product_id, sort_order, title, is_expanded, created_at, updated_at
FROM amazon_research_topics;

DROP TABLE amazon_research_topics;
ALTER TABLE amazon_research_topics_new RENAME TO amazon_research_topics;

CREATE INDEX idx_research_topics_product ON amazon_research_topics(product_id);
