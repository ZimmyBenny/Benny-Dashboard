-- Migration 114 — „Gesendet an"-Marker fuer Produkt-Dokumente (2026-07-09)
-- Pro Datei (amazon_product_docs) merken, an welche Hersteller (amazon_manufacturers)
-- sie schon geschickt wurde. Reines Haekchen pro Paar — kein Datum, nur ausgehend.
-- Additive Tabelle, kein Rebuild → kein Datenverlust.
-- Beide FKs ON DELETE CASCADE: Loeschen einer Datei ODER eines Herstellers raeumt die
-- zugehoerigen Marker automatisch mit ab. KEIN PRAGMA foreign_keys hier (zentral in migrate.ts).
CREATE TABLE amazon_product_doc_sends (
  file_id         INTEGER NOT NULL REFERENCES amazon_product_docs(id) ON DELETE CASCADE,
  manufacturer_id INTEGER NOT NULL REFERENCES amazon_manufacturers(id) ON DELETE CASCADE,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (file_id, manufacturer_id)
);
CREATE INDEX idx_amazon_product_doc_sends_mfr ON amazon_product_doc_sends(manufacturer_id);
