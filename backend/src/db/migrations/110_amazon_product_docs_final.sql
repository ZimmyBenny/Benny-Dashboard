-- Produkt-Dokumente: Trennung in Arbeitsdateien (0) und Finale Dateien (1).
-- 0 = Arbeitsdatei, 1 = Finale Datei. Nur ADD COLUMN, kein Rebuild, kein PRAGMA.
ALTER TABLE amazon_product_docs ADD COLUMN is_final INTEGER NOT NULL DEFAULT 0;
