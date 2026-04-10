-- calendar_events: Apple-Events gespiegelt in SQLite
CREATE TABLE IF NOT EXISTS calendar_events (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  apple_uid      TEXT    NOT NULL,
  start_at       TEXT    NOT NULL,  -- ISO 8601 UTC
  end_at         TEXT    NOT NULL,  -- ISO 8601 UTC
  title          TEXT    NOT NULL,
  location       TEXT,
  notes          TEXT,
  is_all_day     INTEGER NOT NULL DEFAULT 0,
  calendar_name  TEXT    NOT NULL,
  apple_stamp    TEXT,              -- stamp date als ISO UTC (fuer Konflikt-Aufloesung)
  sync_status    TEXT    NOT NULL DEFAULT 'synced'
                   CHECK(sync_status IN ('synced','pending_push','pending_delete')),
  last_synced_at TEXT,
  created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(apple_uid, start_at)
);

-- calendar_sync_log: Audit-Trail aller Sync-Aktionen
CREATE TABLE IF NOT EXISTS calendar_sync_log (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  synced_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  calendar_name TEXT,
  event_title   TEXT,
  apple_uid     TEXT,
  action        TEXT NOT NULL CHECK(action IN ('created','updated','deleted','skipped','conflict')),
  direction     TEXT NOT NULL CHECK(direction IN ('pull','push')),
  success       INTEGER NOT NULL DEFAULT 1,
  error_message TEXT
);

-- known_calendars: Welche Kalender wurden jemals gesehen?
CREATE TABLE IF NOT EXISTS known_calendars (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL UNIQUE,
  color         TEXT,
  enabled       INTEGER NOT NULL DEFAULT 1,
  first_seen_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
