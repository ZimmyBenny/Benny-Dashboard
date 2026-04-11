-- Migration 010: parent_id fuer Unterseiten
ALTER TABLE workbook_pages ADD COLUMN parent_id INTEGER REFERENCES workbook_pages(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_workbook_pages_parent ON workbook_pages(parent_id);
