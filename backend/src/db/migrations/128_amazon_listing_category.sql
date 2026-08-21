-- Listing: Feld „Kategorie" (Amazon-Produktkategorie) ergänzen.
-- Additiv, kein Rebuild, kein PRAGMA foreign_keys.
ALTER TABLE amazon_listing ADD COLUMN category TEXT NOT NULL DEFAULT '';
