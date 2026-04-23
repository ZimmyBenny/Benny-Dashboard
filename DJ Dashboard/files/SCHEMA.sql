-- =============================================================================
-- DJ-Modul — Initial Schema (SQLite)
-- Dashboard: Pulse Console / Kinetic Pulse
-- Für: Benjamin Zimmermann | Dein Event DJ | Roding
--
-- Design-Prinzipien:
--   - GoBD-konform: Finalisierte Rechnungen/Angebote via Trigger readonly
--   - Lückenlose Nummernkreise via number_sequences (atomar in Transaktion)
--   - Soft-Delete überall (deleted_at) statt harter DELETE
--   - Audit-Log für alle finanzrelevanten Änderungen
--   - Schema enthält bereits Felder für Phase-2-Features
--     (Musikwünsche, Anzahlungen, Mahnwesen, Equipment, Run-Sheets)
-- =============================================================================

PRAGMA foreign_keys = ON;

-- =============================================================================
-- 1. NUMMERNKREISE (atomar, lückenlos)
-- =============================================================================

CREATE TABLE IF NOT EXISTS number_sequences (
    key           TEXT PRIMARY KEY,             -- 'invoice', 'quote', 'customer', 'credit_note'
    prefix        TEXT NOT NULL,                -- 'RE', 'AN', '', 'GS'
    current_value INTEGER NOT NULL DEFAULT 0,   -- zuletzt vergebene Nummer
    padding       INTEGER NOT NULL DEFAULT 4,   -- 4 → RE-1061, RE-1062
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =============================================================================
-- 2. EINSTELLUNGEN (Key-Value)
-- =============================================================================

CREATE TABLE IF NOT EXISTS dj_settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,                   -- JSON oder String
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =============================================================================
-- 3. KUNDEN
-- =============================================================================

CREATE TABLE IF NOT EXISTS dj_customers (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    number          INTEGER UNIQUE NOT NULL,    -- Kundennummer, z.B. 1020
    salutation      TEXT,                       -- 'Herr', 'Frau', 'Familie', 'Firma'
    first_name      TEXT,
    last_name       TEXT,
    company         TEXT,
    address         TEXT,
    zip             TEXT,
    city            TEXT,
    country         TEXT DEFAULT 'Deutschland',
    phone           TEXT,
    mobile          TEXT,
    email           TEXT,
    website         TEXT,
    notes           TEXT,                       -- Markdown
    source          TEXT,                       -- 'empfehlung', 'website', 'google', ...
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_dj_customers_name     ON dj_customers(last_name, first_name);
CREATE INDEX IF NOT EXISTS idx_dj_customers_company  ON dj_customers(company);
CREATE INDEX IF NOT EXISTS idx_dj_customers_email    ON dj_customers(email);
CREATE INDEX IF NOT EXISTS idx_dj_customers_deleted  ON dj_customers(deleted_at);

-- =============================================================================
-- 4. LOCATIONS (wiederverwendbare Event-Locations)
-- =============================================================================

CREATE TABLE IF NOT EXISTS dj_locations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    address         TEXT,
    zip             TEXT,
    city            TEXT,
    country         TEXT DEFAULT 'Deutschland',
    latitude        REAL,
    longitude       REAL,
    distance_km     REAL,                       -- einfache Strecke ab Benny's Adresse
    travel_time_min INTEGER,                    -- einfache Fahrtzeit in Minuten
    contact_name    TEXT,
    contact_phone   TEXT,
    contact_email   TEXT,
    notes           TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_dj_locations_city    ON dj_locations(city);
CREATE INDEX IF NOT EXISTS idx_dj_locations_name    ON dj_locations(name);

-- =============================================================================
-- 5. EVENTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS dj_events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id     INTEGER REFERENCES dj_customers(id),
    location_id     INTEGER REFERENCES dj_locations(id),
    title           TEXT,                       -- "Hochzeit Müller", "Firmen-Event ACME"
    event_type      TEXT NOT NULL CHECK (event_type IN (
                        'hochzeit','firmen_event','club_bar',
                        'geburtstag','festival','sonstige'
                    )),
    event_date      TEXT NOT NULL,              -- ISO date 'YYYY-MM-DD'
    time_start      TEXT,                       -- 'HH:MM'
    time_end        TEXT,                       -- 'HH:MM'
    setup_minutes   INTEGER DEFAULT 90,         -- Aufbauzeit
    teardown_minutes INTEGER DEFAULT 90,        -- Abbauzeit
    guests          INTEGER,
    status          TEXT NOT NULL DEFAULT 'neu' CHECK (status IN (
                        'neu','vorgespraech_vereinbart','angebot_gesendet',
                        'bestaetigt','abgeschlossen','abgesagt'
                    )),
    contact_on_site_name  TEXT,
    contact_on_site_phone TEXT,
    contact_on_site_email TEXT,
    notes           TEXT,                       -- Markdown
    cancellation_reason TEXT,                   -- Grund bei Absage
    -- Verknüpfung (redundant für schnelle Queries)
    quote_id        INTEGER,
    invoice_id      INTEGER,
    -- Zukunfts-Features
    wishes_token    TEXT UNIQUE,                -- für öffentliches Musikwunsch-Portal
    questionnaire_token TEXT UNIQUE,            -- für Vorgespräch-Fragebogen
    run_sheet_json  TEXT,                       -- JSON: minutengenauer Ablaufplan
    --
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_dj_events_date      ON dj_events(event_date);
CREATE INDEX IF NOT EXISTS idx_dj_events_status    ON dj_events(status);
CREATE INDEX IF NOT EXISTS idx_dj_events_customer  ON dj_events(customer_id);
CREATE INDEX IF NOT EXISTS idx_dj_events_type      ON dj_events(event_type);

-- Event-Status-History (für Timeline)
CREATE TABLE IF NOT EXISTS dj_event_status_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id    INTEGER NOT NULL REFERENCES dj_events(id),
    from_status TEXT,
    to_status   TEXT NOT NULL,
    comment     TEXT,
    user_id     INTEGER,                        -- aus bestehendem Auth
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_dj_event_status_history_event ON dj_event_status_history(event_id);

-- Musikwünsche (für späteres Portal)
CREATE TABLE IF NOT EXISTS dj_event_wishes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id    INTEGER NOT NULL REFERENCES dj_events(id),
    artist      TEXT,
    title       TEXT NOT NULL,
    category    TEXT CHECK (category IN ('must_play','wish','no_go')),
    guest_name  TEXT,                           -- wer hat's eingetragen
    notes       TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_dj_event_wishes_event ON dj_event_wishes(event_id);

-- =============================================================================
-- 6. LEISTUNGEN & PAKETE
-- =============================================================================

CREATE TABLE IF NOT EXISTS dj_services (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    category    TEXT NOT NULL,                  -- 'audio','licht','effekte','dj_service','sonstiges'
    name        TEXT NOT NULL,
    description TEXT,
    unit        TEXT DEFAULT 'Stück',           -- 'Stück','Pauschal','Stunde','km'
    price_net   REAL NOT NULL,                  -- Netto-Preis
    tax_rate    REAL NOT NULL DEFAULT 19.0,
    active      INTEGER NOT NULL DEFAULT 1,     -- 0/1 (Soft-Deaktivierung wegen Preis-Versionierung)
    sort_order  INTEGER DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_dj_services_category ON dj_services(category, sort_order);
CREATE INDEX IF NOT EXISTS idx_dj_services_active   ON dj_services(active);

CREATE TABLE IF NOT EXISTS dj_packages (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT NOT NULL,
    description  TEXT,
    price_net    REAL NOT NULL,                 -- Paketpreis (kann von Summe der Services abweichen)
    tax_rate     REAL NOT NULL DEFAULT 19.0,
    active       INTEGER NOT NULL DEFAULT 1,
    sort_order   INTEGER DEFAULT 0,
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dj_package_services (
    package_id   INTEGER NOT NULL REFERENCES dj_packages(id) ON DELETE CASCADE,
    service_id   INTEGER NOT NULL REFERENCES dj_services(id),
    quantity     REAL NOT NULL DEFAULT 1,
    PRIMARY KEY (package_id, service_id)
);

-- =============================================================================
-- 7. ANGEBOTE
-- =============================================================================

CREATE TABLE IF NOT EXISTS dj_quotes (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    number          TEXT UNIQUE,                -- NULL solange Entwurf, dann 'AN-1034'
    customer_id     INTEGER NOT NULL REFERENCES dj_customers(id),
    event_id        INTEGER REFERENCES dj_events(id),
    subject         TEXT,
    header_text     TEXT,                       -- freier Kopftext
    footer_text     TEXT,                       -- freier Fußtext
    status          TEXT NOT NULL DEFAULT 'entwurf' CHECK (status IN (
                        'entwurf','gesendet','angenommen','abgelehnt','abgelaufen'
                    )),
    quote_date      TEXT NOT NULL DEFAULT (date('now')),
    valid_until     TEXT,                       -- default +30 Tage
    distance_km     REAL,                       -- redundant, aus Event
    trips           INTEGER DEFAULT 2,          -- Hin + Rück
    subtotal_net    REAL NOT NULL DEFAULT 0,
    tax_total       REAL NOT NULL DEFAULT 0,
    discount_total  REAL NOT NULL DEFAULT 0,
    total_gross     REAL NOT NULL DEFAULT 0,
    payment_terms   TEXT,
    pdf_path        TEXT,                       -- Pfad zum generierten PDF
    pdf_hash        TEXT,                       -- SHA256 des finalisierten PDFs
    sent_at         TEXT,
    accepted_at     TEXT,
    rejected_at     TEXT,
    rejection_reason TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    finalized_at    TEXT,                       -- wenn gesetzt: Nummer vergeben
    deleted_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_dj_quotes_customer ON dj_quotes(customer_id);
CREATE INDEX IF NOT EXISTS idx_dj_quotes_event    ON dj_quotes(event_id);
CREATE INDEX IF NOT EXISTS idx_dj_quotes_status   ON dj_quotes(status);
CREATE INDEX IF NOT EXISTS idx_dj_quotes_number   ON dj_quotes(number);

CREATE TABLE IF NOT EXISTS dj_quote_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    quote_id    INTEGER NOT NULL REFERENCES dj_quotes(id) ON DELETE CASCADE,
    position    INTEGER NOT NULL,
    service_id  INTEGER REFERENCES dj_services(id), -- optional, bei Katalog-Herkunft
    package_id  INTEGER REFERENCES dj_packages(id), -- optional, wenn aus Paket
    description TEXT NOT NULL,                      -- Kopie der Beschreibung
    quantity    REAL NOT NULL DEFAULT 1,
    unit        TEXT DEFAULT 'Stück',
    price_net   REAL NOT NULL,                      -- Kopie des Preises zum Zeitpunkt
    tax_rate    REAL NOT NULL DEFAULT 19.0,
    discount_pct REAL DEFAULT 0,
    total_net   REAL NOT NULL                       -- qty * price_net - rabatt
);

CREATE INDEX IF NOT EXISTS idx_dj_quote_items_quote ON dj_quote_items(quote_id, position);

-- =============================================================================
-- 8. RECHNUNGEN (GoBD: nach Finalisierung readonly)
-- =============================================================================

CREATE TABLE IF NOT EXISTS dj_invoices (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    number          TEXT UNIQUE,                -- NULL solange Entwurf, dann 'RE-1061'
    customer_id     INTEGER NOT NULL REFERENCES dj_customers(id),
    event_id        INTEGER REFERENCES dj_events(id),
    quote_id        INTEGER REFERENCES dj_quotes(id),
    subject         TEXT,
    header_text     TEXT,
    footer_text     TEXT,
    status          TEXT NOT NULL DEFAULT 'entwurf' CHECK (status IN (
                        'entwurf','offen','teilbezahlt','bezahlt',
                        'ueberfaellig','storniert'
                    )),
    invoice_date    TEXT NOT NULL DEFAULT (date('now')),
    delivery_date   TEXT,                       -- = Eventdatum
    due_date        TEXT,                       -- invoice_date + payment_term_days
    payment_method  TEXT,                       -- 'paypal','ueberweisung'
    distance_km     REAL,
    trips           INTEGER DEFAULT 2,
    subtotal_net    REAL NOT NULL DEFAULT 0,
    tax_total       REAL NOT NULL DEFAULT 0,
    discount_total  REAL NOT NULL DEFAULT 0,
    total_gross     REAL NOT NULL DEFAULT 0,
    paid_amount     REAL NOT NULL DEFAULT 0,    -- Summe aus payments (redundant)
    pdf_path        TEXT,
    pdf_hash        TEXT,                       -- SHA256 Hash, GoBD
    -- Stornierung / Korrektur
    is_cancellation INTEGER NOT NULL DEFAULT 0, -- 1 wenn Stornorechnung
    cancels_invoice_id INTEGER REFERENCES dj_invoices(id),
    cancelled_by_invoice_id INTEGER REFERENCES dj_invoices(id),
    cancelled_at    TEXT,
    --
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    finalized_at    TEXT,                       -- wenn gesetzt: GoBD-readonly
    sent_at         TEXT
);

CREATE INDEX IF NOT EXISTS idx_dj_invoices_customer  ON dj_invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_dj_invoices_event     ON dj_invoices(event_id);
CREATE INDEX IF NOT EXISTS idx_dj_invoices_status    ON dj_invoices(status);
CREATE INDEX IF NOT EXISTS idx_dj_invoices_date      ON dj_invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_dj_invoices_number    ON dj_invoices(number);
CREATE INDEX IF NOT EXISTS idx_dj_invoices_due       ON dj_invoices(due_date, status);

CREATE TABLE IF NOT EXISTS dj_invoice_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id  INTEGER NOT NULL REFERENCES dj_invoices(id) ON DELETE CASCADE,
    position    INTEGER NOT NULL,
    service_id  INTEGER REFERENCES dj_services(id),
    package_id  INTEGER REFERENCES dj_packages(id),
    description TEXT NOT NULL,
    quantity    REAL NOT NULL DEFAULT 1,
    unit        TEXT DEFAULT 'Stück',
    price_net   REAL NOT NULL,                  -- Kopie, nicht verändern
    tax_rate    REAL NOT NULL DEFAULT 19.0,
    discount_pct REAL DEFAULT 0,
    total_net   REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dj_invoice_items_invoice ON dj_invoice_items(invoice_id, position);

-- =============================================================================
-- 9. ZAHLUNGEN (Anzahlungen + Teilzahlungen)
-- =============================================================================

CREATE TABLE IF NOT EXISTS dj_payments (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id  INTEGER NOT NULL REFERENCES dj_invoices(id),
    payment_date TEXT NOT NULL,
    amount      REAL NOT NULL,
    method      TEXT,                           -- 'paypal','ueberweisung','bar'
    reference   TEXT,                           -- z.B. PayPal-Transaktions-ID
    notes       TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_dj_payments_invoice ON dj_payments(invoice_id);

-- =============================================================================
-- 10. MAHNWESEN
-- =============================================================================

CREATE TABLE IF NOT EXISTS dj_dunning_notices (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id  INTEGER NOT NULL REFERENCES dj_invoices(id),
    level       INTEGER NOT NULL CHECK (level IN (1,2,3)), -- 1=Erinnerung, 2=Mahnung, 3=letzte Mahnung
    sent_at     TEXT,
    fee         REAL DEFAULT 0,
    pdf_path    TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_dj_dunning_invoice ON dj_dunning_notices(invoice_id);

-- =============================================================================
-- 11. AUSGABEN
-- =============================================================================

CREATE TABLE IF NOT EXISTS dj_expenses (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    expense_date   TEXT NOT NULL,
    category       TEXT NOT NULL CHECK (category IN (
                        'equipment','fahrzeug','buero','marketing',
                        'versicherung','gema','software','sonstiges'
                    )),
    description    TEXT NOT NULL,
    amount_gross   REAL NOT NULL,
    tax_rate       REAL DEFAULT 19.0,
    amount_net     REAL,                        -- berechnet
    vat_amount     REAL,                        -- Vorsteuer
    receipt_path   TEXT,                        -- Pfad zum Beleg
    is_recurring   INTEGER NOT NULL DEFAULT 0,  -- Fixkosten-Flag
    recurring_interval TEXT,                    -- 'monthly','quarterly','yearly'
    notes          TEXT,
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at     TEXT
);

CREATE INDEX IF NOT EXISTS idx_dj_expenses_date     ON dj_expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_dj_expenses_category ON dj_expenses(category);

-- =============================================================================
-- 12. EQUIPMENT-INVENTAR (Phase-2-Feature, Schema vorbereitet)
-- =============================================================================

CREATE TABLE IF NOT EXISTS dj_equipment (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT NOT NULL,
    category        TEXT,                       -- 'audio','licht','cable','controller'
    brand           TEXT,
    model           TEXT,
    serial_number   TEXT,
    purchase_date   TEXT,
    purchase_price  REAL,
    notes           TEXT,
    active          INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dj_event_equipment (
    event_id     INTEGER NOT NULL REFERENCES dj_events(id),
    equipment_id INTEGER NOT NULL REFERENCES dj_equipment(id),
    PRIMARY KEY (event_id, equipment_id)
);

-- =============================================================================
-- 13. AUDIT-LOG (alle finanzrelevanten Änderungen)
-- =============================================================================

CREATE TABLE IF NOT EXISTS dj_audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,                  -- 'invoice','quote','customer',...
    entity_id   INTEGER NOT NULL,
    action      TEXT NOT NULL,                  -- 'create','update','finalize','cancel','delete','send','pay'
    user_id     INTEGER,                        -- aus bestehendem Auth
    user_name   TEXT,
    old_value   TEXT,                           -- JSON snapshot vorher
    new_value   TEXT,                           -- JSON snapshot nachher
    ip_address  TEXT,
    user_agent  TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_dj_audit_entity  ON dj_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_dj_audit_date    ON dj_audit_log(created_at);

-- =============================================================================
-- 14. GoBD-TRIGGER: Finalisierte Rechnungen sind unveränderlich
-- =============================================================================
-- Diese Trigger sind die zweite Verteidigungslinie NEBEN der API-Middleware.
-- Selbst wenn jemand direkten DB-Zugriff hat, können finalisierte Rechnungen
-- nicht mehr verändert oder gelöscht werden.
-- Erlaubte Updates nach Finalisierung: paid_amount, status, pdf_path (für Mahnungen), sent_at
-- =============================================================================

CREATE TRIGGER IF NOT EXISTS trg_dj_invoices_no_update_after_finalize
BEFORE UPDATE ON dj_invoices
FOR EACH ROW
WHEN OLD.finalized_at IS NOT NULL
  AND (
       NEW.number         IS NOT OLD.number
    OR NEW.customer_id    IS NOT OLD.customer_id
    OR NEW.event_id       IS NOT OLD.event_id
    OR NEW.quote_id       IS NOT OLD.quote_id
    OR NEW.subject        IS NOT OLD.subject
    OR NEW.header_text    IS NOT OLD.header_text
    OR NEW.footer_text    IS NOT OLD.footer_text
    OR NEW.invoice_date   IS NOT OLD.invoice_date
    OR NEW.delivery_date  IS NOT OLD.delivery_date
    OR NEW.due_date       IS NOT OLD.due_date
    OR NEW.distance_km    IS NOT OLD.distance_km
    OR NEW.trips          IS NOT OLD.trips
    OR NEW.subtotal_net   IS NOT OLD.subtotal_net
    OR NEW.tax_total      IS NOT OLD.tax_total
    OR NEW.discount_total IS NOT OLD.discount_total
    OR NEW.total_gross    IS NOT OLD.total_gross
    OR NEW.pdf_hash       IS NOT OLD.pdf_hash
    OR NEW.finalized_at   IS NOT OLD.finalized_at
  )
BEGIN
    SELECT RAISE(ABORT, 'GoBD: Finalisierte Rechnung darf nicht verändert werden. Erstelle eine Stornorechnung.');
END;

CREATE TRIGGER IF NOT EXISTS trg_dj_invoices_no_delete_after_finalize
BEFORE DELETE ON dj_invoices
FOR EACH ROW
WHEN OLD.finalized_at IS NOT NULL
BEGIN
    SELECT RAISE(ABORT, 'GoBD: Finalisierte Rechnung darf nicht gelöscht werden.');
END;

CREATE TRIGGER IF NOT EXISTS trg_dj_invoice_items_no_update_after_finalize
BEFORE UPDATE ON dj_invoice_items
FOR EACH ROW
WHEN (SELECT finalized_at FROM dj_invoices WHERE id = OLD.invoice_id) IS NOT NULL
BEGIN
    SELECT RAISE(ABORT, 'GoBD: Positionen einer finalisierten Rechnung dürfen nicht verändert werden.');
END;

CREATE TRIGGER IF NOT EXISTS trg_dj_invoice_items_no_delete_after_finalize
BEFORE DELETE ON dj_invoice_items
FOR EACH ROW
WHEN (SELECT finalized_at FROM dj_invoices WHERE id = OLD.invoice_id) IS NOT NULL
BEGIN
    SELECT RAISE(ABORT, 'GoBD: Positionen einer finalisierten Rechnung dürfen nicht gelöscht werden.');
END;

CREATE TRIGGER IF NOT EXISTS trg_dj_invoice_items_no_insert_after_finalize
BEFORE INSERT ON dj_invoice_items
FOR EACH ROW
WHEN (SELECT finalized_at FROM dj_invoices WHERE id = NEW.invoice_id) IS NOT NULL
BEGIN
    SELECT RAISE(ABORT, 'GoBD: Positionen dürfen einer finalisierten Rechnung nicht hinzugefügt werden.');
END;

-- updated_at auto-update auf Kern-Tabellen
CREATE TRIGGER IF NOT EXISTS trg_dj_customers_updated_at
AFTER UPDATE ON dj_customers FOR EACH ROW
BEGIN
    UPDATE dj_customers SET updated_at = datetime('now') WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_dj_events_updated_at
AFTER UPDATE ON dj_events FOR EACH ROW
BEGIN
    UPDATE dj_events SET updated_at = datetime('now') WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_dj_locations_updated_at
AFTER UPDATE ON dj_locations FOR EACH ROW
BEGIN
    UPDATE dj_locations SET updated_at = datetime('now') WHERE id = OLD.id;
END;

-- =============================================================================
-- 15. VIEWS
-- =============================================================================

-- Fahrten-View: statt separater Tabelle aus Events ableiten
CREATE VIEW IF NOT EXISTS v_dj_trips AS
SELECT
    e.id                                         AS event_id,
    e.event_date                                  AS date,
    COALESCE(e.title, 'Event ' || e.id)           AS event_name,
    e.event_type                                  AS event_type,
    COALESCE(e.status, 'neu')                     AS event_status,
    l.distance_km                                 AS distance_km_one_way,
    l.travel_time_min                             AS travel_time_min_one_way,
    (COALESCE(l.distance_km, 0) * 2)              AS total_km,
    (COALESCE(l.distance_km, 0) * 2 * 0.30)       AS deductible_value,
    -- Verpflegungsmehraufwand (Orientierung)
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
    ) / 60.0                                      AS absence_hours,
    CAST(strftime('%Y', e.event_date) AS INTEGER) AS year
FROM dj_events e
LEFT JOIN dj_locations l ON l.id = e.location_id
WHERE e.deleted_at IS NULL
  AND e.event_date IS NOT NULL;

-- Offene-Posten-View
CREATE VIEW IF NOT EXISTS v_dj_open_invoices AS
SELECT
    i.*,
    (i.total_gross - i.paid_amount) AS outstanding
FROM dj_invoices i
WHERE i.finalized_at IS NOT NULL
  AND i.status IN ('offen','teilbezahlt','ueberfaellig')
  AND i.is_cancellation = 0;

-- =============================================================================
-- ENDE SCHEMA
-- =============================================================================
