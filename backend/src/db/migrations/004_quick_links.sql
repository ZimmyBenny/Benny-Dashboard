CREATE TABLE IF NOT EXISTS quick_links (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  label      TEXT    NOT NULL,
  url        TEXT    NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  visible    INTEGER NOT NULL DEFAULT 1,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO quick_links (label, url, sort_order, visible) VALUES ('AMZ Ecosystem', 'https://www.amz-ecosystem.app', 0, 1);
