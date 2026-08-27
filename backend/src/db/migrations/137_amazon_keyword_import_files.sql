-- Gespeicherte Helium-10-Import-Datei je Produkt (immer die aktuellste).
-- Additiv; PRIMARY KEY auf product_id -> genau eine Datei pro Produkt (Upsert).
CREATE TABLE IF NOT EXISTS amazon_keyword_import_files (
  product_id    INTEGER PRIMARY KEY REFERENCES amazon_products(id) ON DELETE CASCADE,
  file_path     TEXT NOT NULL,
  original_name TEXT NOT NULL DEFAULT '',
  mime          TEXT NOT NULL DEFAULT '',
  size          INTEGER NOT NULL DEFAULT 0,
  imported_at   INTEGER NOT NULL DEFAULT (unixepoch())
);
