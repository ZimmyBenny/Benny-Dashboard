CREATE TABLE IF NOT EXISTS tasks (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  title                 TEXT    NOT NULL,
  description           TEXT,
  status                TEXT    NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open', 'in_progress', 'waiting', 'done')),
  area                  TEXT,
  priority              TEXT    DEFAULT 'medium'
                        CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  due_date              TEXT,
  tags                  TEXT,
  project_or_customer   TEXT,
  notes                 TEXT,
  start_date            TEXT,
  reminder_at           TEXT,
  has_reminder          INTEGER DEFAULT 0,
  create_calendar_entry INTEGER DEFAULT 0,
  calendar_event_id     TEXT,
  calendar_sync_status  TEXT,
  is_all_day            INTEGER DEFAULT 0,
  estimated_duration    INTEGER,
  completed_at          TEXT,
  position              INTEGER DEFAULT 0,
  created_at            TEXT    DEFAULT (datetime('now')),
  updated_at            TEXT    DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_status_position ON tasks(status, position);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_area ON tasks(area);
