-- Migration 028: Direkte Locationfelder auf DJ-Events (Name, Straße, PLZ, Stadt)
ALTER TABLE dj_events ADD COLUMN venue_name TEXT;
ALTER TABLE dj_events ADD COLUMN venue_street TEXT;
ALTER TABLE dj_events ADD COLUMN venue_zip TEXT;
ALTER TABLE dj_events ADD COLUMN venue_city TEXT;
