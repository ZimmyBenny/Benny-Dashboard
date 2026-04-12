ALTER TABLE time_entries ADD COLUMN contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL;
CREATE INDEX idx_time_entries_contact_id ON time_entries(contact_id);
