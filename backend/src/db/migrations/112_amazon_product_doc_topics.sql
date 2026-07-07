-- „Design & Druck": selbst anlegbare Unterpunkte (Topics) statt zwei fixer Bereiche.
-- VERLUSTFREI: jede bestehende (product_id, area)-Kombi wird zu einem Start-Topic;
-- alle Dateien + Notizen bleiben erhalten und haengen an gueltigen Topics.
--
-- Datensicherheits-Merksatz (vgl. Migration 111): Tabellen-Rebuild per
-- CREATE-new + migrate + DROP + RENAME ist NUR sicher bei Tabellen OHNE Kind-Tabellen.
-- amazon_product_doc_notes hat KEINE Kind-Tabellen → RENAME unkritisch, kein
-- legacy_alter_table noetig. amazon_products wird NICHT angefasst. KEIN PRAGMA
-- foreign_keys (migrate.ts steuert das zentral). Auto-Backup laeuft in migrate.ts.

-- 1) Topics-Tabelle.
CREATE TABLE amazon_product_doc_topics (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES amazon_products(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_amazon_product_doc_topics ON amazon_product_doc_topics(product_id, sort_order);

-- 2) topic_id an docs (nullable, mit REFERENCES — etablierte Repo-Konvention, vgl. 078).
--    Wir verlassen uns NICHT auf FK-CASCADE beim Loeschen; die Delete-Route raeumt explizit.
ALTER TABLE amazon_product_docs ADD COLUMN topic_id INTEGER REFERENCES amazon_product_doc_topics(id) ON DELETE CASCADE;

-- 3) Start-Topics je vorhandener (product_id, area)-Kombi anlegen — Distinct ueber BEIDE
--    Tabellen (damit auch reine Notiz-ohne-Datei ein Topic bekommt).
--    verpackung → „Verpackungsdesign" (sort 0), anleitung → „Aufbauanleitung / Gebrauchsanleitung" (sort 1).
INSERT INTO amazon_product_doc_topics (product_id, name, sort_order)
SELECT product_id,
       CASE area WHEN 'verpackung' THEN 'Verpackungsdesign'
                 ELSE 'Aufbauanleitung / Gebrauchsanleitung' END,
       CASE area WHEN 'verpackung' THEN 0 ELSE 1 END
FROM (
  SELECT product_id, area FROM amazon_product_docs
  UNION
  SELECT product_id, area FROM amazon_product_doc_notes
)
ORDER BY product_id, area;

-- 4) docs.topic_id per (product_id, area) auf das passende Topic setzen (alle uebrigen Spalten unveraendert).
UPDATE amazon_product_docs
SET topic_id = (
  SELECT t.id FROM amazon_product_doc_topics t
  WHERE t.product_id = amazon_product_docs.product_id
    AND t.name = CASE amazon_product_docs.area
                   WHEN 'verpackung' THEN 'Verpackungsdesign'
                   ELSE 'Aufbauanleitung / Gebrauchsanleitung' END
);

-- 5) Notizen re-keyen auf (topic_id, manufacturer_bucket) — gleiche risikoarme Methode wie
--    Migration 111 (create-new → migrate → drop → rename; notes hat KEINE Kind-Tabellen).
CREATE TABLE amazon_product_doc_notes_new (
  topic_id            INTEGER NOT NULL REFERENCES amazon_product_doc_topics(id) ON DELETE CASCADE,
  manufacturer_bucket INTEGER NOT NULL DEFAULT 0,
  notes               TEXT    NOT NULL DEFAULT '',
  updated_at          INTEGER NOT NULL DEFAULT (unixepoch()),
  PRIMARY KEY (topic_id, manufacturer_bucket)
);
INSERT INTO amazon_product_doc_notes_new (topic_id, manufacturer_bucket, notes, updated_at)
SELECT t.id, n.manufacturer_bucket, n.notes, n.updated_at
FROM amazon_product_doc_notes n
JOIN amazon_product_doc_topics t
  ON t.product_id = n.product_id
 AND t.name = CASE n.area WHEN 'verpackung' THEN 'Verpackungsdesign'
                          ELSE 'Aufbauanleitung / Gebrauchsanleitung' END;
DROP TABLE amazon_product_doc_notes;
ALTER TABLE amazon_product_doc_notes_new RENAME TO amazon_product_doc_notes;
