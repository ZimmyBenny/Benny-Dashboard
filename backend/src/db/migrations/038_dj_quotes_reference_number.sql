-- Migration 038: Referenz-/Bestellnummer für dj_quotes
ALTER TABLE dj_quotes ADD COLUMN reference_number TEXT;
