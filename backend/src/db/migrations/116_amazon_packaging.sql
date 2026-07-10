-- „Verpackung & Versand": FBA-Verpackungs-Cockpit (Singlebox/Masterbox-Masse, Checklisten,
-- GPSR, Designer-Briefing). Rein additiv, KEIN PRAGMA foreign_keys (migrate.ts steuert
-- zentral), kein Rebuild bestehender Tabellen. Seed idempotent via partiellem UNIQUE INDEX
-- (box_type, name) WHERE product_id IS NULL — INSERT OR IGNORE ueberspringt vorhandene.

-- 1) amazon_packaging — eine Zeile pro Produkt (Masse, Gewichte, GPSR-Hersteller-Angaben, Notizen).
CREATE TABLE amazon_packaging (
  product_id       INTEGER NOT NULL UNIQUE REFERENCES amazon_products(id) ON DELETE CASCADE,
  single_w REAL, single_h REAL, single_d REAL,
  single_weight_kg REAL,
  master_w REAL, master_h REAL, master_d REAL,
  units_per_master INTEGER,
  master_tare_kg   REAL,
  order_qty        INTEGER,
  single_final     INTEGER NOT NULL DEFAULT 0,
  master_final     INTEGER NOT NULL DEFAULT 0,
  mfr_name         TEXT,
  mfr_address      TEXT,
  mfr_contact      TEXT,
  notes            TEXT    NOT NULL DEFAULT '',
  created_at       INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at       INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 2) amazon_packaging_check_items — Standard-Katalog (product_id IS NULL) + eigene Punkte je Produkt.
CREATE TABLE amazon_packaging_check_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER REFERENCES amazon_products(id) ON DELETE CASCADE, -- NULL = Standard-Katalog (gilt für alle)
  box_type    TEXT NOT NULL CHECK (box_type IN ('single','master')),
  category    TEXT NOT NULL,
  name        TEXT NOT NULL,
  description TEXT,
  requirement TEXT,
  severity    TEXT NOT NULL CHECK (severity IN ('pflicht','empfohlen','optional')),
  sort_order  INTEGER NOT NULL DEFAULT 0
);
-- Idempotenz-Anker für den Standard-Katalog: (box_type, name) eindeutig NUR für Standardpunkte.
CREATE UNIQUE INDEX idx_pkg_std_unique ON amazon_packaging_check_items(box_type, name) WHERE product_id IS NULL;
CREATE INDEX idx_pkg_items_product ON amazon_packaging_check_items(product_id, box_type, sort_order);

-- 3) amazon_packaging_check_status — Status pro Produkt × Punkt; keine Zeile = offen.
CREATE TABLE amazon_packaging_check_status (
  product_id INTEGER NOT NULL REFERENCES amazon_products(id) ON DELETE CASCADE,
  item_id    INTEGER NOT NULL REFERENCES amazon_packaging_check_items(id) ON DELETE CASCADE,
  status     TEXT NOT NULL CHECK (status IN ('erledigt','nicht_zutreffend')),
  PRIMARY KEY (product_id, item_id)
);

-- ════════════════════════════════════════════════════════════════════════════
-- Seed — Standard-Katalog (product_id = NULL), idempotent via INSERT OR IGNORE.
-- SINGLEBOX (box_type='single', 40 Punkte, 7 Kategorien, sort_order = Nr 1..40).
-- ════════════════════════════════════════════════════════════════════════════

INSERT OR IGNORE INTO amazon_packaging_check_items (product_id, box_type, category, name, description, requirement, severity, sort_order) VALUES
-- Kategorie „EAN / Barcode" (6 Punkte)
(NULL, 'single', 'EAN / Barcode', 'EAN-Barcode vorhanden', 'Jede Einheit muss einen scanbaren EAN-Barcode tragen.', 'Pflicht', 'pflicht', 1),
(NULL, 'single', 'EAN / Barcode', 'Barcode Mindestgröße: 2,5 x 1,0 cm', 'Der EAN-Barcode muss mindestens 1 Zoll breit x 0,4 Zoll hoch sein (ca. 2,5 x 1,0 cm).', 'Min. 2,5 cm x 1,0 cm', 'pflicht', 2),
(NULL, 'single', 'EAN / Barcode', 'Barcode auf flacher Oberfläche', 'Der Barcode darf nicht über Kanten oder Nähte geklebt werden.', 'Flache, glatte Fläche', 'pflicht', 3),
(NULL, 'single', 'EAN / Barcode', 'Barcode scanbar (kein Überdruck)', 'Der Barcode muss mit einem Handscanner lesbar sein. Keine Folie oder Schrumpfung darüber.', '100% scanbar', 'pflicht', 4),
(NULL, 'single', 'EAN / Barcode', 'Nur ein scanbarer Barcode sichtbar', 'Es darf nur ein scanbarer Barcode (EAN) auf der Verpackung sichtbar sein. Weitere Codes müssen abgedeckt oder entfernt werden.', 'Nur 1 scanbarer Code', 'pflicht', 5),
(NULL, 'single', 'EAN / Barcode', 'Quiet Zone um Barcode eingehalten', 'Mindestens 2,5 mm freier Raum (weiß) um den Barcode herum. Keine Grafiken, Texte oder Kanten im Bereich.', 'Min. 2,5 mm Rand', 'pflicht', 6),
-- Kategorie „Pflicht-Kennzeichnungen" (6 Punkte)
(NULL, 'single', 'Pflicht-Kennzeichnungen', 'CE-Kennzeichnung (falls EU-pflichtig)', 'Produkte, die unter EU-Richtlinien fallen, benötigen das CE-Zeichen (min. 5 mm Höhe). Proportionen müssen dem offiziellen Muster entsprechen.', 'Min. 5 mm Höhe', 'pflicht', 7),
(NULL, 'single', 'Pflicht-Kennzeichnungen', 'Herkunftsland (Made in ...)', 'Empfohlen, aber in Deutschland keine gesetzliche Pflicht auf der Verpackung. Kann freiwillig angegeben werden (z.B. ''Made in China'').', 'Falls zutreffend', 'empfohlen', 8),
(NULL, 'single', 'Pflicht-Kennzeichnungen', 'Erstickungswarnung (Suffocation Warning)', 'Pflicht für Polybeutel mit Öffnung > 12,7 cm. Text in der Sprache des Zielmarktes.', 'Wenn Polybeutel > 5 Zoll', 'pflicht', 9),
(NULL, 'single', 'Pflicht-Kennzeichnungen', 'Alterswarnung (falls Spielzeug)', 'Spielzeug mit Kleinteilen: ''Nicht für Kinder unter 3 Jahren'' mit Symbol.', 'Falls zutreffend', 'empfohlen', 10),
(NULL, 'single', 'Pflicht-Kennzeichnungen', 'Materialzusammensetzung (falls Textil)', 'Textilprodukte brauchen Angaben zur Faserzusammensetzung gemäß TextilKennzG (z.B. ''100% Baumwolle'').', 'Falls zutreffend', 'empfohlen', 11),
(NULL, 'single', 'Pflicht-Kennzeichnungen', 'Batterie-/Akku-Hinweis (falls zutreffend)', 'Produkte mit Lithium-Batterien brauchen entsprechende Warn- und Transporthinweise sowie UN38.3-Zertifikat.', 'Falls zutreffend', 'empfohlen', 12),
-- Kategorie „EU-Regulatorien & Gesetze" (8 Punkte)
(NULL, 'single', 'EU-Regulatorien & Gesetze', 'REACH-Konformität geprüft', 'EU-Chemikalienverordnung: Produkt enthält keine verbotenen Stoffe (z.B. Blei, Cadmium, Phthalate über Grenzwert). REACH-Zertifikat vom Hersteller anfordern.', 'EU-Pflicht', 'pflicht', 13),
(NULL, 'single', 'EU-Regulatorien & Gesetze', 'RoHS-Konformität (falls Elektronik)', 'Richtlinie zur Beschränkung gefährlicher Stoffe in Elektro-/Elektronikgeräten. Betrifft alle Produkte mit elektronischen Komponenten.', 'Falls Elektronik', 'pflicht', 14),
(NULL, 'single', 'EU-Regulatorien & Gesetze', 'WEEE-Kennzeichnung (Mülltonne-Symbol)', 'Elektrogeräte müssen das durchgestrichene Mülltonne-Symbol tragen und bei der Stiftung EAR registriert sein (ElektroG).', 'Falls Elektronik', 'pflicht', 15),
(NULL, 'single', 'EU-Regulatorien & Gesetze', 'WEEE-Registrierung bei Stiftung EAR', 'WEEE-Registrierungsnummer muss vor dem Verkauf vorliegen. Ohne Registrierung drohen Abmahnungen und Verkaufsverbote.', 'Vor Verkaufsstart', 'pflicht', 16),
(NULL, 'single', 'EU-Regulatorien & Gesetze', 'Verpackungsgesetz (VerpackG) – LUCID-Registrierung', 'Alle Verpackungen müssen im LUCID-Register angemeldet und bei einem dualen System lizenziert sein (z.B. Grüner Punkt, Interseroh).', 'Pflicht in DE', 'pflicht', 17),
(NULL, 'single', 'EU-Regulatorien & Gesetze', 'Produktsicherheitsgesetz (ProdSG) – Herstellerangaben', 'Name und Kontaktadresse des verantwortlichen Wirtschaftsakteurs müssen auf der Verpackung stehen (EU-Marktüberwachungsverordnung 2019/1020).', 'EU-Pflicht', 'pflicht', 18),
(NULL, 'single', 'EU-Regulatorien & Gesetze', 'EU Responsible Person angegeben', 'Seit Juli 2021 muss ein in der EU ansässiger Verantwortlicher mit Adresse auf dem Produkt/Verpackung stehen.', 'EU-Pflicht ab 2021', 'pflicht', 19),
(NULL, 'single', 'EU-Regulatorien & Gesetze', 'GPSR-Konformität (ab 13.12.2024)', 'General Product Safety Regulation: Erweiterte Anforderungen an Risikobewertung, Rückverfolgbarkeit und Kontaktdaten auf der Verpackung.', 'EU-Pflicht ab 12/2024', 'pflicht', 20),
-- Kategorie „Warnsymbole & Sicherheitshinweise" (6 Punkte)
(NULL, 'single', 'Warnsymbole & Sicherheitshinweise', 'GHS-Symbole (falls Chemikalien/Reiniger)', 'Gefahrstoffkennzeichnung nach CLP-Verordnung: Gefahrenpiktogramme, H-Sätze und P-Sätze auf der Verpackung.', 'Falls zutreffend', 'pflicht', 21),
(NULL, 'single', 'Warnsymbole & Sicherheitshinweise', 'Prop 65 Warnung (falls USA-Verkauf)', 'Kalifornische Proposition 65: Warnhinweis für Produkte mit krebserregenden oder reproduktionstoxischen Stoffen.', 'Falls US-Markt', 'empfohlen', 22),
(NULL, 'single', 'Warnsymbole & Sicherheitshinweise', 'Lebensmittelkontakt-Symbol (Glas & Gabel)', 'Produkte mit Lebensmittelkontakt (Geschirr, Behälter) brauchen das Glas-und-Gabel-Symbol und müssen EU 1935/2004 konform sein.', 'Falls zutreffend', 'pflicht', 23),
(NULL, 'single', 'Warnsymbole & Sicherheitshinweise', 'Recycling-/Entsorgungssymbole', 'Materialidentifikation (z.B. PAP, PP, PE) und ggf. Recycling-Codes auf der Verpackung. Erleichtert korrekte Entsorgung.', 'Empfohlen', 'empfohlen', 24),
(NULL, 'single', 'Warnsymbole & Sicherheitshinweise', 'Entflammbarkeitshinweis (falls zutreffend)', 'Textilien, Kerzen, Anzünder etc. benötigen ggf. Hinweise zur Entflammbarkeit und Brandschutz.', 'Falls zutreffend', 'empfohlen', 25),
(NULL, 'single', 'Warnsymbole & Sicherheitshinweise', 'Handhabungssymbole (Fragile, Keep Dry)', 'Zerbrechliche oder feuchtigkeitsempfindliche Produkte sollten entsprechende ISO-Handhabungssymbole tragen.', 'Empfohlen', 'empfohlen', 26),
-- Kategorie „Verpackungsqualität & Schutz" (6 Punkte)
(NULL, 'single', 'Verpackungsqualität & Schutz', 'Polybeutel min. 1,5 mil Dicke', 'Falls in einem Polybeutel verpackt, muss die Folie mindestens 1,5 mil (0,038 mm) dick sein.', 'Min. 1,5 mil', 'pflicht', 27),
(NULL, 'single', 'Verpackungsqualität & Schutz', 'Produkt ausreichend geschützt', 'Produkt darf beim Versand nicht beschädigt werden. Ggf. Schaumstoff-Einleger, Luftpolster oder Formteile verwenden.', 'Pflicht', 'pflicht', 28),
(NULL, 'single', 'Verpackungsqualität & Schutz', 'Frustfreie Verpackung (FFP) geprüft', 'Amazon bevorzugt ''Frustration-Free Packaging''. Produkt muss ohne zusätzliche Amazon-Verpackung versendbar sein (Tier 1/2/3).', 'Empfohlen', 'empfohlen', 29),
(NULL, 'single', 'Verpackungsqualität & Schutz', 'Ablaufdatum (falls verderblich)', 'Verderbliche Produkte (Kosmetik, Nahrungsergänzung) müssen ein Mindesthaltbarkeitsdatum in MM/JJJJ Format tragen.', 'Falls zutreffend', 'pflicht', 30),
(NULL, 'single', 'Verpackungsqualität & Schutz', 'Chargennummer / LOT-Nummer', 'Für Rückverfolgbarkeit bei Kosmetik, Lebensmitteln und Medizinprodukten ist eine Chargennummer auf der Verpackung Pflicht.', 'Falls zutreffend', 'empfohlen', 31),
(NULL, 'single', 'Verpackungsqualität & Schutz', 'Manipulationsschutz (Tamper-Evident)', 'Produkte die geöffnet werden können (Nahrungsergänzung, Kosmetik) sollten einen Erstöffnungsschutz (Siegel, Shrink-Band) haben.', 'Empfohlen', 'empfohlen', 32),
-- Kategorie „Maße & Gewicht" (3 Punkte)
(NULL, 'single', 'Maße & Gewicht', 'Standard-Size Limits eingehalten', 'Standard: Max. 45,72 x 35,56 x 20,32 cm (18 x 14 x 8 Zoll) und max. 9,07 kg (20 lbs).', 'Max. 45,7 x 35,6 x 20,3 cm', 'pflicht', 33),
(NULL, 'single', 'Maße & Gewicht', 'Gewichtslimit eingehalten', 'Standard-Size: Max. 9,07 kg. Oversize: Max. 68 kg. Darüber: Special Oversize.', 'Standard <= 9,07 kg', 'pflicht', 34),
(NULL, 'single', 'Maße & Gewicht', 'Maße exakt auf Listing abgestimmt', 'Die realen Verpackungsmaße müssen mit den im Amazon-Listing hinterlegten Maßen übereinstimmen, um Gebührendifferenzen zu vermeiden.', 'Exakte Angabe', 'pflicht', 35),
-- Kategorie „Label-Design & Markenpräsentation" (5 Punkte)
(NULL, 'single', 'Label-Design & Markenpräsentation', 'Markenname gut sichtbar auf Verpackung', 'Der Markenname muss prominent auf der Verpackung erscheinen – idealerweise auf der Vorderseite. Stärkt Brand Recognition.', 'Empfohlen', 'empfohlen', 36),
(NULL, 'single', 'Label-Design & Markenpräsentation', 'Verpackung stimmt mit Listing-Bildern überein', 'Die reale Verpackung muss den Bildern im Amazon-Listing entsprechen. Abweichungen führen zu Retouren und negativen Bewertungen.', 'Pflicht', 'pflicht', 37),
(NULL, 'single', 'Label-Design & Markenpräsentation', 'Mehrsprachige Beschriftung (falls EU-weit)', 'Bei Pan-EU-Verkauf: Pflichtangaben in allen Zielsprachen (DE, FR, IT, ES, NL etc.) auf der Verpackung oder als Beileger.', 'Falls Pan-EU', 'pflicht', 38),
(NULL, 'single', 'Label-Design & Markenpräsentation', 'Insert Card / Beileger (falls gewünscht)', 'Produktbeileger für Anleitung, Garantiekarte oder Markenbindung. Achtung: Keine Aufforderung zu positiven Bewertungen (Amazon TOS-Verstoß!).', 'Optional', 'optional', 39),
(NULL, 'single', 'Label-Design & Markenpräsentation', 'QR-Code für Registrierung/Garantie', 'QR-Code auf Verpackung oder Insert Card für Produktregistrierung, Garantieaktivierung oder Anleitungsvideo. Erlaubt laut Amazon TOS.', 'Optional', 'optional', 40);

-- ════════════════════════════════════════════════════════════════════════════
-- MASTERBOX (box_type='master', Kategorie „Masterbox / Versandkarton", 8 Punkte, sort_order 1..8).
-- ════════════════════════════════════════════════════════════════════════════

INSERT OR IGNORE INTO amazon_packaging_check_items (product_id, box_type, category, name, description, requirement, severity, sort_order) VALUES
(NULL, 'master', 'Masterbox / Versandkarton', 'Versandetikett außen gut sichtbar', 'FBA-Versandetikett (und ggf. Lieferanten-Label) auf der Außenseite, nicht auf Nähten/Kanten.', 'Außen, flach', 'pflicht', 1),
(NULL, 'master', 'Masterbox / Versandkarton', 'Kartongewicht max. 23 kg', 'FBA-Karton darf 23 kg nicht überschreiten; ab 15 kg zusätzlich Schwergewichts-Hinweis anbringen.', 'Max. 23 kg', 'pflicht', 2),
(NULL, 'master', 'Masterbox / Versandkarton', 'Keine Kantenlänge über 63,5 cm', 'Keine Kartonseite darf 63,5 cm überschreiten (außer Einzelartikel ist größer).', 'Max. 63,5 cm', 'pflicht', 3),
(NULL, 'master', 'Masterbox / Versandkarton', 'Alte Barcodes/Etiketten entfernt', 'Gebrauchte Kartons: alle alten Versand-Barcodes und Etiketten entfernen oder überkleben.', 'Keine Alt-Codes', 'pflicht', 4),
(NULL, 'master', 'Masterbox / Versandkarton', 'Karton-Nummerierung (Karton X von Y)', 'Bei mehreren Kartons pro Lieferung: fortlaufende Nummerierung erleichtert Wareneingang.', 'Empfohlen', 'empfohlen', 5),
(NULL, 'master', 'Masterbox / Versandkarton', 'Stabiler doppelwelliger Karton', 'Ausreichende Kartonqualität für Stapelung und Transport (doppelwellig empfohlen).', 'Doppelwellig', 'empfohlen', 6),
(NULL, 'master', 'Masterbox / Versandkarton', 'Füllmaterial gegen Verrutschen', 'Inhalt darf im Karton nicht verrutschen; Hohlräume mit Füllmaterial ausfüllen.', 'Kein Spielraum', 'pflicht', 7),
(NULL, 'master', 'Masterbox / Versandkarton', 'Keine Umreifungsbänder/Schnüre', 'Amazon verbietet Umreifungsbänder, Schnüre und Metallklammern am Versandkarton.', 'Verboten', 'pflicht', 8);
