-- ============================================================================
-- Migration 040: Belege-Modul Schema
-- Phase 4 — GoBD-konforme Beleg-Ablage mit Multi-Area-Zuordnung, OCR, GoBD-Lock
--
-- HINWEIS zur Nummerierung:
--   Plan 04-01 spezifizierte ursprünglich Migration 039_belege.sql.
--   Wave 0 (Plan 04-00) hat jedoch bereits 039_audit_log.sql belegt.
--   Daher: Migration 040 (nächste freie Nummer) — keine inhaltliche Änderung.
--
-- WICHTIG: Alle Geld-Felder INTEGER (Cents) — KEIN REAL/FLOAT in neuen Tabellen
-- WICHTIG: Auto-Backup laeuft via migrate.ts vor Anwendung dieser Migration
-- WICHTIG: Keine FK-Pragma-Aenderung hier — migrate.ts steuert das zentral
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. AREAS — Bereiche/Kategorien (UI-editierbar)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS areas (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    slug        TEXT NOT NULL UNIQUE,
    color       TEXT DEFAULT '#94aaff',
    icon        TEXT DEFAULT 'category',
    sort_order  INTEGER DEFAULT 0,
    archived    INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_areas_archived ON areas(archived, sort_order);

-- ----------------------------------------------------------------------------
-- 2. TAX_CATEGORIES — Steuerkategorien
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tax_categories (
    id                       INTEGER PRIMARY KEY AUTOINCREMENT,
    name                     TEXT NOT NULL UNIQUE,
    slug                     TEXT NOT NULL UNIQUE,
    kind                     TEXT NOT NULL CHECK (kind IN ('einnahme', 'ausgabe', 'beides')),
    default_vat_rate         INTEGER,                      -- 0 | 7 | 19 (Prozent als INTEGER)
    default_input_tax_deductible INTEGER NOT NULL DEFAULT 1 CHECK (default_input_tax_deductible IN (0, 1)),
    sort_order               INTEGER DEFAULT 0,
    archived                 INTEGER NOT NULL DEFAULT 0 CHECK (archived IN (0, 1)),
    created_at               TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at               TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tax_categories_kind ON tax_categories(kind, archived, sort_order);

-- ----------------------------------------------------------------------------
-- 3. TRIPS — Fahrten (eigene Tabelle, kein Spezialfall in dj_expenses)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS trips (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    start_location    TEXT,
    end_location      TEXT,
    distance_km       INTEGER NOT NULL CHECK (distance_km >= 0),  -- Kilometer als INTEGER
    purpose           TEXT,
    rate_per_km_cents INTEGER NOT NULL DEFAULT 30,                -- Cents pro km (z.B. 30 = 0,30 €)
    amount_cents      INTEGER NOT NULL DEFAULT 0,                 -- distance_km * rate_per_km_cents
    linked_event_id   INTEGER REFERENCES dj_events(id) ON DELETE SET NULL,
    expense_date      TEXT NOT NULL,
    notes             TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_trips_date  ON trips(expense_date);
CREATE INDEX IF NOT EXISTS idx_trips_event ON trips(linked_event_id);

-- ----------------------------------------------------------------------------
-- 4. RECEIPTS — Hauptbelege-Tabelle (Source of Truth)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS receipts (
    id                       INTEGER PRIMARY KEY AUTOINCREMENT,

    -- Typ + Quelle
    type                     TEXT NOT NULL CHECK (type IN (
                                   'eingangsrechnung','ausgangsrechnung','beleg',
                                   'fahrt','quittung','spesen','sonstiges'
                               )),
    source                   TEXT NOT NULL DEFAULT 'manual_upload' CHECK (source IN (
                                   'manual_upload','dj_invoice_sync','dj_trip_sync',
                                   'email_import','api_import'
                               )),
    created_via              TEXT,

    -- Lieferant / Beziehungspartner
    supplier_name            TEXT,
    supplier_contact_id      INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
    supplier_invoice_number  TEXT,                            -- Rechnungsnummer DES Lieferanten (frei)
    receipt_number           TEXT,                            -- nur fuer EIGENE Ausgangsrechnungen (sonst NULL)

    -- Datum/Faelligkeit
    receipt_date             TEXT NOT NULL,
    due_date                 TEXT,
    payment_date             TEXT,

    -- Betraege (alle in CENTS, INTEGER!)
    currency                 TEXT NOT NULL DEFAULT 'EUR',
    amount_gross_cents       INTEGER NOT NULL DEFAULT 0,
    amount_net_cents         INTEGER NOT NULL DEFAULT 0,
    vat_rate                 INTEGER NOT NULL DEFAULT 19,     -- 0|7|19 (Prozent)
    vat_amount_cents         INTEGER NOT NULL DEFAULT 0,
    exchange_rate            REAL DEFAULT 1.0,                -- für Fremdwährung — REAL erlaubt nur hier (Wechselkurs)
    amount_gross_eur_cents   INTEGER NOT NULL DEFAULT 0,      -- nach Wechselkurs

    -- Steuerlich
    tax_category_id          INTEGER REFERENCES tax_categories(id) ON DELETE SET NULL,
    tax_category             TEXT,                            -- denormalized fallback
    steuerrelevant           INTEGER NOT NULL DEFAULT 1 CHECK (steuerrelevant IN (0, 1)),
    input_tax_deductible     INTEGER NOT NULL DEFAULT 1 CHECK (input_tax_deductible IN (0, 1)),
    reverse_charge           INTEGER NOT NULL DEFAULT 0 CHECK (reverse_charge IN (0, 1)),
    import_eust              INTEGER NOT NULL DEFAULT 0 CHECK (import_eust IN (0, 1)),
    private_share_percent    INTEGER NOT NULL DEFAULT 0 CHECK (private_share_percent BETWEEN 0 AND 100),

    -- Status
    status                   TEXT NOT NULL DEFAULT 'zu_pruefen' CHECK (status IN (
                                   'ocr_pending','zu_pruefen','offen','teilbezahlt',
                                   'bezahlt','ueberfaellig','freigegeben','archiviert',
                                   'nicht_relevant','storniert'
                               )),

    -- GoBD-Lock
    freigegeben_at           TEXT,
    freigegeben_by           TEXT,

    -- Zahlung
    payment_method           TEXT,                            -- 'ueberweisung'|'lastschrift'|'bar'|'paypal'|...
    payment_account_ref      TEXT,                            -- Free-Text in dieser Phase
    paid_amount_cents        INTEGER NOT NULL DEFAULT 0,

    -- Datei
    file_hash_sha256         TEXT,
    original_filename        TEXT,

    -- Korrekturbeleg-Verkettung
    corrects_receipt_id      INTEGER REFERENCES receipts(id) ON DELETE SET NULL,
    corrected_by_receipt_id  INTEGER REFERENCES receipts(id) ON DELETE SET NULL,

    -- Verlinkung zu DJ-Source
    linked_invoice_id        INTEGER REFERENCES dj_invoices(id) ON DELETE SET NULL,
    linked_trip_id           INTEGER REFERENCES trips(id) ON DELETE SET NULL,

    -- Inhaltliche Felder
    title                    TEXT,
    notes                    TEXT,
    tags                     TEXT,                            -- comma-separated für Phase 4

    -- Metadaten
    created_at               TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at               TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_receipts_type           ON receipts(type);
CREATE INDEX IF NOT EXISTS idx_receipts_status         ON receipts(status);
CREATE INDEX IF NOT EXISTS idx_receipts_date           ON receipts(receipt_date);
CREATE INDEX IF NOT EXISTS idx_receipts_payment_date   ON receipts(payment_date);
CREATE INDEX IF NOT EXISTS idx_receipts_due_date       ON receipts(due_date, status);
CREATE INDEX IF NOT EXISTS idx_receipts_supplier       ON receipts(supplier_name);
CREATE INDEX IF NOT EXISTS idx_receipts_supplier_cid   ON receipts(supplier_contact_id);
CREATE INDEX IF NOT EXISTS idx_receipts_source         ON receipts(source, linked_invoice_id, linked_trip_id);
CREATE INDEX IF NOT EXISTS idx_receipts_hash           ON receipts(file_hash_sha256);

-- ----------------------------------------------------------------------------
-- 5. RECEIPT_FILES — angehängte Dateien (1:n zu receipts)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS receipt_files (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_id        INTEGER NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
    original_filename TEXT NOT NULL,
    storage_path      TEXT NOT NULL,
    sha256            TEXT NOT NULL,
    mime_type         TEXT,
    file_size_bytes   INTEGER NOT NULL,
    thumbnail_path    TEXT,
    page_count        INTEGER,
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_receipt_files_receipt ON receipt_files(receipt_id);
CREATE INDEX IF NOT EXISTS idx_receipt_files_sha     ON receipt_files(sha256);

-- ----------------------------------------------------------------------------
-- 6. RECEIPT_AREA_LINKS — n:m receipts <-> areas mit primary-Flag
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS receipt_area_links (
    receipt_id  INTEGER NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
    area_id     INTEGER NOT NULL REFERENCES areas(id) ON DELETE CASCADE,
    is_primary  INTEGER NOT NULL DEFAULT 0 CHECK (is_primary IN (0, 1)),
    share_percent INTEGER DEFAULT 100 CHECK (share_percent BETWEEN 0 AND 100),
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (receipt_id, area_id)
);

CREATE INDEX IF NOT EXISTS idx_receipt_area_links_area ON receipt_area_links(area_id);

-- ----------------------------------------------------------------------------
-- 7. RECEIPT_LINKS — n:m receipts <-> beliebige Entitaeten (tasks, contacts, events, projects)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS receipt_links (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_id   INTEGER NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
    entity_type  TEXT NOT NULL CHECK (entity_type IN (
                      'contact','task','dj_event','dj_invoice','project','workbook_page','trip'
                  )),
    entity_id    INTEGER NOT NULL,
    relation     TEXT,
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_receipt_links_receipt ON receipt_links(receipt_id);
CREATE INDEX IF NOT EXISTS idx_receipt_links_entity  ON receipt_links(entity_type, entity_id);

-- ----------------------------------------------------------------------------
-- 8. RECEIPT_OCR_RESULTS — OCR-Output (Text + per-Feld-Konfidenz, JSON)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS receipt_ocr_results (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    receipt_id          INTEGER NOT NULL REFERENCES receipts(id) ON DELETE CASCADE,
    engine              TEXT NOT NULL DEFAULT 'tesseract',     -- 'tesseract' | 'mock'
    languages           TEXT DEFAULT 'deu+eng',
    full_text           TEXT,
    overall_confidence  REAL,                                   -- 0-100 von tesseract
    parsed_fields_json  TEXT,                                   -- JSON aus receiptParserService
    applied_at          TEXT,
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_receipt_ocr_receipt ON receipt_ocr_results(receipt_id);

-- ----------------------------------------------------------------------------
-- 9. SUPPLIER_MEMORY — Lieferanten-Lerngedaechtnis (Auto-Vorschlag)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS supplier_memory (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_normalized  TEXT NOT NULL,                        -- lowercase + sanitized
    area_id              INTEGER REFERENCES areas(id) ON DELETE SET NULL,
    tax_category_id      INTEGER REFERENCES tax_categories(id) ON DELETE SET NULL,
    usage_count          INTEGER NOT NULL DEFAULT 1,
    last_used            TEXT NOT NULL DEFAULT (datetime('now')),
    created_at           TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(supplier_normalized, area_id, tax_category_id)
);

CREATE INDEX IF NOT EXISTS idx_supplier_memory_name ON supplier_memory(supplier_normalized, usage_count DESC);

-- ----------------------------------------------------------------------------
-- 10. TASKS-Erweiterung: source_receipt_id (für taskAutomationService Idempotenz)
-- ----------------------------------------------------------------------------
ALTER TABLE tasks ADD COLUMN source_receipt_id INTEGER REFERENCES receipts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_source_receipt ON tasks(source_receipt_id);

-- ----------------------------------------------------------------------------
-- 11. GoBD-LOCK TRIGGER auf receipts
-- ----------------------------------------------------------------------------
CREATE TRIGGER IF NOT EXISTS trg_receipts_no_update_after_freigabe
BEFORE UPDATE ON receipts
FOR EACH ROW
WHEN OLD.freigegeben_at IS NOT NULL
  AND (
       NEW.supplier_name           IS NOT OLD.supplier_name
    OR NEW.amount_gross_cents      IS NOT OLD.amount_gross_cents
    OR NEW.amount_net_cents        IS NOT OLD.amount_net_cents
    OR NEW.vat_rate                IS NOT OLD.vat_rate
    OR NEW.vat_amount_cents        IS NOT OLD.vat_amount_cents
    OR NEW.receipt_date            IS NOT OLD.receipt_date
    OR NEW.supplier_invoice_number IS NOT OLD.supplier_invoice_number
    OR NEW.reverse_charge          IS NOT OLD.reverse_charge
    OR NEW.file_hash_sha256        IS NOT OLD.file_hash_sha256
    OR NEW.type                    IS NOT OLD.type
    OR NEW.private_share_percent   IS NOT OLD.private_share_percent
  )
BEGIN
    SELECT RAISE(ABORT, 'GoBD: Freigegebener Beleg darf nicht verändert werden. Erstelle einen Korrekturbeleg.');
END;

-- ----------------------------------------------------------------------------
-- 12. GoBD-LOCK TRIGGER auf receipt_files
-- ----------------------------------------------------------------------------
CREATE TRIGGER IF NOT EXISTS trg_receipt_files_no_update_after_freigabe
BEFORE UPDATE ON receipt_files
FOR EACH ROW
WHEN (SELECT freigegeben_at FROM receipts WHERE id = OLD.receipt_id) IS NOT NULL
BEGIN
    SELECT RAISE(ABORT, 'GoBD: Datei eines freigegebenen Belegs darf nicht verändert werden.');
END;

CREATE TRIGGER IF NOT EXISTS trg_receipt_files_no_delete_after_freigabe
BEFORE DELETE ON receipt_files
FOR EACH ROW
WHEN (SELECT freigegeben_at FROM receipts WHERE id = OLD.receipt_id) IS NOT NULL
BEGIN
    SELECT RAISE(ABORT, 'GoBD: Datei eines freigegebenen Belegs darf nicht gelöscht werden.');
END;

CREATE TRIGGER IF NOT EXISTS trg_receipt_files_no_insert_after_freigabe
BEFORE INSERT ON receipt_files
FOR EACH ROW
WHEN (SELECT freigegeben_at FROM receipts WHERE id = NEW.receipt_id) IS NOT NULL
BEGIN
    SELECT RAISE(ABORT, 'GoBD: An einen freigegebenen Beleg dürfen keine neuen Dateien angefügt werden.');
END;

-- ----------------------------------------------------------------------------
-- 13. SEED — Areas (3 Bereiche)
-- ----------------------------------------------------------------------------
INSERT OR IGNORE INTO areas (name, slug, color, icon, sort_order) VALUES
  ('Amazon FBA', 'amazon-fba', '#ff9900', 'shopping_cart',          10),
  ('DJ',         'dj',         '#94aaff', 'equalizer',              20),
  ('Privat',     'privat',     '#5cfd80', 'home',                   30);

-- ----------------------------------------------------------------------------
-- 14. SEED — Tax Categories (17 Kategorien)
-- ----------------------------------------------------------------------------
INSERT OR IGNORE INTO tax_categories (name, slug, kind, default_vat_rate, default_input_tax_deductible, sort_order) VALUES
  ('Betriebsausgabe',  'betriebsausgabe',  'ausgabe',  19, 1, 10),
  ('Betriebseinnahme', 'betriebseinnahme', 'einnahme', 19, 0, 20),
  ('Wareneinkauf',     'wareneinkauf',     'ausgabe',  19, 1, 30),
  ('Software/Tools',   'software-tools',   'ausgabe',  19, 1, 40),
  ('Werbung',          'werbung',          'ausgabe',  19, 1, 50),
  ('Buerobedarf',      'buerobedarf',      'ausgabe',  19, 1, 60),
  ('Telefon/Internet', 'telefon-internet', 'ausgabe',  19, 1, 70),
  ('Versicherung',     'versicherung',     'ausgabe',   0, 0, 80),
  ('Fahrtkosten',      'fahrtkosten',      'ausgabe',   0, 0, 90),
  ('Bewirtung',        'bewirtung',        'ausgabe',  19, 1, 100),
  ('Steuerberatung',   'steuerberatung',   'ausgabe',  19, 1, 110),
  ('Bankgebuehren',    'bankgebuehren',    'ausgabe',   0, 0, 120),
  ('Strom/Energie',    'strom-energie',    'ausgabe',  19, 1, 130),
  ('EUSt/Zoll',        'eust-zoll',        'ausgabe',   0, 1, 140),
  ('Privat',           'privat-tk',        'ausgabe',   0, 0, 150),
  ('Gemischt',         'gemischt',         'ausgabe',  19, 1, 160),
  ('Sonstiges',        'sonstiges',        'beides',   19, 1, 170);

-- ----------------------------------------------------------------------------
-- 15. SEED — App-Settings (9 neue Keys, inkl. belege_storage_path aus Q1)
-- ----------------------------------------------------------------------------
INSERT OR IGNORE INTO app_settings (key, value) VALUES
  ('ustva_zeitraum',                'keine'),
  ('ist_versteuerung',              'true'),
  ('payment_task_lead_days',        '3'),
  ('max_upload_size_mb',            '25'),
  ('ocr_confidence_threshold',      '0.6'),
  ('ocr_engine',                    'tesseract'),
  ('mileage_rate_default_per_km',   '30'),
  ('mileage_rate_above_20km_per_km','38'),
  ('belege_storage_path',           '');
-- belege_storage_path leer = Default ~/.local/share/benny-dashboard/belege/ wird im receiptStoragePath Service angewandt
