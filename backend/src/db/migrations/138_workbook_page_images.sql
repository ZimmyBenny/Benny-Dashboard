-- Frei platzierbare Bilder je Arbeitsmappe-Seite (OneNote-Schritt 1). Additiv.
CREATE TABLE IF NOT EXISTS workbook_page_images (
  id            INTEGER PRIMARY KEY,
  page_id       INTEGER NOT NULL REFERENCES workbook_pages(id) ON DELETE CASCADE,
  attachment_id INTEGER NOT NULL REFERENCES workbook_attachments(id) ON DELETE CASCADE,
  x             REAL NOT NULL DEFAULT 20,
  y             REAL NOT NULL DEFAULT 20,
  width         REAL NOT NULL DEFAULT 300,
  height        REAL NOT NULL DEFAULT 200,
  z             INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS ix_wb_page_images_page ON workbook_page_images(page_id);
