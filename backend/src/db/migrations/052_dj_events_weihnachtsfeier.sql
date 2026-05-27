-- Migration 052: 'weihnachtsfeier' als Event-Typ hinzufuegen (User-Decision 2026-05-27)
-- SQLite kann CHECK-Constraints nicht ALTER'n -> Tabellen-Rebuild noetig.
-- Views droppen vor Rebuild, danach neu anlegen (analog Migration 029).
-- WICHTIG: Kein FK-Pragma setzen — wird zentral in migrate.ts gesteuert
-- WICHTIG: Auto-Backup laeuft via migrate.ts vor Anwendung

DROP VIEW IF EXISTS v_dj_trips;
DROP VIEW IF EXISTS v_dj_open_invoices;

CREATE TABLE dj_events_new (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id     INTEGER REFERENCES contacts(id),
    location_id     INTEGER REFERENCES dj_locations(id),
    title           TEXT,
    event_type      TEXT NOT NULL CHECK (event_type IN (
                        'hochzeit','firmen_event','club_bar',
                        'geburtstag','festival','weihnachtsfeier','sonstige'
                    )),
    event_date      TEXT,
    time_start      TEXT,
    time_end        TEXT,
    setup_minutes   INTEGER DEFAULT 90,
    teardown_minutes INTEGER DEFAULT 90,
    guests          INTEGER,
    status          TEXT NOT NULL DEFAULT 'anfrage' CHECK (status IN (
                        'anfrage','neu','vorgespraech_vereinbart','angebot_gesendet',
                        'bestaetigt','abgeschlossen','abgesagt'
                    )),
    contact_on_site_name  TEXT,
    contact_on_site_phone TEXT,
    contact_on_site_email TEXT,
    notes           TEXT,
    cancellation_reason TEXT,
    quote_id        INTEGER,
    invoice_id      INTEGER,
    wishes_token    TEXT UNIQUE,
    questionnaire_token TEXT UNIQUE,
    run_sheet_json  TEXT,
    source_channel  TEXT,
    venue_name      TEXT,
    venue_street    TEXT,
    venue_zip       TEXT,
    venue_city      TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at      TEXT,
    calendar_uid    TEXT,
    vorgespraech_status TEXT,
    vorgespraech_datum TEXT,
    vorgespraech_ort TEXT,
    vorgespraech_notizen TEXT,
    vorgespraech_km REAL,
    vorgespraech_calendar_uid TEXT,
    vorgespraech_plz TEXT,
    customer_freetext TEXT
);

INSERT INTO dj_events_new
    SELECT id, customer_id, location_id, title, event_type, event_date,
           time_start, time_end, setup_minutes, teardown_minutes, guests, status,
           contact_on_site_name, contact_on_site_phone, contact_on_site_email,
           notes, cancellation_reason, quote_id, invoice_id,
           wishes_token, questionnaire_token, run_sheet_json,
           source_channel, venue_name, venue_street, venue_zip, venue_city,
           created_at, updated_at, deleted_at,
           calendar_uid,
           vorgespraech_status, vorgespraech_datum, vorgespraech_ort, vorgespraech_notizen,
           vorgespraech_km, vorgespraech_calendar_uid, vorgespraech_plz,
           customer_freetext
    FROM dj_events;

DROP TABLE dj_events;
ALTER TABLE dj_events_new RENAME TO dj_events;

CREATE INDEX IF NOT EXISTS idx_dj_events_date     ON dj_events(event_date);
CREATE INDEX IF NOT EXISTS idx_dj_events_status   ON dj_events(status);
CREATE INDEX IF NOT EXISTS idx_dj_events_customer ON dj_events(customer_id);
CREATE INDEX IF NOT EXISTS idx_dj_events_type     ON dj_events(event_type);

CREATE VIEW IF NOT EXISTS v_dj_trips AS
SELECT
    e.id                                                AS event_id,
    e.event_date                                        AS date,
    COALESCE(e.title, 'Event ' || e.id)                 AS event_name,
    e.event_type                                        AS event_type,
    COALESCE(e.status, 'anfrage')                       AS event_status,
    l.distance_km                                       AS distance_km_one_way,
    l.travel_time_min                                   AS travel_time_min_one_way,
    (COALESCE(l.distance_km, 0) * 2)                    AS total_km,
    (COALESCE(l.distance_km, 0) * 2 * 0.30)             AS deductible_value,
    (
        COALESCE(e.setup_minutes, 90)
      + (
          CASE
            WHEN e.time_start IS NOT NULL AND e.time_end IS NOT NULL
            THEN (strftime('%s', '2000-01-01 ' || e.time_end) - strftime('%s', '2000-01-01 ' || e.time_start)) / 60
            ELSE 240
          END
        )
      + COALESCE(e.teardown_minutes, 90)
      + (COALESCE(l.travel_time_min, 0) * 2)
    ) / 60.0                                            AS absence_hours,
    CAST(strftime('%Y', e.event_date) AS INTEGER)       AS year
FROM dj_events e
LEFT JOIN dj_locations l ON l.id = e.location_id
WHERE e.deleted_at IS NULL
  AND e.event_date IS NOT NULL;

CREATE VIEW IF NOT EXISTS v_dj_open_invoices AS
SELECT
    i.*,
    (i.total_gross - i.paid_amount) AS outstanding
FROM dj_invoices i
WHERE i.finalized_at IS NOT NULL
  AND i.status IN ('offen','teilbezahlt','ueberfaellig')
  AND i.is_cancellation = 0;
