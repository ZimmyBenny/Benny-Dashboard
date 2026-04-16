ALTER TABLE contracts_and_deadlines ADD COLUMN cancellation_notice_weeks INTEGER NOT NULL DEFAULT 4;
ALTER TABLE contracts_and_deadlines ADD COLUMN auto_renews INTEGER NOT NULL DEFAULT 1;
ALTER TABLE contracts_and_deadlines ADD COLUMN last_reviewed_at TEXT;
