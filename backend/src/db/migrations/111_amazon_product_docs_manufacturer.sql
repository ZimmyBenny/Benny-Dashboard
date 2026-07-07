-- Finale Dateien pro Hersteller: Reiter „Allgemein" + je Hersteller.
-- Risikoarm: ADD COLUMN + sauberer Notes-Umbau OHNE Rebuild von amazon_products.

-- 1) Hersteller-Zuordnung an finalen Dateien (NULL = Allgemein). Kein FK-Constraint noetig.
ALTER TABLE amazon_product_docs ADD COLUMN manufacturer_id INTEGER;

-- 2) Notizen pro Bereich UND Hersteller-Bucket (0 = Allgemein, sonst manufacturer_id).
--    Bisheriger PK(product_id, area) erlaubt nur EINE Notiz je Bereich → neue Tabelle
--    bauen, bestehende Notizen als Bucket 0 (Allgemein) uebernehmen, alte droppen,
--    neue umbenennen. Die neue Tabelle hat KEINE Kind-Tabellen → RENAME ist unkritisch,
--    kein legacy_alter_table noetig. manufacturer_bucket=0 statt NULL, damit der PK
--    eindeutig bleibt.
CREATE TABLE amazon_product_doc_notes_new (
  product_id          INTEGER NOT NULL REFERENCES amazon_products(id) ON DELETE CASCADE,
  area                TEXT    NOT NULL CHECK(area IN ('verpackung','anleitung')),
  manufacturer_bucket INTEGER NOT NULL DEFAULT 0,
  notes               TEXT    NOT NULL DEFAULT '',
  updated_at          INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (product_id, area, manufacturer_bucket)
);
INSERT INTO amazon_product_doc_notes_new (product_id, area, manufacturer_bucket, notes, updated_at)
  SELECT product_id, area, 0, notes, updated_at FROM amazon_product_doc_notes;
DROP TABLE amazon_product_doc_notes;
ALTER TABLE amazon_product_doc_notes_new RENAME TO amazon_product_doc_notes;
