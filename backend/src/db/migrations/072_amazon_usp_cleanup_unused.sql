-- Migration 072: ungenutzte USP-Spalten entfernen (2026-06-08)
-- amazon_usp_points.include_in_pdf wurde durch amazon_usp_feasibility.include_in_pdf
--   (pro Punkt x Hersteller) ersetzt und ist nicht mehr in Gebrauch.
-- amazon_usp_manufacturers.gesendet wurde wieder verworfen.
-- WICHTIG: Kein FK-Pragma setzen. Auto-Backup laeuft via migrate.ts.

ALTER TABLE amazon_usp_points DROP COLUMN include_in_pdf;
ALTER TABLE amazon_usp_manufacturers DROP COLUMN gesendet;
