-- Migration 030: calendar_uid für DJ Events
-- Speichert die Apple-Calendar-UID wenn ein Termin angelegt wurde

ALTER TABLE dj_events ADD COLUMN calendar_uid TEXT;
