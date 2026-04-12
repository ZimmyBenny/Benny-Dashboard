ALTER TABLE workbook_pages ADD COLUMN contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL;
CREATE INDEX idx_workbook_pages_contact ON workbook_pages(contact_id);
