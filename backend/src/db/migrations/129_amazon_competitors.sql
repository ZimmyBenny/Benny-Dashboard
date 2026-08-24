-- Sektion „Mitbewerber": Konkurrenzprodukte je Amazon-Produkt erfassen & analysieren.
-- Flache Liste (competitors) + Anhänge/Screenshots (competitor_files), analog USP/Recherche.
-- Additiv, kein Rebuild, kein PRAGMA foreign_keys (migrate.ts steuert zentral).

CREATE TABLE amazon_competitors (
  id              INTEGER PRIMARY KEY,
  product_id      INTEGER NOT NULL REFERENCES amazon_products(id) ON DELETE CASCADE,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  asin            TEXT    NOT NULL DEFAULT '',
  url             TEXT    NOT NULL DEFAULT '',
  title           TEXT    NOT NULL DEFAULT '',
  price           TEXT    NOT NULL DEFAULT '',   -- Freitext (Format/Währung variiert)
  rating          REAL,                          -- 0–5, NULL = keine Angabe
  reviews         INTEGER,                       -- Anzahl Bewertungen, NULL = keine Angabe
  strengths       TEXT    NOT NULL DEFAULT '',
  weaknesses      TEXT    NOT NULL DEFAULT '',
  differentiation TEXT    NOT NULL DEFAULT '',
  is_main         INTEGER NOT NULL DEFAULT 0 CHECK (is_main IN (0,1)),
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_amazon_competitors_product ON amazon_competitors(product_id);

CREATE TABLE amazon_competitor_files (
  id            INTEGER PRIMARY KEY,
  competitor_id INTEGER NOT NULL REFERENCES amazon_competitors(id) ON DELETE CASCADE,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  file_path     TEXT    NOT NULL,               -- UUID-Dateiname auf Platte
  original_name TEXT,                            -- Originalname (UTF-8, latin1-dekodiert)
  mime          TEXT,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_amazon_competitor_files_comp ON amazon_competitor_files(competitor_id);
