-- Sample-Pruefbericht: Pruefergebnisse je Sample + USP-Punkt
CREATE TABLE amazon_sample_inspection_results (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  sample_id   INTEGER NOT NULL REFERENCES amazon_manufacturer_samples(id) ON DELETE CASCADE,
  point_id    INTEGER NOT NULL REFERENCES amazon_usp_points(id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'offen',  -- 'erfuellt' | 'teilweise' | 'nicht' | 'offen'
  note        TEXT,
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE (sample_id, point_id)
);

CREATE INDEX idx_sample_inspection_sample ON amazon_sample_inspection_results(sample_id);

-- Zusatz-Notizen des Pruefberichts (letzte PDF-Seite)
ALTER TABLE amazon_manufacturer_samples ADD COLUMN inspection_notes TEXT;
