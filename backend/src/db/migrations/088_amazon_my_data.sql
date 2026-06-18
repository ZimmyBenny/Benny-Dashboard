-- Persönliche/geschäftliche Stammdaten (Single-Row, id=1) + PIN-Hash
CREATE TABLE amazon_my_data (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  pin_hash       TEXT,
  eori           TEXT,
  vat_id         TEXT,
  tax_number     TEXT,
  finanzamt      TEXT,
  bank_holder    TEXT,
  iban           TEXT,
  bic            TEXT,
  bank_name      TEXT,
  name           TEXT,
  firma          TEXT,
  adresse        TEXT,
  email          TEXT,
  telefon        TEXT,
  webseite       TEXT,
  amazon_email   TEXT,
  amazon_store   TEXT,
  merchant_token TEXT,
  updated_at     INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE amazon_my_data_custom (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  label       TEXT    NOT NULL DEFAULT '',
  value       TEXT    NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
