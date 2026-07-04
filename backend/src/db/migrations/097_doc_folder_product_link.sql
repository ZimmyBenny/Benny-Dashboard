-- Migration 097: doc_folders.product_id — Amazon-Produkt-Verknuepfung (2026-07-04)
-- Additiv: ON DELETE SET NULL -> Produkt-Loeschung entfernt nur die Verknuepfung,
-- der Ordner bleibt erhalten. Kein PRAGMA foreign_keys (zentral in migrate.ts).
ALTER TABLE doc_folders ADD COLUMN product_id INTEGER
  REFERENCES amazon_products(id) ON DELETE SET NULL;
CREATE INDEX idx_doc_folders_product ON doc_folders(product_id);
