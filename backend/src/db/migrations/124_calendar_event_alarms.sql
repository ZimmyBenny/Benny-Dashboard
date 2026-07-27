-- Mehrere Erinnerungen pro Termin: JSON-Array von Minuten-Offsets relativ zum Start
-- (negativ = vorher). [] = keine Erinnerung, NULL = unbekannt (Alt-Events bis zum Sync).
-- Additiv: kein Rebuild, kein PRAGMA foreign_keys (wird zentral in migrate.ts gesteuert).
ALTER TABLE calendar_events ADD COLUMN alarms TEXT;
