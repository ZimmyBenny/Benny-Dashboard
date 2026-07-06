-- Migration 107 — Amazon Produkt-Dokumente (Verpackungsdesign + Aufbauanleitung/Gebrauchsanleitung)
-- Zwei aufklappbare Sektionen je Produkt mit Datei-/Bild-Upload + Notizfeld.
-- ON DELETE CASCADE auf product_id: Produkt-Löschen räumt diese Tabellen automatisch mit ab
-- (die Delete-Route in amazon.products.routes.ts muss NICHT angefasst werden).
-- KEIN PRAGMA foreign_keys hier — wird zentral in migrate.ts gesteuert. Auto-Backup via migrate.ts.

CREATE TABLE amazon_product_docs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id    INTEGER NOT NULL REFERENCES amazon_products(id) ON DELETE CASCADE,
  area          TEXT    NOT NULL CHECK(area IN ('verpackung','anleitung')),
  sort_order    INTEGER NOT NULL DEFAULT 0,
  file_path     TEXT    NOT NULL,
  original_name TEXT,
  mime          TEXT,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_amazon_product_docs ON amazon_product_docs(product_id, area, sort_order);

CREATE TABLE amazon_product_doc_notes (
  product_id  INTEGER NOT NULL REFERENCES amazon_products(id) ON DELETE CASCADE,
  area        TEXT    NOT NULL CHECK(area IN ('verpackung','anleitung')),
  notes       TEXT    NOT NULL DEFAULT '',
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (product_id, area)
);
