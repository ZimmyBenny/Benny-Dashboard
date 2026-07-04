-- Migration 094: Recherche-Karten global schaltbar (2026-07-04)
-- Additiv: neue Spalte is_global auf amazon_research_cards.
-- Global markierte Karten (is_global=1) erscheinen ZUSAETZLICH auf der neuen
--   globalen Seite "Recherche & Wissen" — bleiben aber weiterhin beim Produkt.
-- WICHTIG: Kein FK-Pragma setzen (zentral in migrate.ts). Auto-Backup via migrate.ts.
-- Kein Table-Rebuild — reine ADD COLUMN, kein Datenverlust-Risiko.

ALTER TABLE amazon_research_cards
  ADD COLUMN is_global INTEGER NOT NULL DEFAULT 0
  CHECK (is_global IN (0, 1));
