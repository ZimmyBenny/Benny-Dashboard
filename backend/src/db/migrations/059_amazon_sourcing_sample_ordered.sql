-- Migration 059: Amazon Sourcing — Beauftragt-Checkbox pro Sample (2026-06-01)
-- WICHTIG: Kein FK-Pragma setzen
-- WICHTIG: Auto-Backup laeuft via migrate.ts

ALTER TABLE amazon_sourcing_samples
  ADD COLUMN sample_ordered INTEGER NOT NULL DEFAULT 0
  CHECK (sample_ordered IN (0,1));
