-- Migration 061: Amazon Brand-Sektion — Ranking-Spalte (1-3 Sterne) fuer Candidates
-- WICHTIG: Kein FK-Pragma setzen
-- WICHTIG: Auto-Backup laeuft via migrate.ts

ALTER TABLE amazon_brand_name_candidates
  ADD COLUMN ranking INTEGER
  CHECK (ranking IS NULL OR (ranking >= 1 AND ranking <= 3));
