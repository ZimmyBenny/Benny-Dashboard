-- Migration 069: "ins PDF" pro Punkt × Hersteller (2026-06-08)
-- WICHTIG: Kein FK-Pragma setzen. Rein additiv (eine Spalte, Default 1 = im PDF des Herstellers).

ALTER TABLE amazon_usp_feasibility
  ADD COLUMN include_in_pdf INTEGER NOT NULL DEFAULT 1 CHECK (include_in_pdf IN (0,1));
