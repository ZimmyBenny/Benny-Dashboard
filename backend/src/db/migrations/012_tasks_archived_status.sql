-- Extend the tasks status CHECK constraint to include 'archived'.
-- SQLite does not support ALTER TABLE to modify constraints directly,
-- so we rebuild the table using the recommended rename-create-copy-drop approach.
-- Hinweis: PRAGMA foreign_keys wird zentral in migrate.ts gesteuert.

ALTER TABLE tasks RENAME TO tasks_old;

CREATE TABLE tasks (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  title                 TEXT    NOT NULL,
  description           TEXT,
  status                TEXT    NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open', 'in_progress', 'waiting', 'done', 'archived')),
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
  updated_at            TEXT    DEFAULT (datetime('now')),
  status_note           TEXT,
  source_page_id        INTEGER REFERENCES workbook_pages(id) ON DELETE SET NULL
);

INSERT INTO tasks SELECT
  id, title, description, status, area, priority, due_date, tags,
  project_or_customer, notes, start_date, reminder_at, has_reminder,
  create_calendar_entry, calendar_event_id, calendar_sync_status,
  is_all_day, estimated_duration, completed_at, position,
  created_at, updated_at, status_note, source_page_id
FROM tasks_old;

DROP TABLE tasks_old;

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_status_position ON tasks(status, position);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_area ON tasks(area);
