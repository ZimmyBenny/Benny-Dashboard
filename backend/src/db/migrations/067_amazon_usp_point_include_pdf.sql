-- Migration 067: USP-Punkt-Schalter "ins PDF aufnehmen" (2026-06-08)
-- WICHTIG: Kein FK-Pragma setzen. Rein additiv (eine Spalte, Default 1 = wird gesendet).

ALTER TABLE amazon_usp_points
  ADD COLUMN include_in_pdf INTEGER NOT NULL DEFAULT 1 CHECK (include_in_pdf IN (0,1));
