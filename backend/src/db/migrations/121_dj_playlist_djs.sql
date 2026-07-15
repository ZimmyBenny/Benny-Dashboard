-- DJ-Playlisten Erweiterung: DJ-Name + Jahr + DJ-Ordnerstruktur. Additiv.
-- KEIN PRAGMA foreign_keys (migrate.ts steuert zentral).
CREATE TABLE dj_playlist_djs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
ALTER TABLE dj_playlists ADD COLUMN dj_id INTEGER REFERENCES dj_playlist_djs(id) ON DELETE SET NULL;
ALTER TABLE dj_playlists ADD COLUMN year INTEGER;
