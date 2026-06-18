-- Meine Daten: flexible Felder (Label + Wert) je Gruppe, alle editierbar
ALTER TABLE amazon_my_data_custom ADD COLUMN group_key TEXT NOT NULL DEFAULT 'weitere';
ALTER TABLE amazon_my_data ADD COLUMN fields_seeded INTEGER NOT NULL DEFAULT 0;
