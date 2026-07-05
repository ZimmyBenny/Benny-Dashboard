-- Migration 100: trips.reference — manuelle Referenz-/Beleg-Nr. je Fahrt
-- Additiv. Ohne manuelle Referenz wird beim Spiegeln eine Referenz aus dem
-- verknuepften Event abgeleitet (RE-Nr. bevorzugt, Fallback AN-Nr.).
ALTER TABLE trips ADD COLUMN reference TEXT;
