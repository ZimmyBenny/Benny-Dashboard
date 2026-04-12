-- Haupttabelle
CREATE TABLE IF NOT EXISTS contracts_and_deadlines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  item_type TEXT NOT NULL DEFAULT 'Sonstiges' CHECK(item_type IN ('Vertrag','Dokument','Frist','Versicherung','Mitgliedschaft','Garantie','Sonstiges')),
  area TEXT NOT NULL DEFAULT 'Sonstiges' CHECK(area IN ('Privat','DJ','Amazon','Cashback','Finanzen','Sonstiges')),
  status TEXT NOT NULL DEFAULT 'aktiv' CHECK(status IN ('aktiv','in_pruefung','gekuendigt','abgelaufen','archiviert')),
  priority TEXT NOT NULL DEFAULT 'mittel' CHECK(priority IN ('niedrig','mittel','hoch','kritisch')),
  provider_name TEXT,
  reference_number TEXT,
  start_date TEXT,
  expiration_date TEXT,
  cancellation_date TEXT,
  reminder_date TEXT,
  recurrence_type TEXT DEFAULT 'keine' CHECK(recurrence_type IN ('keine','monatlich','jaehrlich','custom')),
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
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Anhänge
CREATE TABLE IF NOT EXISTS contracts_and_deadlines_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES contracts_and_deadlines(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  storage_path TEXT NOT NULL,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Activity Log
CREATE TABLE IF NOT EXISTS contracts_and_deadlines_activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id INTEGER NOT NULL REFERENCES contracts_and_deadlines(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cad_item_type ON contracts_and_deadlines(item_type);
CREATE INDEX IF NOT EXISTS idx_cad_area ON contracts_and_deadlines(area);
CREATE INDEX IF NOT EXISTS idx_cad_status ON contracts_and_deadlines(status);
CREATE INDEX IF NOT EXISTS idx_cad_expiration_date ON contracts_and_deadlines(expiration_date);
CREATE INDEX IF NOT EXISTS idx_cad_reminder_date ON contracts_and_deadlines(reminder_date);
CREATE INDEX IF NOT EXISTS idx_cad_is_archived ON contracts_and_deadlines(is_archived);
CREATE INDEX IF NOT EXISTS idx_cad_attachments_item ON contracts_and_deadlines_attachments(item_id);
CREATE INDEX IF NOT EXISTS idx_cad_activity_item ON contracts_and_deadlines_activity_log(item_id);
