-- Mitbewerber: Feld „Stand" (Datum, wann Preis/Sterne/Bewertungen abgelesen wurden).
-- TEXT im Format "YYYY-MM-DD" (leer = keine Angabe). Additiv, kein Rebuild, kein PRAGMA.
ALTER TABLE amazon_competitors ADD COLUMN checked_on TEXT NOT NULL DEFAULT '';
