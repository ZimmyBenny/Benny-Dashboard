-- Migration 096: Dokumente-Modul (2026-07-04)
--
-- Zweck: Zentrale Dokumentenablage mit 4 festen Bereichs-Wurzeln (Amazon, DJ,
--   Finanzen, Privat), darunter frei anlegbaren Unterordnern (beliebig tief).
--   Siehe docs/superpowers/specs/2026-07-04-dokumente-modul-design.md
--
-- WICHTIG:
-- - Rein additiv (neue Tabellen) -> kein PRAGMA foreign_keys hier (zentral in
--   migrate.ts gesteuert; Auto-Backup dort).
-- - Kein createBackup noetig (additive Migration, keine Bulk-Mutation an
--   bestehenden Daten).
-- - Wurzel-Ordner sind is_area_root=1 und via API PATCH/DELETE-geschuetzt (403).

CREATE TABLE doc_folders (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id     INTEGER REFERENCES doc_folders(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  is_area_root  INTEGER NOT NULL DEFAULT 0,
  area_slug     TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(parent_id, name)
);

CREATE TABLE doc_files (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  folder_id   INTEGER NOT NULL REFERENCES doc_folders(id) ON DELETE CASCADE,
  filename    TEXT NOT NULL,
  size_bytes  INTEGER NOT NULL,
  mime_type   TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(folder_id, filename)
);

CREATE INDEX idx_doc_folders_parent ON doc_folders(parent_id);
CREATE INDEX idx_doc_files_folder ON doc_files(folder_id);

-- Seed der 4 Wurzel-Bereichsordner (fix, nicht umbenennbar/loeschbar)
INSERT INTO doc_folders (parent_id, name, is_area_root, area_slug) VALUES
  (NULL, 'Amazon',   1, 'amazon'),
  (NULL, 'DJ',        1, 'dj'),
  (NULL, 'Finanzen', 1, 'finanzen'),
  (NULL, 'Privat',   1, 'privat');
