-- Migration 025: Kalender v2 Tabellen fuer Swift EventKit Integration
-- Die alten Tabellen (calendar_events, calendar_sync_log, known_calendars) bleiben bestehen.

-- Kalender-Verzeichnis (ersetzt known_calendars)
CREATE TABLE IF NOT EXISTS calendars (
  id         TEXT PRIMARY KEY,  -- EKCalendar.calendarIdentifier
  title      TEXT NOT NULL,
  color      TEXT,              -- Hex-Farbe z.B. #ff5733
  is_visible INTEGER NOT NULL DEFAULT 1,
  synced_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

-- Sync-Range-Tracking: welche Zeitraeume wurden schon gecacht?
CREATE TABLE IF NOT EXISTS calendar_sync_ranges (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  range_start TEXT NOT NULL,  -- YYYY-MM-DD
  range_end   TEXT NOT NULL,  -- YYYY-MM-DD
  synced_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(range_start, range_end)
);

-- calendar_events um calendar_id Spalte erweitern (nullable fuer bestehende Events)
ALTER TABLE calendar_events ADD COLUMN calendar_id TEXT;
