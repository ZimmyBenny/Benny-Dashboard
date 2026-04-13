-- Eintragstyp 'Aktion' + Bereich 'Banken' hinzufügen
-- SQLite erlaubt kein ALTER COLUMN → Tabelle neu erstellen

PRAGMA foreign_keys = OFF;

CREATE TABLE contracts_and_deadlines_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  item_type TEXT NOT NULL DEFAULT 'Sonstiges' CHECK(item_type IN ('Vertrag','Dokument','Frist','Versicherung','Mitgliedschaft','Garantie','Aktion','Sonstiges')),
  area TEXT NOT NULL DEFAULT 'Sonstiges' CHECK(area IN ('Privat','DJ','Amazon','Cashback','Finanzen','Banken','Sonstiges')),
  status TEXT NOT NULL DEFAULT 'aktiv' CHECK(status IN ('aktiv','in_pruefung','gekuendigt','abgelaufen','archiviert')),
  priority TEXT NOT NULL DEFAULT 'mittel' CHECK(priority IN ('niedrig','mittel','hoch','kritisch')),
  provider_name TEXT,
  reference_number TEXT,
  start_date TEXT,
  expiration_date TEXT,
  cancellation_date TEXT,
  reminder_date TEXT,
  recurrence_type TEXT DEFAULT 'keine',
  cost_amount REAL,
  currency TEXT DEFAULT 'EUR',
  cost_interval TEXT CHECK(cost_interval IN ('einmalig','monatlich','quartalsweise','jaehrlich') OR cost_interval IS NULL),
  description TEXT,
  notes TEXT,
  tags TEXT,
  linked_contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL,
  linked_task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  linked_calendar_event_id TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  unbefristet INTEGER NOT NULL DEFAULT 0,
  vertragsinhaber TEXT,
  kontoname TEXT
);

INSERT INTO contracts_and_deadlines_new SELECT * FROM contracts_and_deadlines;

DROP TABLE contracts_and_deadlines;

ALTER TABLE contracts_and_deadlines_new RENAME TO contracts_and_deadlines;

CREATE INDEX IF NOT EXISTS idx_cad_item_type ON contracts_and_deadlines(item_type);
CREATE INDEX IF NOT EXISTS idx_cad_area ON contracts_and_deadlines(area);
CREATE INDEX IF NOT EXISTS idx_cad_status ON contracts_and_deadlines(status);
CREATE INDEX IF NOT EXISTS idx_cad_expiration_date ON contracts_and_deadlines(expiration_date);
CREATE INDEX IF NOT EXISTS idx_cad_reminder_date ON contracts_and_deadlines(reminder_date);
CREATE INDEX IF NOT EXISTS idx_cad_is_archived ON contracts_and_deadlines(is_archived);

PRAGMA foreign_keys = ON;
