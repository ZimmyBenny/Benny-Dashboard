-- Migration 058: Amazon ECO-Dashboard — Sourcing-Sektion (2026-06-01)
-- WICHTIG: Kein FK-Pragma setzen — wird zentral in migrate.ts gesteuert
-- WICHTIG: Auto-Backup laeuft via migrate.ts vor Anwendung

CREATE TABLE amazon_sourcing (
  product_id                    INTEGER PRIMARY KEY
                                REFERENCES amazon_products(id) ON DELETE CASCADE,
  status                        TEXT    NOT NULL DEFAULT 'offen'
                                CHECK (status IN ('offen','in_bearbeitung','erledigt')),
  is_expanded                   INTEGER NOT NULL DEFAULT 1
                                CHECK (is_expanded IN (0,1)),
  cp_hersteller_gefiltert       INTEGER NOT NULL DEFAULT 0 CHECK (cp_hersteller_gefiltert IN (0,1)),
  cp_anforderungen_kommuniziert INTEGER NOT NULL DEFAULT 0 CHECK (cp_anforderungen_kommuniziert IN (0,1)),
  cp_erste_preise_erhalten      INTEGER NOT NULL DEFAULT 0 CHECK (cp_erste_preise_erhalten IN (0,1)),
  cp_usp_geprueft               INTEGER NOT NULL DEFAULT 0 CHECK (cp_usp_geprueft IN (0,1)),
  cp_samples_angefragt          INTEGER NOT NULL DEFAULT 0 CHECK (cp_samples_angefragt IN (0,1)),
  cp_sample_analyse             INTEGER NOT NULL DEFAULT 0 CHECK (cp_sample_analyse IN (0,1)),
  cp_vergleichstabelle          INTEGER NOT NULL DEFAULT 0 CHECK (cp_vergleichstabelle IN (0,1)),
  cp_finale_verhandlung         INTEGER NOT NULL DEFAULT 0 CHECK (cp_finale_verhandlung IN (0,1)),
  cp_zahlungsziel               INTEGER NOT NULL DEFAULT 0 CHECK (cp_zahlungsziel IN (0,1)),
  updated_at                    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE amazon_sourcing_samples (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id      INTEGER NOT NULL
                  REFERENCES amazon_products(id) ON DELETE CASCADE,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  is_winner       INTEGER NOT NULL DEFAULT 0 CHECK (is_winner IN (0,1)),
  hersteller      TEXT,
  sample_kosten   TEXT,
  besonderheiten  TEXT,
  lieferzeit      TEXT,
  qualitaet       TEXT CHECK (qualitaet IS NULL OR qualitaet IN ('sehr_gut','gut','mittel','schlecht')),
  bewertung       INTEGER CHECK (bewertung IS NULL OR (bewertung >= 0 AND bewertung <= 5)),
  status          TEXT CHECK (status IS NULL OR status IN ('angefragt','bestellt','erhalten','abgelehnt')),
  notizen         TEXT,
  created_at      INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at      INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX amazon_sourcing_samples_product_idx
  ON amazon_sourcing_samples (product_id, sort_order, id);
