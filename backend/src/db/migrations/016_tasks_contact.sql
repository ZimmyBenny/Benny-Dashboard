ALTER TABLE tasks ADD COLUMN contact_id INTEGER REFERENCES contacts(id) ON DELETE SET NULL;
CREATE INDEX idx_tasks_contact_id ON tasks(contact_id);
