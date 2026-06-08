-- Migration 076: finale Marke je Produkt im Markenname-Modul (2026-06-08)
-- WICHTIG: Kein FK-Pragma setzen. Rein additiv (eine Spalte, Default 0).

ALTER TABLE amazon_brand_name_candidates
  ADD COLUMN is_final INTEGER NOT NULL DEFAULT 0 CHECK (is_final IN (0,1));
