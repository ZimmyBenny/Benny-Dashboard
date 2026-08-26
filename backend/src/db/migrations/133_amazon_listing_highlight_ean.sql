-- Listing: Felder „Artikel-Highlight" (Amazon-Highlight, sichtbar bei Titel < 75 Zeichen)
-- und „EAN/GTIN" (Produkt-Barcode). Additiv, kein Rebuild, kein PRAGMA.
ALTER TABLE amazon_listing ADD COLUMN article_highlight TEXT NOT NULL DEFAULT '';
ALTER TABLE amazon_listing ADD COLUMN ean_gtin TEXT NOT NULL DEFAULT '';
