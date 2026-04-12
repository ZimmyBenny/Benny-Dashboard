ALTER TABLE contracts_and_deadlines ADD COLUMN unbefristet INTEGER NOT NULL DEFAULT 0;
ALTER TABLE contracts_and_deadlines ADD COLUMN vertragsinhaber TEXT;
ALTER TABLE contracts_and_deadlines ADD COLUMN kontoname TEXT;
