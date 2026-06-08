-- Migration 073: Status der USP-Sektion je Produkt (2026-06-08)
-- Gleiche Werte wie Sourcing/Brand: offen / in_bearbeitung / erledigt.
-- WICHTIG: Kein FK-Pragma setzen. Rein additiv (eine Spalte, Default 'offen').

ALTER TABLE amazon_usp
  ADD COLUMN status TEXT NOT NULL DEFAULT 'offen' CHECK (status IN ('offen','in_bearbeitung','erledigt'));
