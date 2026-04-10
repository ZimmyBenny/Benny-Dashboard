-- 002_time_tracking.sql
-- Zeiterfassung: Kunden, Projekte, Zeiteintraege

CREATE TABLE IF NOT EXISTS clients (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL UNIQUE,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL,
  client_id   INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  hourly_rate REAL,
  color       TEXT,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS time_entries (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id       INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  client_id        INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  title            TEXT    NOT NULL,
  note             TEXT,
  date             TEXT    NOT NULL,
  duration_seconds INTEGER NOT NULL,
  created_at       TEXT    NOT NULL DEFAULT (datetime('now'))
);
