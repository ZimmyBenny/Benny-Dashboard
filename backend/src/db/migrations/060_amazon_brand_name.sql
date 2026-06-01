-- Migration 060: Amazon Brand-Sektion — Namen + Favoriten-Recherche (2026-06-01)
-- WICHTIG: Kein FK-Pragma setzen
-- WICHTIG: Auto-Backup laeuft via migrate.ts

CREATE TABLE amazon_brand_name (
  product_id  INTEGER PRIMARY KEY
              REFERENCES amazon_products(id) ON DELETE CASCADE,
  status      TEXT    NOT NULL DEFAULT 'offen'
              CHECK (status IN ('offen','in_bearbeitung','erledigt')),
  is_expanded INTEGER NOT NULL DEFAULT 1
              CHECK (is_expanded IN (0,1)),
  notes       TEXT,
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE amazon_brand_name_candidates (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id      INTEGER NOT NULL
                  REFERENCES amazon_products(id) ON DELETE CASCADE,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  name            TEXT NOT NULL,
  is_interesting  INTEGER NOT NULL DEFAULT 0 CHECK (is_interesting IN (0,1)),
  is_maybe        INTEGER NOT NULL DEFAULT 0 CHECK (is_maybe IN (0,1)),
  is_yes          INTEGER NOT NULL DEFAULT 0 CHECK (is_yes IN (0,1)),
  is_no           INTEGER NOT NULL DEFAULT 0 CHECK (is_no IN (0,1)),
  is_favorite     INTEGER NOT NULL DEFAULT 0 CHECK (is_favorite IN (0,1)),
  is_archived     INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0,1)),
  remarks         TEXT,
  trademark_status   TEXT CHECK (trademark_status   IS NULL OR trademark_status   IN ('frei','belegt','unklar')),
  domain_com_status  TEXT CHECK (domain_com_status  IS NULL OR domain_com_status  IN ('frei','belegt','unklar')),
  domain_de_status   TEXT CHECK (domain_de_status   IS NULL OR domain_de_status   IN ('frei','belegt','unklar')),
  social_status      TEXT CHECK (social_status      IS NULL OR social_status      IN ('frei','belegt','unklar')),
  research_url       TEXT,
  research_notes     TEXT,
  created_at         INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at         INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX amazon_brand_name_candidates_product_idx
  ON amazon_brand_name_candidates (product_id, sort_order, id);
