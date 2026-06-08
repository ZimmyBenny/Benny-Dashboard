CREATE TABLE steuer_categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  jahr       INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  name       TEXT    NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX steuer_categories_jahr_idx ON steuer_categories (jahr);

CREATE TABLE steuer_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER NOT NULL REFERENCES steuer_categories(id),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  title       TEXT    NOT NULL DEFAULT '',
  is_done     INTEGER NOT NULL DEFAULT 0 CHECK (is_done IN (0,1)),
  note        TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX steuer_items_category_idx ON steuer_items (category_id);

CREATE TABLE steuer_item_files (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id       INTEGER NOT NULL REFERENCES steuer_items(id),
  sort_order    INTEGER NOT NULL DEFAULT 0,
  file_path     TEXT    NOT NULL,
  original_name TEXT,
  mime          TEXT,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX steuer_item_files_item_idx ON steuer_item_files (item_id);
