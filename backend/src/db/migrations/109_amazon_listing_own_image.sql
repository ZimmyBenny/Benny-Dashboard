-- Migr. 109: Tausch-Bild fuer die eigene Karte im Hauptbild-Vergleicher.
-- Speichert den Dateinamen des separat hochgeladenen Titelbild-Vergleichsbilds.
-- NULL = echtes Produkt-Hauptbild (amazon_products.image_path) verwenden.
-- Das echte Produkt-Hauptbild wird davon NICHT beruehrt.
-- amazon_listing haengt bereits per ON DELETE CASCADE am Produkt.
ALTER TABLE amazon_listing ADD COLUMN comp_own_image TEXT;
