-- Migration 071: Fragen an den Hersteller je USP-Punkt (2026-06-08)
-- WICHTIG: Kein FK-Pragma setzen. Rein additiv (neue Tabelle).

CREATE TABLE amazon_usp_point_questions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  point_id    INTEGER NOT NULL REFERENCES amazon_usp_points(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  text        TEXT    NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX amazon_usp_point_questions_point_idx
  ON amazon_usp_point_questions (point_id, sort_order, id);
