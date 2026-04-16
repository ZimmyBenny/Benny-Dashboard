CREATE TABLE IF NOT EXISTS apple_reminders (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  apple_uid         TEXT    NOT NULL UNIQUE,
  title             TEXT    NOT NULL,
  list_name         TEXT,
  due_date          TEXT,
  reminder_date     TEXT,
  completed         INTEGER NOT NULL DEFAULT 0,
  notes             TEXT,
  last_synced_at    TEXT,
  created_at        TEXT    DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_apple_reminders_completed ON apple_reminders(completed);
CREATE INDEX IF NOT EXISTS idx_apple_reminders_list      ON apple_reminders(list_name);
CREATE INDEX IF NOT EXISTS idx_apple_reminders_due       ON apple_reminders(due_date);
