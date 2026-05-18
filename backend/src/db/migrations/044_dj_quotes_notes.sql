-- Migration 044: dj_quotes — Notizen + Referenznummer
-- Drei TEXT-Spalten ergaenzen, die das Frontend bereits sendet aber Backend
-- bisher ignoriert: notes (Hinweise fuer Kunden), internal_notes (intern),
-- reference_number (externe Referenz).

ALTER TABLE dj_quotes ADD COLUMN notes TEXT;
ALTER TABLE dj_quotes ADD COLUMN internal_notes TEXT;
ALTER TABLE dj_quotes ADD COLUMN reference_number TEXT;
