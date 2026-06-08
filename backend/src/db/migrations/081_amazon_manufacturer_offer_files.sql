CREATE TABLE amazon_manufacturer_offer_files (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  offer_id      INTEGER NOT NULL REFERENCES amazon_manufacturer_offers(id),
  sort_order    INTEGER NOT NULL DEFAULT 0,
  file_path     TEXT    NOT NULL,
  original_name TEXT,
  mime          TEXT,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);
