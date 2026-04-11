ALTER TABLE tasks ADD COLUMN source_page_id INTEGER REFERENCES workbook_pages(id) ON DELETE SET NULL;
