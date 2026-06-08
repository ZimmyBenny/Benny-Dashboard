-- Migration 070: USP-Logo (Bild) je Produkt (2026-06-08)
-- WICHTIG: Kein FK-Pragma setzen. Rein additiv (eine Spalte).

ALTER TABLE amazon_usp ADD COLUMN logo_path TEXT;
