-- Kostenaufteilung (Split), Geschaeftliche Ausgabe, Brutto/Netto
ALTER TABLE contracts_and_deadlines ADD COLUMN split_count INTEGER NOT NULL DEFAULT 1;
ALTER TABLE contracts_and_deadlines ADD COLUMN split_amount REAL;
ALTER TABLE contracts_and_deadlines ADD COLUMN is_business INTEGER NOT NULL DEFAULT 0;
ALTER TABLE contracts_and_deadlines ADD COLUMN amount_type TEXT DEFAULT 'brutto';
ALTER TABLE contracts_and_deadlines ADD COLUMN vat_rate REAL DEFAULT 19;
