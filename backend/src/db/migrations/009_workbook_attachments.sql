-- Migration 009: Dateianhänge für Arbeitsmappe

CREATE TABLE IF NOT EXISTS workbook_attachments (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id      INTEGER NOT NULL REFERENCES workbook_pages(id) ON DELETE CASCADE,
  file_name    TEXT    NOT NULL,
  file_type    TEXT    NOT NULL,
  file_size    INTEGER NOT NULL,
  storage_path TEXT    NOT NULL,
  uploaded_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  uploaded_by  TEXT    NOT NULL DEFAULT 'benny'
);
