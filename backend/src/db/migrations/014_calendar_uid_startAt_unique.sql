-- Migration 014: Revert UNIQUE(apple_uid) -> UNIQUE(apple_uid, start_at) mit Minuten-Normalisierung
--
-- Problem mit 013: Recurring Events haben dieselbe apple_uid für alle Occurrences.
-- UNIQUE(apple_uid) lässt nur eine Occurrence pro wiederkehrendem Event zu → Occurrences verschwinden.
--
-- Richtige Lösung: UNIQUE(apple_uid, start_at) + start_at auf Minute runden.
-- Der Timing-Jitter von cal-read.applescript ist max 7 Sekunden — Rundung auf Minute löst das.

-- Sekunden aus start_at und end_at entfernen (auf Minute normalisieren)
UPDATE calendar_events SET
  start_at = strftime('%Y-%m-%dT%H:%M:00.000Z',
    datetime(start_at, '+30 seconds')),  -- erst +30s damit :53/:59 auf nächste Minute runden
  end_at   = strftime('%Y-%m-%dT%H:%M:00.000Z',
    datetime(end_at,   '+30 seconds'))
WHERE start_at GLOB '*T*:*:*.000Z' OR start_at GLOB '*T*:*:*Z';

-- Tabelle mit UNIQUE(apple_uid, start_at) neu erstellen
CREATE TABLE calendar_events_v3 (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  apple_uid      TEXT    NOT NULL,
  start_at       TEXT    NOT NULL,
  end_at         TEXT    NOT NULL,
  title          TEXT    NOT NULL,
  location       TEXT,
  notes          TEXT,
  is_all_day     INTEGER NOT NULL DEFAULT 0,
  calendar_name  TEXT    NOT NULL,
  apple_stamp    TEXT,
  sync_status    TEXT    NOT NULL DEFAULT 'synced'
                   CHECK(sync_status IN ('synced','pending_push','pending_delete')),
  last_synced_at TEXT,
  created_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  updated_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
  UNIQUE(apple_uid, start_at)
);

INSERT OR IGNORE INTO calendar_events_v3 SELECT * FROM calendar_events;

DROP TABLE calendar_events;
ALTER TABLE calendar_events_v3 RENAME TO calendar_events;
