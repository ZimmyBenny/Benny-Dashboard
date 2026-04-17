-- Migration 031: Vorgespräch-Felder für DJ-Events
ALTER TABLE dj_events ADD COLUMN vorgespraech_status TEXT CHECK(vorgespraech_status IN ('offen','erledigt')) DEFAULT NULL;
ALTER TABLE dj_events ADD COLUMN vorgespraech_datum TEXT DEFAULT NULL;
ALTER TABLE dj_events ADD COLUMN vorgespraech_ort TEXT DEFAULT NULL;
ALTER TABLE dj_events ADD COLUMN vorgespraech_notizen TEXT DEFAULT NULL;
ALTER TABLE dj_events ADD COLUMN vorgespraech_km REAL DEFAULT NULL;
ALTER TABLE dj_events ADD COLUMN vorgespraech_calendar_uid TEXT DEFAULT NULL;
