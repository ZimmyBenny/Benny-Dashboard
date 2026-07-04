-- Migration 099: trips.area_slug — Bereichs-Zuordnung fuer Fahrten
-- Additiv. Bestandsfahrten bekommen 'dj' per DEFAULT (kein separates UPDATE noetig).
ALTER TABLE trips ADD COLUMN area_slug TEXT NOT NULL DEFAULT 'dj';
