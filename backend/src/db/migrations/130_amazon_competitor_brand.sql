-- Mitbewerber: Feld „Marke / Verkäufer" ergänzen. Additiv, kein Rebuild, kein PRAGMA.
ALTER TABLE amazon_competitors ADD COLUMN brand TEXT NOT NULL DEFAULT '';
