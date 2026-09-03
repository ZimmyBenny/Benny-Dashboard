-- "An Herstellerin gesendet"-Markierung je Seite (Datum + Notiz). Additiv.
ALTER TABLE workbook_pages ADD COLUMN sent_at INTEGER;
ALTER TABLE workbook_pages ADD COLUMN sent_note TEXT;
