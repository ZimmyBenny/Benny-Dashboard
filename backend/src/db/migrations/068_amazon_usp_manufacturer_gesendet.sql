-- Migration 068: USP-Hersteller "gesendet"-Status (2026-06-08)
-- WICHTIG: Kein FK-Pragma setzen. Rein additiv (eine Spalte, Default 0 = noch nicht gesendet).

ALTER TABLE amazon_usp_manufacturers
  ADD COLUMN gesendet INTEGER NOT NULL DEFAULT 0 CHECK (gesendet IN (0,1));
