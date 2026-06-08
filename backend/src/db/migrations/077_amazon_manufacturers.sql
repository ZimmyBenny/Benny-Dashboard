CREATE TABLE amazon_manufacturers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id      INTEGER NOT NULL REFERENCES amazon_products(id),
  sort_order      INTEGER NOT NULL DEFAULT 0,
  name            TEXT    NOT NULL DEFAULT '',
  ansprechpartner TEXT,
  adresse         TEXT,
  email           TEXT,
  webseite        TEXT,
  notizen         TEXT,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE amazon_manufacturer_offers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  manufacturer_id INTEGER NOT NULL REFERENCES amazon_manufacturers(id),
  sort_order      INTEGER NOT NULL DEFAULT 0,
  menge_variante  TEXT,
  preis           TEXT,
  moq             TEXT,
  lieferzeit      TEXT,
  datum           TEXT,
  notiz           TEXT,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
);
