-- Migration 027: Eingangskanal für DJ-Anfragen
ALTER TABLE dj_events ADD COLUMN source_channel TEXT;
