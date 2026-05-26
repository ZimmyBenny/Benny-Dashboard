-- Migration 050: Amazon Reviews — seller_notified_at Zeitstempel (Phase 5 Polish 2026-05-26)
-- Datum/Zeit wann seller_notified auf 1 gesetzt wurde. Wird genutzt um die
-- Wartezeit bis Amazon-Freigabe der Bewertung zu visualisieren.
-- WICHTIG: Kein FK-Pragma setzen — wird zentral in migrate.ts gesteuert
-- WICHTIG: Auto-Backup laeuft via migrate.ts vor Anwendung

ALTER TABLE amazon_reviews ADD COLUMN seller_notified_at TEXT;

-- Backfill: bestehende Items mit seller_notified=1 bekommen updated_at als Approximation
UPDATE amazon_reviews
SET seller_notified_at = updated_at
WHERE seller_notified = 1
  AND seller_notified_at IS NULL;
