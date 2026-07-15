-- DJ-Playlisten (Excel/PDF/HTML) je Kategorie. Additiv, keine Kind-Tabellen,
-- kein Rebuild → unkritisch. KEIN PRAGMA foreign_keys (migrate.ts steuert zentral).
-- Siehe docs/superpowers/specs/2026-07-13-dj-playlisten-design.md
CREATE TABLE dj_playlist_categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE dj_playlists (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL,
  category_id INTEGER REFERENCES dj_playlist_categories(id) ON DELETE SET NULL,
  doc_file_id INTEGER NOT NULL REFERENCES doc_files(id) ON DELETE CASCADE,
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_dj_playlists_category ON dj_playlists(category_id);
CREATE INDEX idx_dj_playlists_doc_file ON dj_playlists(doc_file_id);
