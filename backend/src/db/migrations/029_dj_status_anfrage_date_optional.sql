-- Migration 029: Status 'anfrage' hinzufügen + event_date optional machen
-- Rebuild dj_events Tabelle wegen CHECK-Constraint-Änderung

CREATE TABLE dj_events_new (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id     INTEGER REFERENCES contacts(id),
    location_id     INTEGER REFERENCES dj_locations(id),
    title           TEXT,
    event_type      TEXT NOT NULL CHECK (event_type IN (
                        'hochzeit','firmen_event','club_bar',
                        'geburtstag','festival','sonstige'
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
    deleted_at      TEXT
);

INSERT INTO dj_events_new
    SELECT id, customer_id, location_id, title, event_type, event_date,
           time_start, time_end, setup_minutes, teardown_minutes, guests, status,
           contact_on_site_name, contact_on_site_phone, contact_on_site_email,
           notes, cancellation_reason, quote_id, invoice_id,
           wishes_token, questionnaire_token, run_sheet_json,
           source_channel, venue_name, venue_street, venue_zip, venue_city,
           created_at, updated_at, deleted_at
    FROM dj_events;

DROP TABLE dj_events;
ALTER TABLE dj_events_new RENAME TO dj_events;

CREATE INDEX IF NOT EXISTS idx_dj_events_date     ON dj_events(event_date);
CREATE INDEX IF NOT EXISTS idx_dj_events_status   ON dj_events(status);
CREATE INDEX IF NOT EXISTS idx_dj_events_customer ON dj_events(customer_id);
CREATE INDEX IF NOT EXISTS idx_dj_events_type     ON dj_events(event_type);
