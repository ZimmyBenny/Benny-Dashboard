-- Migration 049: Amazon Reviews — seller_notified Flag (Phase 5 Polish 2026-05-26)
-- Boolean-Flag (INTEGER 0/1) ob der User dem Verkaeufer die geschriebene Bewertung
-- bestaetigt/zugeschickt hat (Tester-Programm-Workflow).
-- WICHTIG: Kein FK-Pragma setzen — wird zentral in migrate.ts gesteuert
-- WICHTIG: Auto-Backup laeuft via migrate.ts vor Anwendung

ALTER TABLE amazon_reviews ADD COLUMN seller_notified INTEGER NOT NULL DEFAULT 0 CHECK (seller_notified IN (0, 1));
