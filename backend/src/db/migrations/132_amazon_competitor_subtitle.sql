-- Mitbewerber: Feld „Untertitel" (zweite Amazon-Titelzeile). Additiv, kein Rebuild, kein PRAGMA.
ALTER TABLE amazon_competitors ADD COLUMN subtitle TEXT NOT NULL DEFAULT '';
