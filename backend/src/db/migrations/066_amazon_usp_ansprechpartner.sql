-- Migration 066: Ansprechpartner je USP-Hersteller (2026-06-08)
-- WICHTIG: Kein FK-Pragma setzen. Rein additiv (eine Spalte).

ALTER TABLE amazon_usp_manufacturers ADD COLUMN ansprechpartner TEXT;
