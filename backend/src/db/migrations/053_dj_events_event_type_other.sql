-- Migration 053: dj_events.event_type_other (User-Decision 2026-05-27)
-- Wenn event_type='sonstige', kann der User hier eine Freitext-Spezifizierung
-- eingeben (z.B. 'Weinprobe', 'Vereinsfeier', etc.) ohne dass das title-Feld
-- (Veranstaltungsname) zweckentfremdet wird.
--
-- WICHTIG: Kein FK-Pragma setzen — wird zentral in migrate.ts gesteuert
-- WICHTIG: Auto-Backup laeuft via migrate.ts vor Anwendung

ALTER TABLE dj_events ADD COLUMN event_type_other TEXT;
