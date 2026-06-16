-- Samples pro Hersteller (Muster + Fotos einer Charge)
CREATE TABLE amazon_manufacturer_samples (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  manufacturer_id INTEGER NOT NULL REFERENCES amazon_manufacturers(id),
  sort_order      INTEGER NOT NULL DEFAULT 0,
  bezeichnung     TEXT    NOT NULL DEFAULT '',
  received_date   TEXT,
  rating          INTEGER NOT NULL DEFAULT 0,
  status          TEXT    NOT NULL DEFAULT 'erhalten',
  is_favorite     INTEGER NOT NULL DEFAULT 0,
  notizen         TEXT,
  maengel         TEXT,
  kosten          TEXT,
  currency        TEXT    NOT NULL DEFAULT 'USD',
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE amazon_manufacturer_sample_photos (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  sample_id     INTEGER NOT NULL REFERENCES amazon_manufacturer_samples(id),
  sort_order    INTEGER NOT NULL DEFAULT 0,
  file_path     TEXT    NOT NULL,
  original_name TEXT,
  mime          TEXT,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_mfr_samples_manufacturer ON amazon_manufacturer_samples(manufacturer_id);
CREATE INDEX idx_mfr_sample_photos_sample ON amazon_manufacturer_sample_photos(sample_id);
