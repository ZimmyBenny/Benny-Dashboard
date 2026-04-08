-- 001_initial.sql
-- Initial schema: single-user table with database-level constraint
-- CHECK (id = 1) enforces single-user at the database layer — no application code needed

CREATE TABLE IF NOT EXISTS user (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
