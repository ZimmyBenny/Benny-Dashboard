-- Keyword-Recherche: Quellen-Liste + Keyword-Pool je Produkt.
-- Additiv (neue Tabellen), kein Rebuild, kein PRAGMA (foreign_keys zentral in migrate.ts).

-- Konkurrenz-Quellen je Produkt (ASIN/Link/Umsatz) — eigene Liste, per Knopf aus Mitbewerbern importierbar.
CREATE TABLE IF NOT EXISTS amazon_keyword_sources (
  id          INTEGER PRIMARY KEY,
  product_id  INTEGER NOT NULL REFERENCES amazon_products(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  asin        TEXT NOT NULL DEFAULT '',
  url         TEXT NOT NULL DEFAULT '',
  revenue     TEXT NOT NULL DEFAULT '',   -- Umsatz, Freitext (z. B. "12.000 EUR/Monat")
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS ix_amazon_keyword_sources_product ON amazon_keyword_sources(product_id);

-- Keyword-Pool je Produkt.
CREATE TABLE IF NOT EXISTS amazon_keywords (
  id            INTEGER PRIMARY KEY,
  product_id    INTEGER NOT NULL REFERENCES amazon_products(id) ON DELETE CASCADE,
  phrase        TEXT NOT NULL,
  search_volume INTEGER,                  -- nullable, manuell gepflegt
  source        TEXT NOT NULL DEFAULT '', -- Freitext/ASIN/"Claude"/"manuell"
  is_main       INTEGER NOT NULL DEFAULT 0,
  target_field  TEXT NOT NULL DEFAULT '', -- '' | title | bullet_1..bullet_5 | backend
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS ix_amazon_keywords_product ON amazon_keywords(product_id);
-- Dedup je Produkt, unabhängig von Groß-/Kleinschreibung -> Massen-Paste nutzt INSERT OR IGNORE.
CREATE UNIQUE INDEX IF NOT EXISTS ux_amazon_keywords_phrase ON amazon_keywords(product_id, phrase COLLATE NOCASE);
