-- Migration 117 — Masterbox-Checkliste v2 (2026-07-10)
-- Ersetzt die 8 ursprünglichen Standard-Masterbox-Punkte (Migration 116, eine
-- Sammel-Kategorie) durch die mit dem User abgestimmten 15 Punkte in 3 Kategorien
-- (Vorlage: App-Screenshots + 2 Ergänzungen Karton-Nummerierung / Umreifungsbänder).
-- Nur STANDARD-Punkte (product_id IS NULL) werden ersetzt — eigene Zusatzpunkte
-- der Produkte bleiben unberührt. Status-Zeilen hängen per ON DELETE CASCADE an
-- den Items (Live-Check: aktuell 0 Master-Status-Zeilen → verlustfrei).
-- KEIN PRAGMA foreign_keys hier — zentral in migrate.ts. Auto-Backup via migrate.ts.

DELETE FROM amazon_packaging_check_status WHERE item_id IN (
  SELECT id FROM amazon_packaging_check_items WHERE product_id IS NULL AND box_type = 'master'
);
DELETE FROM amazon_packaging_check_items WHERE product_id IS NULL AND box_type = 'master';

INSERT OR IGNORE INTO amazon_packaging_check_items (product_id, box_type, category, name, description, requirement, severity, sort_order) VALUES
-- ── Karton-Labeling (FBA) ── 6 Punkte
(NULL, 'master', 'Karton-Labeling (FBA)', 'FBA Shipment Label vorhanden', 'Jeder Karton muss ein FBA-Versandetikett mit dem Barcode der Sendung tragen.', 'Pflicht', 'pflicht', 1),
(NULL, 'master', 'Karton-Labeling (FBA)', 'Label auf 2 Seiten angebracht', 'Amazon empfiehlt, das Versandetikett auf mindestens 2 gegenüberliegenden Seiten anzubringen.', 'Empfohlen: 2 Seiten', 'empfohlen', 2),
(NULL, 'master', 'Karton-Labeling (FBA)', 'Alte Labels entfernt/überklebt', 'Alle alten Barcodes und Versandetiketten müssen entfernt oder vollständig überklebt werden.', 'Pflicht', 'pflicht', 3),
(NULL, 'master', 'Karton-Labeling (FBA)', '''Set – Do not separate'' Label (falls Set)', 'Wenn der Karton als Set verkauft wird, muss ein ''Set – Do not separate'' Hinweis drauf.', 'Falls Set/Bundle', 'empfohlen', 4),
(NULL, 'master', 'Karton-Labeling (FBA)', '''This Side Up'' (falls nötig)', 'Für zerbrechliche oder orientierungsabhängige Ware: ''This Side Up''-Pfeile anbringen.', 'Falls zutreffend', 'empfohlen', 5),
(NULL, 'master', 'Karton-Labeling (FBA)', 'Karton-Nummerierung (Karton X von Y)', 'Bei mehreren Kartons pro Lieferung: fortlaufende Nummerierung erleichtert Wareneingang und Kontrolle.', 'Empfohlen', 'empfohlen', 6),
-- ── Maße & Gewicht (Masterbox) ── 5 Punkte
(NULL, 'master', 'Maße & Gewicht (Masterbox)', 'Max. 22,7 kg pro Karton', 'Ein einzelner Karton darf max. 50 lbs (22,7 kg) wiegen. Über 50 lbs: ''Team Lift'' Label.', 'Max. 22,7 kg (50 lbs)', 'pflicht', 7),
(NULL, 'master', 'Maße & Gewicht (Masterbox)', '''Team Lift'' Label (falls > 22,7 kg)', 'Kartons über 50 lbs brauchen ein ''Team Lift'' Label. Max. insgesamt: 100 lbs (45,4 kg).', 'Falls > 22,7 kg', 'pflicht', 8),
(NULL, 'master', 'Maße & Gewicht (Masterbox)', 'Oversize ab 63,5 cm Seitenlänge', 'Ab 63,5 cm (25 Zoll) fällt der Karton in die Oversize-Kategorie mit gesonderten FBA-Gebühren.', 'Ab 63,5 cm → Oversize', 'empfohlen', 9),
(NULL, 'master', 'Maße & Gewicht (Masterbox)', 'Speditionsware ab 31,5 kg', 'Ab 31,5 kg gilt der Karton als Speditionsware – es gelten gesonderte Regeln und Gebühren.', 'Max. 31,5 kg', 'pflicht', 10),
(NULL, 'master', 'Maße & Gewicht (Masterbox)', 'Stabiler Karton (min. ECT 32)', 'Der Karton muss stabil genug sein, um gestapelt zu werden. Amazon empfiehlt ECT 32 oder 200# Test.', 'ECT 32 / 200# Test', 'empfohlen', 11),
-- ── Verpackungs-Anforderungen ── 4 Punkte
(NULL, 'master', 'Verpackungs-Anforderungen', 'Keine losen Produkte im Karton', 'Produkte dürfen sich im Karton nicht frei bewegen. Polstermaterial verwenden.', 'Pflicht', 'pflicht', 12),
(NULL, 'master', 'Verpackungs-Anforderungen', 'Keine Styropor-Chips', 'Amazon verbietet lose Styropor-Flocken als Füllmaterial. Luftpolster oder Papier nutzen.', 'Verboten', 'pflicht', 13),
(NULL, 'master', 'Verpackungs-Anforderungen', 'Stückzahl stimmt mit Sendungsplan überein', 'Die Anzahl der Einheiten pro Karton muss exakt mit dem Sendungsplan übereinstimmen.', 'Exakte Übereinstimmung', 'pflicht', 14),
(NULL, 'master', 'Verpackungs-Anforderungen', 'Keine Umreifungsbänder/Schnüre', 'Amazon verbietet Umreifungsbänder, Schnüre und Metallklammern am Versandkarton.', 'Verboten', 'pflicht', 15);
