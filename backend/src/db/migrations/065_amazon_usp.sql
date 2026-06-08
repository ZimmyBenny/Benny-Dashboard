-- Migration 065: Amazon USP — Meta, Punkte, Bilder, Hersteller, Machbarkeit (2026-06-08)
-- WICHTIG: Kein FK-Pragma setzen — migrate.ts steuert foreign_keys zentral. Rein additiv.

CREATE TABLE amazon_usp (
  product_id  INTEGER PRIMARY KEY REFERENCES amazon_products(id) ON DELETE CASCADE,
  marke       TEXT,
  hauptfokus  TEXT,
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE amazon_usp_points (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL REFERENCES amazon_products(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  title       TEXT    NOT NULL DEFAULT '',
  body        TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX amazon_usp_points_product_idx ON amazon_usp_points (product_id, sort_order, id);

CREATE TABLE amazon_usp_point_images (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  point_id    INTEGER NOT NULL REFERENCES amazon_usp_points(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  file_path   TEXT    NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX amazon_usp_point_images_point_idx ON amazon_usp_point_images (point_id, sort_order, id);

CREATE TABLE amazon_usp_manufacturers (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL REFERENCES amazon_products(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  name        TEXT    NOT NULL DEFAULT '',
  datum       TEXT,
  notes       TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX amazon_usp_manufacturers_product_idx ON amazon_usp_manufacturers (product_id, sort_order, id);

CREATE TABLE amazon_usp_feasibility (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  point_id        INTEGER NOT NULL REFERENCES amazon_usp_points(id) ON DELETE CASCADE,
  manufacturer_id INTEGER NOT NULL REFERENCES amazon_usp_manufacturers(id) ON DELETE CASCADE,
  status          TEXT    NOT NULL DEFAULT 'offen' CHECK (status IN ('offen','umsetzbar','teilweise','nicht')),
  note            TEXT,
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (point_id, manufacturer_id)
);
CREATE INDEX amazon_usp_feasibility_point_idx ON amazon_usp_feasibility (point_id);
CREATE INDEX amazon_usp_feasibility_manufacturer_idx ON amazon_usp_feasibility (manufacturer_id);
