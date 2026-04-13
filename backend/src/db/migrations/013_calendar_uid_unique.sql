-- Migration 013: Duplikate bereinigen und UNIQUE(apple_uid, start_at) -> UNIQUE(apple_uid)
--
-- Problem: AppleScript-Epoch-Berechnung hat ~7s Timing-Varianz (nowEpoch und theNow werden
-- zu unterschiedlichen Zeitpunkten gecaptured). Dadurch entstehen pro Sync neue Zeilen fuer
-- denselben Event mit leicht unterschiedlichen start_at Werten (:53, :59, :00).
--
-- Fix: UNIQUE nur auf apple_uid (Apple Calendar gibt pro Event-Occurrence eine eindeutige UID).

-- Schritt 1: Duplikate bereinigen — pro apple_uid nur die Zeile mit der saubersten start_at
-- behalten (die mit dem latest updated_at, die in der Regel die "exakteste" Zeit hat).
DELETE FROM calendar_events
WHERE id NOT IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY apple_uid
             ORDER BY
               -- Bevorzuge Zeilen mit runden Sekunden (:00), dann neueste
               CASE WHEN start_at LIKE '%:00.000Z' THEN 0
                    WHEN start_at LIKE '%:00Z'      THEN 0
                    ELSE 1 END ASC,
               updated_at DESC
           ) AS rn
    FROM calendar_events
  ) ranked
  WHERE rn = 1
);

-- Schritt 2: Tabelle mit neuer Unique-Constraint neu erstellen (SQLite unterstuetzt kein ALTER CONSTRAINT)
CREATE TABLE calendar_events_new (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  apple_uid      TEXT    NOT NULL UNIQUE,
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
  updated_at     TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);

INSERT INTO calendar_events_new SELECT * FROM calendar_events;

DROP TABLE calendar_events;
ALTER TABLE calendar_events_new RENAME TO calendar_events;
