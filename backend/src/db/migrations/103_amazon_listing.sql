-- Listing-Anatomie + Listing-/Wettbewerber-Bilder pro Produkt
-- Reine CREATE-Migration (kein Rebuild/RENAME von amazon_products).
-- ON DELETE CASCADE: beim Produkt-Löschen räumt der bestehende CASCADE-Zweig
-- der Produkt-Delete-Route diese Tabellen automatisch mit ab.
CREATE TABLE amazon_listing (
  product_id       INTEGER PRIMARY KEY REFERENCES amazon_products(id) ON DELETE CASCADE,
  title            TEXT    NOT NULL DEFAULT '',
  bullet_1         TEXT    NOT NULL DEFAULT '',
  bullet_2         TEXT    NOT NULL DEFAULT '',
  bullet_3         TEXT    NOT NULL DEFAULT '',
  bullet_4         TEXT    NOT NULL DEFAULT '',
  bullet_5         TEXT    NOT NULL DEFAULT '',
  description      TEXT    NOT NULL DEFAULT '',
  keywords_main    TEXT    NOT NULL DEFAULT '',
  keywords_backend TEXT    NOT NULL DEFAULT '',
  created_at       INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at       INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE amazon_listing_images (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id    INTEGER NOT NULL REFERENCES amazon_products(id) ON DELETE CASCADE,
  kind          TEXT    NOT NULL CHECK(kind IN ('listing','competitor')),
  sort_order    INTEGER NOT NULL DEFAULT 0,
  file_path     TEXT    NOT NULL,
  original_name TEXT,
  mime          TEXT,
  label         TEXT,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_listing_images_product ON amazon_listing_images(product_id, kind, sort_order);
