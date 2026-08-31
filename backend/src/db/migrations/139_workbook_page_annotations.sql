-- Freie Annotationen (Pfeile & Textlabels) je Arbeitsmappe-Seite. Additiv.
CREATE TABLE IF NOT EXISTS workbook_page_annotations (
  id         INTEGER PRIMARY KEY,
  page_id    INTEGER NOT NULL REFERENCES workbook_pages(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,                 -- 'arrow' | 'text'
  x1         REAL NOT NULL,
  y1         REAL NOT NULL,
  x2         REAL NOT NULL DEFAULT 0,        -- Pfeil-Ende (Text: ungenutzt)
  y2         REAL NOT NULL DEFAULT 0,
  text       TEXT NOT NULL DEFAULT '',
  color      TEXT NOT NULL DEFAULT '#ef4444',
  size       REAL NOT NULL DEFAULT 3,        -- Pfeil = Linienstärke, Text = Schriftgröße
  z          INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS ix_wb_page_annotations_page ON workbook_page_annotations(page_id);
