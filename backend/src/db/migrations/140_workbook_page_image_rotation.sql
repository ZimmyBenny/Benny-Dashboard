-- Drehwinkel (Grad) für frei platzierte Bilder. Additiv.
ALTER TABLE workbook_page_images ADD COLUMN rotation REAL NOT NULL DEFAULT 0;
