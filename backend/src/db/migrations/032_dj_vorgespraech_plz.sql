-- Migration 032: PLZ-Feld für Vorgespräch-Ort
ALTER TABLE dj_events ADD COLUMN vorgespraech_plz TEXT DEFAULT NULL;
