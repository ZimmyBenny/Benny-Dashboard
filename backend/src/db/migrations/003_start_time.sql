-- 003_start_time.sql
-- Zeiterfassung: start_time und end_time fuer Timer-Eintraege

ALTER TABLE time_entries ADD COLUMN start_time TEXT;
ALTER TABLE time_entries ADD COLUMN end_time TEXT;
