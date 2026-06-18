-- Meine Daten: frei anlegbare/umbenennbare Gruppen (Bereiche)
CREATE TABLE amazon_my_data_group (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  title       TEXT    NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
ALTER TABLE amazon_my_data_custom ADD COLUMN group_id INTEGER;
ALTER TABLE amazon_my_data ADD COLUMN groups_seeded INTEGER NOT NULL DEFAULT 0;
