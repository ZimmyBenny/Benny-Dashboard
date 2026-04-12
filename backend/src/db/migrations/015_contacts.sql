-- app_settings (fuer Heimatort + zukuenftige Einstellungen)
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);
INSERT OR IGNORE INTO app_settings (key, value) VALUES
  ('home_city', 'Roding'),
  ('home_postal_code', '93426'),
  ('home_country', 'Deutschland'),
  ('home_latitude', '49.1981'),
  ('home_longitude', '12.5228'),
  ('contact_next_number', '1051');

-- Haupttabelle
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_kind TEXT NOT NULL CHECK(contact_kind IN ('person','organization')),
  type TEXT NOT NULL DEFAULT 'Sonstiges',
  area TEXT NOT NULL DEFAULT 'Sonstiges',
  customer_number TEXT UNIQUE,
  salutation TEXT,
  title TEXT,
  first_name TEXT,
  last_name TEXT,
  suffix TEXT,
  organization_name TEXT,
  position TEXT,
  debtor_number TEXT,
  creditor_number TEXT,
  e_invoice_default INTEGER DEFAULT 0,
  iban TEXT,
  bic TEXT,
  vat_id TEXT,
  tax_number TEXT,
  discount_days INTEGER,
  discount_percent REAL,
  payment_term_days INTEGER,
  customer_discount REAL,
  birthday TEXT,
  description TEXT,
  tags TEXT,
  is_archived INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contact_addresses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  street TEXT,
  postal_code TEXT,
  city TEXT,
  country TEXT DEFAULT 'Deutschland',
  label TEXT DEFAULT 'Rechnungsanschrift',
  is_primary INTEGER DEFAULT 0,
  latitude REAL,
  longitude REAL
);

CREATE TABLE IF NOT EXISTS contact_emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  label TEXT DEFAULT 'Arbeit',
  is_primary INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS contact_phones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  label TEXT DEFAULT 'Arbeit',
  is_primary INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS contact_websites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  label TEXT DEFAULT 'Webseite',
  is_primary INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS contact_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contact_activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  message TEXT NOT NULL,
  related_entity_type TEXT,
  related_entity_id INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);
