-- =============================================================================
-- DJ-Modul — Initial Schema (SQLite)
-- Migration 026
-- Hinweis: PRAGMA foreign_keys wird zentral in migrate.ts gesteuert
-- Hinweis: Kunden = bestehende contacts-Tabelle (area = 'DJ'), kein eigenes dj_customers
-- =============================================================================

-- =============================================================================
-- 1. NUMMERNKREISE (atomar, lückenlos)
-- =============================================================================

CREATE TABLE IF NOT EXISTS dj_number_sequences (
    key           TEXT PRIMARY KEY,
    prefix        TEXT NOT NULL,
    current_value INTEGER NOT NULL DEFAULT 0,
    padding       INTEGER NOT NULL DEFAULT 4,
    updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO dj_number_sequences (key, prefix, current_value, padding) VALUES
    ('invoice',     'RE', 1060, 4),
    ('quote',       'AN', 1034, 4),
    ('credit_note', 'SR',    0, 4);

-- =============================================================================
-- 2. EINSTELLUNGEN (Key-Value)
-- =============================================================================

CREATE TABLE IF NOT EXISTS dj_settings (
    key        TEXT PRIMARY KEY,
    value      TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO dj_settings (key, value) VALUES
    ('company', '{"name":"Benjamin Zimmermann","company":"Dein Event DJ | Benjamin Zimmermann","address":"Mittelweg 10","zip":"93426","city":"Roding","country":"Deutschland","phone":"01711493222","email":"Benjamin.Z@gmx.de","website":"www.dein-event-dj.com","tax_number":"21129292323","vat_id":null,"is_vat_liable":true,"vat_rate":19.0,"bank":{"name":"Raiffeisenbank Neustadt - Vohenstrauß eG","iban":"DE59753900000005302552","bic":"GENODEF1NEW","holder":"Benjamin Zimmermann"},"payment_methods":["paypal","ueberweisung"]}'),
    ('tax', '{"vat_rate":19.0,"mileage_rate_per_km":0.30,"mileage_type":"reisekosten_dienstreise","meal_allowance_8h":14.00,"meal_allowance_24h":28.00,"default_setup_minutes":90,"default_teardown_minutes":90,"default_payment_term_days":14,"dunning_fee":5.00,"cancellation_staggered":{"gt_180_days":0,"gt_90_days":25,"gt_30_days":50,"gt_7_days":75,"lt_7_days":100}}'),
    ('payment_terms', '["Zahlbar innerhalb 14 Tagen ohne Abzug","Zahlbar innerhalb 7 Tagen ohne Abzug","30 % Anzahlung bei Auftragsbestätigung, Restbetrag innerhalb 14 Tagen nach Veranstaltung","Zahlung am Veranstaltungstag in bar oder per Überweisung innerhalb 7 Tagen"]'),
    ('templates', '{"quote_header":{"hochzeit":"Hallo {{vorname}},\n\nvielen Dank für Eure Anfrage. Gerne unterbreite ich euch das gewünschte freibleibende Angebot für euren großen Tag am {{eventdatum}}.\n\nIch freue mich darauf, euch an diesem besonderen Abend musikalisch zu begleiten.","firmen_event":"Sehr geehrte/r {{anrede}} {{nachname}},\n\nvielen Dank für Ihre Anfrage. Gerne unterbreite ich Ihnen nachfolgend ein freibleibendes Angebot für Ihre Veranstaltung am {{eventdatum}}.","geburtstag":"Hallo {{vorname}},\n\nvielen Dank für deine Anfrage. Anbei mein freibleibendes Angebot für deine Feier am {{eventdatum}}.","sonstige":"Hallo {{vorname}},\n\nvielen Dank für deine Anfrage. Anbei mein Angebot für deine Veranstaltung am {{eventdatum}}."},"quote_footer":"Das Angebot ist gültig bis {{gueltig_bis}}.\n\nBei Fragen stehe ich jederzeit gerne zur Verfügung.\n\nMit freundlichen Grüßen\nBenjamin Zimmermann","invoice_header":"Sehr geehrte/r {{anrede}} {{nachname}},\n\nvielen Dank für das entgegengebrachte Vertrauen und die schöne Veranstaltung am {{eventdatum}}. Nachfolgend erlaube ich mir, Ihnen die vereinbarten Leistungen in Rechnung zu stellen.","invoice_footer":"Bitte überweisen Sie den Gesamtbetrag innerhalb von {{zahlungsziel}} Tagen auf das unten genannte Konto.\n\nMit freundlichen Grüßen\nBenjamin Zimmermann","dunning":{"1":"Sehr geehrte/r {{anrede}} {{nachname}},\n\nbeim Ausgleich der Rechnung {{rechnungsnummer}} vom {{rechnungsdatum}} ist vermutlich etwas durcheinander gekommen. Der offene Betrag von {{betrag}} ist bereits seit {{tage_ueberfaellig}} Tagen fällig.\n\nBitte prüfen Sie, ob die Zahlung bereits angewiesen wurde. Falls nicht, bitte ich Sie um Ausgleich innerhalb der nächsten 7 Tage.\n\nMit freundlichen Grüßen\nBenjamin Zimmermann","2":"Sehr geehrte/r {{anrede}} {{nachname}},\n\ntrotz meiner Zahlungserinnerung ist der offene Betrag aus Rechnung {{rechnungsnummer}} in Höhe von {{betrag}} bislang nicht auf meinem Konto eingegangen.\n\nIch bitte Sie nun dringend, den Betrag innerhalb von 7 Tagen auszugleichen.\n\nMit freundlichen Grüßen\nBenjamin Zimmermann","3":"Sehr geehrte/r {{anrede}} {{nachname}},\n\nleider ist der offene Betrag aus Rechnung {{rechnungsnummer}} in Höhe von {{betrag}} auch nach zwei Erinnerungen nicht beglichen.\n\nIch fordere Sie hiermit letztmalig auf, den Betrag zuzüglich einer Mahngebühr von {{mahngebuehr}} innerhalb von 7 Tagen zu überweisen. Andernfalls sehe ich mich gezwungen, weitere Schritte einzuleiten.\n\nMit freundlichen Grüßen\nBenjamin Zimmermann"}}}');

-- =============================================================================
-- 3. LOCATIONS (wiederverwendbare Event-Locations)
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
    distance_km     REAL,
    travel_time_min INTEGER,
    contact_name    TEXT,
    contact_phone   TEXT,
    contact_email   TEXT,
    notes           TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_dj_locations_city ON dj_locations(city);
CREATE INDEX IF NOT EXISTS idx_dj_locations_name ON dj_locations(name);

-- =============================================================================
-- 4. EVENTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS dj_events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id     INTEGER REFERENCES contacts(id),
    location_id     INTEGER REFERENCES dj_locations(id),
    title           TEXT,
    event_type      TEXT NOT NULL CHECK (event_type IN (
                        'hochzeit','firmen_event','club_bar',
                        'geburtstag','festival','sonstige'
                    )),
    event_date      TEXT NOT NULL,
    time_start      TEXT,
    time_end        TEXT,
    setup_minutes   INTEGER DEFAULT 90,
    teardown_minutes INTEGER DEFAULT 90,
    guests          INTEGER,
    status          TEXT NOT NULL DEFAULT 'neu' CHECK (status IN (
                        'neu','vorgespraech_vereinbart','angebot_gesendet',
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
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at      TEXT
);

CREATE INDEX IF NOT EXISTS idx_dj_events_date     ON dj_events(event_date);
CREATE INDEX IF NOT EXISTS idx_dj_events_status   ON dj_events(status);
CREATE INDEX IF NOT EXISTS idx_dj_events_customer ON dj_events(customer_id);
CREATE INDEX IF NOT EXISTS idx_dj_events_type     ON dj_events(event_type);

CREATE TABLE IF NOT EXISTS dj_event_status_history (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id    INTEGER NOT NULL REFERENCES dj_events(id),
    from_status TEXT,
    to_status   TEXT NOT NULL,
    comment     TEXT,
    user_id     INTEGER,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_dj_event_status_history_event ON dj_event_status_history(event_id);

CREATE TABLE IF NOT EXISTS dj_event_wishes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id    INTEGER NOT NULL REFERENCES dj_events(id),
    artist      TEXT,
    title       TEXT NOT NULL,
    category    TEXT CHECK (category IN ('must_play','wish','no_go')),
    guest_name  TEXT,
    notes       TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_dj_event_wishes_event ON dj_event_wishes(event_id);

-- =============================================================================
-- 5. LEISTUNGEN & PAKETE
-- =============================================================================

CREATE TABLE IF NOT EXISTS dj_services (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    category    TEXT NOT NULL,
    name        TEXT NOT NULL,
    description TEXT,
    unit        TEXT DEFAULT 'Stück',
    price_net   REAL NOT NULL,
    tax_rate    REAL NOT NULL DEFAULT 19.0,
    active      INTEGER NOT NULL DEFAULT 1,
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
    price_net    REAL NOT NULL,
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
-- 6. ANGEBOTE
-- =============================================================================

CREATE TABLE IF NOT EXISTS dj_quotes (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    number          TEXT UNIQUE,
    customer_id     INTEGER NOT NULL REFERENCES contacts(id),
    event_id        INTEGER REFERENCES dj_events(id),
    subject         TEXT,
    header_text     TEXT,
    footer_text     TEXT,
    status          TEXT NOT NULL DEFAULT 'entwurf' CHECK (status IN (
                        'entwurf','gesendet','angenommen','abgelehnt','abgelaufen'
                    )),
    quote_date      TEXT NOT NULL DEFAULT (date('now')),
    valid_until     TEXT,
    distance_km     REAL,
    trips           INTEGER DEFAULT 2,
    subtotal_net    REAL NOT NULL DEFAULT 0,
    tax_total       REAL NOT NULL DEFAULT 0,
    discount_total  REAL NOT NULL DEFAULT 0,
    total_gross     REAL NOT NULL DEFAULT 0,
    payment_terms   TEXT,
    pdf_path        TEXT,
    pdf_hash        TEXT,
    sent_at         TEXT,
    accepted_at     TEXT,
    rejected_at     TEXT,
    rejection_reason TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    finalized_at    TEXT,
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
    service_id  INTEGER REFERENCES dj_services(id),
    package_id  INTEGER REFERENCES dj_packages(id),
    description TEXT NOT NULL,
    quantity    REAL NOT NULL DEFAULT 1,
    unit        TEXT DEFAULT 'Stück',
    price_net   REAL NOT NULL,
    tax_rate    REAL NOT NULL DEFAULT 19.0,
    discount_pct REAL DEFAULT 0,
    total_net   REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dj_quote_items_quote ON dj_quote_items(quote_id, position);

-- =============================================================================
-- 7. RECHNUNGEN (GoBD: nach Finalisierung readonly)
-- =============================================================================

CREATE TABLE IF NOT EXISTS dj_invoices (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    number          TEXT UNIQUE,
    customer_id     INTEGER NOT NULL REFERENCES contacts(id),
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
    delivery_date   TEXT,
    due_date        TEXT,
    payment_method  TEXT,
    distance_km     REAL,
    trips           INTEGER DEFAULT 2,
    subtotal_net    REAL NOT NULL DEFAULT 0,
    tax_total       REAL NOT NULL DEFAULT 0,
    discount_total  REAL NOT NULL DEFAULT 0,
    total_gross     REAL NOT NULL DEFAULT 0,
    paid_amount     REAL NOT NULL DEFAULT 0,
    pdf_path        TEXT,
    pdf_hash        TEXT,
    is_cancellation INTEGER NOT NULL DEFAULT 0,
    cancels_invoice_id INTEGER REFERENCES dj_invoices(id),
    cancelled_by_invoice_id INTEGER REFERENCES dj_invoices(id),
    cancelled_at    TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    finalized_at    TEXT,
    sent_at         TEXT
);

CREATE INDEX IF NOT EXISTS idx_dj_invoices_customer ON dj_invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_dj_invoices_event    ON dj_invoices(event_id);
CREATE INDEX IF NOT EXISTS idx_dj_invoices_status   ON dj_invoices(status);
CREATE INDEX IF NOT EXISTS idx_dj_invoices_date     ON dj_invoices(invoice_date);
CREATE INDEX IF NOT EXISTS idx_dj_invoices_number   ON dj_invoices(number);
CREATE INDEX IF NOT EXISTS idx_dj_invoices_due      ON dj_invoices(due_date, status);

CREATE TABLE IF NOT EXISTS dj_invoice_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id  INTEGER NOT NULL REFERENCES dj_invoices(id) ON DELETE CASCADE,
    position    INTEGER NOT NULL,
    service_id  INTEGER REFERENCES dj_services(id),
    package_id  INTEGER REFERENCES dj_packages(id),
    description TEXT NOT NULL,
    quantity    REAL NOT NULL DEFAULT 1,
    unit        TEXT DEFAULT 'Stück',
    price_net   REAL NOT NULL,
    tax_rate    REAL NOT NULL DEFAULT 19.0,
    discount_pct REAL DEFAULT 0,
    total_net   REAL NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dj_invoice_items_invoice ON dj_invoice_items(invoice_id, position);

-- =============================================================================
-- 8. ZAHLUNGEN
-- =============================================================================

CREATE TABLE IF NOT EXISTS dj_payments (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id   INTEGER NOT NULL REFERENCES dj_invoices(id),
    payment_date TEXT NOT NULL,
    amount       REAL NOT NULL,
    method       TEXT,
    reference    TEXT,
    notes        TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_dj_payments_invoice ON dj_payments(invoice_id);

-- =============================================================================
-- 9. MAHNWESEN
-- =============================================================================

CREATE TABLE IF NOT EXISTS dj_dunning_notices (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL REFERENCES dj_invoices(id),
    level      INTEGER NOT NULL CHECK (level IN (1,2,3)),
    sent_at    TEXT,
    fee        REAL DEFAULT 0,
    pdf_path   TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_dj_dunning_invoice ON dj_dunning_notices(invoice_id);

-- =============================================================================
-- 10. AUSGABEN
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
    amount_net     REAL,
    vat_amount     REAL,
    receipt_path   TEXT,
    is_recurring   INTEGER NOT NULL DEFAULT 0,
    recurring_interval TEXT,
    notes          TEXT,
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at     TEXT NOT NULL DEFAULT (datetime('now')),
    deleted_at     TEXT
);

CREATE INDEX IF NOT EXISTS idx_dj_expenses_date     ON dj_expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_dj_expenses_category ON dj_expenses(category);

-- =============================================================================
-- 11. EQUIPMENT-INVENTAR (vorbereitet, Phase-2-Feature)
-- =============================================================================

CREATE TABLE IF NOT EXISTS dj_equipment (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT NOT NULL,
    category       TEXT,
    brand          TEXT,
    model          TEXT,
    serial_number  TEXT,
    purchase_date  TEXT,
    purchase_price REAL,
    notes          TEXT,
    active         INTEGER NOT NULL DEFAULT 1,
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS dj_event_equipment (
    event_id     INTEGER NOT NULL REFERENCES dj_events(id),
    equipment_id INTEGER NOT NULL REFERENCES dj_equipment(id),
    PRIMARY KEY (event_id, equipment_id)
);

-- =============================================================================
-- 12. AUDIT-LOG (append-only, finanzrelevante Änderungen)
-- =============================================================================

CREATE TABLE IF NOT EXISTS dj_audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,
    entity_id   INTEGER NOT NULL,
    action      TEXT NOT NULL,
    user_id     INTEGER,
    user_name   TEXT,
    old_value   TEXT,
    new_value   TEXT,
    ip_address  TEXT,
    user_agent  TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_dj_audit_entity ON dj_audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_dj_audit_date   ON dj_audit_log(created_at);

-- GoBD: Audit-Log ist append-only — kein UPDATE/DELETE erlaubt
CREATE TRIGGER IF NOT EXISTS trg_dj_audit_log_no_update
BEFORE UPDATE ON dj_audit_log
FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'GoBD: Audit-Log darf nicht verändert werden.');
END;

CREATE TRIGGER IF NOT EXISTS trg_dj_audit_log_no_delete
BEFORE DELETE ON dj_audit_log
FOR EACH ROW
BEGIN
    SELECT RAISE(ABORT, 'GoBD: Audit-Log-Einträge dürfen nicht gelöscht werden.');
END;

-- =============================================================================
-- 13. GoBD-TRIGGER: Finalisierte Rechnungen sind unveränderlich
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

-- updated_at auto-update
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

CREATE TRIGGER IF NOT EXISTS trg_dj_quotes_updated_at
AFTER UPDATE ON dj_quotes FOR EACH ROW
BEGIN
    UPDATE dj_quotes SET updated_at = datetime('now') WHERE id = OLD.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_dj_invoices_updated_at
AFTER UPDATE ON dj_invoices FOR EACH ROW
WHEN OLD.finalized_at IS NULL
BEGIN
    UPDATE dj_invoices SET updated_at = datetime('now') WHERE id = OLD.id;
END;

-- =============================================================================
-- 14. VIEWS
-- =============================================================================

CREATE VIEW IF NOT EXISTS v_dj_trips AS
SELECT
    e.id                                                AS event_id,
    e.event_date                                        AS date,
    COALESCE(e.title, 'Event ' || e.id)                 AS event_name,
    e.event_type                                        AS event_type,
    COALESCE(e.status, 'neu')                           AS event_status,
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

-- =============================================================================
-- 15. SEED: Leistungskatalog
-- =============================================================================

-- Audio
INSERT OR IGNORE INTO dj_services (category, name, description, unit, price_net, sort_order) VALUES
    ('audio', 'Tonanlage klein (bis ca. 80 Gäste)',  'Kompaktanlage für kleinere Events',                'Pauschal', 150.00, 10),
    ('audio', 'Tonanlage mittel (bis ca. 150 Gäste)','Ausgewogene Beschallung für mittelgroße Events',   'Pauschal', 250.00, 20),
    ('audio', 'Tonanlage groß (ab 150 Gäste)',        'Leistungsstarke Beschallung für große Events',    'Pauschal', 350.00, 30),
    ('audio', 'Outdoor-/Akku-Tonanlage',              'Mobile Anlage ohne Stromanschluss',               'Pauschal', 200.00, 40),
    ('audio', 'Zweiter Raum Beschallung',             'Zusätzliche Zone beschallen',                     'Pauschal', 150.00, 50),
    ('audio', 'Mikrofon (Kabel)',                     'Kabelmikrofon für Reden',                         'Stück',     25.00, 60),
    ('audio', 'Funkmikrofon',                         'Funkmikro, bis 50m Reichweite',                   'Stück',     50.00, 70),
    ('audio', 'Headset-Mikrofon',                     'Für freihändige Moderation',                      'Stück',     60.00, 80),
    ('audio', 'DJ-Controller',                        '(im DJ-Service enthalten)',                        'Pauschal',   0.00, 90),
    ('audio', 'Laptop',                               '(im DJ-Service enthalten)',                        'Pauschal',   0.00, 100),
    ('audio', 'Streaming (wenn online)',              'Preis auf Anfrage',                                'Pauschal',   0.00, 110);

-- Licht
INSERT OR IGNORE INTO dj_services (category, name, description, unit, price_net, sort_order) VALUES
    ('licht', 'Basic Partylicht',               '2 LED-Scheinwerfer, klassische Tanzflächen-Ausleuchtung',  'Pauschal',  80.00, 10),
    ('licht', 'Erweiterte Lichttechnik',         '4–6 LED-Scheinwerfer, Moving Heads optional',              'Pauschal', 150.00, 20),
    ('licht', 'Ambientebeleuchtung / Uplights',  'Raumfärbung über Uplights',                               'Pauschal', 120.00, 30);

-- Effekte
INSERT OR IGNORE INTO dj_services (category, name, description, unit, price_net, sort_order) VALUES
    ('effekte', 'Nebelmaschine',                  'Standard-Nebel für Lichteffekte',                     'Pauschal',  50.00, 10),
    ('effekte', 'Hazer',                          'Feiner Dunst, ideal für Moving Heads',                'Pauschal',  70.00, 20),
    ('effekte', 'Konfetti-Shooter',               'Pro Schuss, für Eröffnungstanz',                      'Stück',     30.00, 30),
    ('effekte', 'Kaltfunken-Fontäne',             'Für Einzug, Tortenanschnitt (Indoor-tauglich)',       'Stück',     40.00, 40),
    ('effekte', 'Bodennebel / Trockeneis-Effekt', '"Tanzen auf Wolken" für ersten Tanz',                 'Pauschal', 120.00, 50),
    ('effekte', 'Schwarzlicht',                   'UV-Effekt für spezielle Mottos',                      'Pauschal',  40.00, 60);

-- DJ-Service
INSERT OR IGNORE INTO dj_services (category, name, description, unit, price_net, sort_order) VALUES
    ('dj_service', 'DJ-Service Grundleistung', 'In allen Paketen enthalten',                   'Pauschal',   0.00, 10),
    ('dj_service', 'Zusätzliche Spielzeit',    'Pro angefangener Stunde über Paket hinaus',    'Stunde',    80.00, 20),
    ('dj_service', 'Moderation',               'Aktive Moderation inkl. Einlagen',             'Pauschal', 100.00, 30);

-- Sonstiges
INSERT OR IGNORE INTO dj_services (category, name, description, unit, price_net, sort_order) VALUES
    ('sonstiges', 'Anfahrt',                     'Kalkulatorisch, nicht auf Rechnung einzeln ausgewiesen', 'km',      0.30, 10),
    ('sonstiges', 'Auf-/Abbau Express (<60 min)', 'Beschleunigter Auf-/Abbau',                             'Pauschal', 80.00, 20);

-- =============================================================================
-- 16. SEED: Buchungspakete
-- =============================================================================

INSERT OR IGNORE INTO dj_packages (name, description, price_net, sort_order) VALUES
    ('Kofferjob',               'Schlanke DJ-Leistung für kleinere Feiern ohne große Technik',              600.00, 10),
    ('Grundpaket bis 80 Gäste', 'Komplettausstattung für Feiern bis 80 Personen inkl. Licht und Effekten', 1200.00, 20),
    ('Grundpaket bis 150 Gäste','Komplettausstattung für mittelgroße Events bis 150 Personen',             1400.00, 30),
    ('Club Upgrade',            'Zusatzpaket für Club/Bar-Atmosphäre auf privaten Events',                   200.00, 40);

-- Paket-Leistungen (via Subquery nach Name)
INSERT OR IGNORE INTO dj_package_services (package_id, service_id, quantity)
SELECT p.id, s.id, 1 FROM dj_packages p, dj_services s
WHERE p.name = 'Kofferjob'
  AND s.name IN ('DJ-Service Grundleistung','Tonanlage klein (bis ca. 80 Gäste)','Basic Partylicht','Mikrofon (Kabel)');

INSERT OR IGNORE INTO dj_package_services (package_id, service_id, quantity)
SELECT p.id, s.id, 1 FROM dj_packages p, dj_services s
WHERE p.name = 'Grundpaket bis 80 Gäste'
  AND s.name IN ('DJ-Service Grundleistung','Tonanlage klein (bis ca. 80 Gäste)','Basic Partylicht',
                 'Ambientebeleuchtung / Uplights','Mikrofon (Kabel)','Funkmikrofon',
                 'Nebelmaschine','DJ-Controller','Laptop','Anfahrt');

INSERT OR IGNORE INTO dj_package_services (package_id, service_id, quantity)
SELECT p.id, s.id, 1 FROM dj_packages p, dj_services s
WHERE p.name = 'Grundpaket bis 150 Gäste'
  AND s.name IN ('DJ-Service Grundleistung','Tonanlage mittel (bis ca. 150 Gäste)','Erweiterte Lichttechnik',
                 'Ambientebeleuchtung / Uplights','Funkmikrofon','Mikrofon (Kabel)',
                 'Hazer','DJ-Controller','Laptop','Anfahrt');

INSERT OR IGNORE INTO dj_package_services (package_id, service_id, quantity)
SELECT p.id, s.id, 1 FROM dj_packages p, dj_services s
WHERE p.name = 'Club Upgrade'
  AND s.name IN ('Bodennebel / Trockeneis-Effekt','Schwarzlicht','Erweiterte Lichttechnik');
