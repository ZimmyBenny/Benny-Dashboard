-- Migration 047: Amazon Reviews — product_url Spalte (Phase 5 Polish 2026-05-26)
-- WICHTIG: Kein FK-Pragma setzen — wird zentral in migrate.ts gesteuert
-- WICHTIG: Auto-Backup laeuft via migrate.ts vor Anwendung

ALTER TABLE amazon_reviews ADD COLUMN product_url TEXT;
