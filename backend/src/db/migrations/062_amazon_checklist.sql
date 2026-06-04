-- Migration 062: Amazon Checkliste — Master + Produkt-Kopien (2026-06-04)
-- WICHTIG: Kein FK-Pragma setzen
-- WICHTIG: Auto-Backup laeuft via migrate.ts

CREATE TABLE amazon_checklist_master_sections (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  title       TEXT    NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE amazon_checklist_master_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id  INTEGER NOT NULL
              REFERENCES amazon_checklist_master_sections(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  description TEXT    NOT NULL,
  remark      TEXT,
  link_url    TEXT,
  link_label  TEXT,
  is_done     INTEGER NOT NULL DEFAULT 0 CHECK (is_done IN (0,1)),
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX amazon_checklist_master_items_section_idx
  ON amazon_checklist_master_items (section_id, sort_order, id);

CREATE TABLE amazon_checklist_product_sections (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL
              REFERENCES amazon_products(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  title       TEXT    NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX amazon_checklist_product_sections_product_idx
  ON amazon_checklist_product_sections (product_id, sort_order, id);

CREATE TABLE amazon_checklist_product_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id  INTEGER NOT NULL
              REFERENCES amazon_checklist_product_sections(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  description TEXT    NOT NULL,
  remark      TEXT,
  link_url    TEXT,
  link_label  TEXT,
  is_done     INTEGER NOT NULL DEFAULT 0 CHECK (is_done IN (0,1)),
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX amazon_checklist_product_items_section_idx
  ON amazon_checklist_product_items (section_id, sort_order, id);

-- ── Seed-Daten: 5 Master-Sections + 66 Items ─────────────────────────────────

INSERT INTO amazon_checklist_master_sections (id, sort_order, title) VALUES
  (1, 1, 'Gründung und einmalige Aufgaben'),
  (2, 2, 'Produktsuche'),
  (3, 3, 'Produkteinkauf'),
  (4, 4, 'Amazon Listing erstellen'),
  (5, 5, 'Bei Verkäufen außerhalb der EU');

INSERT INTO amazon_checklist_master_items (section_id, sort_order, description, remark) VALUES
  (1,  1, 'Erlaubnis Arbeitgeber', 'Kann ein Kündigungsgrund sein'),
  (1,  2, 'Elster Registrierung', 'Mit ElsterSecureApp'),
  (1,  3, 'Gewerbeanmeldung durchführen', 'Bei der Stadt'),
  (1,  4, 'Steuerlichen Erfassungsbogen einreichen (nach Gewerbebescheinigung)', 'Innerhalb von 4 Wochen mit Elster'),
  (1,  5, 'Steuernummer und Umsatzsteuer-ID beantragen', 'Mit Steuerlichem Erfassungsbogen'),
  (1,  6, 'Sozialversicherung anmelden/informieren', 'Über Arbeitgeber/Selbstständigkeit'),
  (1,  7, 'Anmeldung bei der Berufsgenossenschaft', 'Innerhalb einer Woche'),
  (1,  8, 'EORI Nummer beantragen', 'Beim Zoll'),
  (1,  9, 'Geschäftskonto eröffnen mit Kreditkarte', 'Online (N26 Bank/gebührenfrei.com)'),
  (1, 10, 'Registrierung Buchhaltungssoftware', 'Lexware Office (Innerhalb von DE empfohlen)'),
  (1, 11, 'Steuerberater finden (mit E-Commerce Expertise)', 'DHW in Oberhausen'),
  (1, 12, 'Im Amazon Seller Center registrieren', 'Keine Kosten ohne Umsatz'),
  (1, 13, 'Alle Unternehmensangaben bei Amazon hinterlegen (UID, Adresse…)', 'Markenregistrierung geht auch später noch'),
  (1, 14, 'Kreditkarte bei Amazon hinterlegen', 'Kreditkarten und Bankkonto registrieren');

INSERT INTO amazon_checklist_master_items (section_id, sort_order, description, remark) VALUES
  (2,  1, 'Profitables Produkt mit USP suchen (Helium 10)', 'Siehe Produktcheckliste'),
  (2,  2, 'Marge grob berechnen', 'Profitabilitätsrechner Helium10'),
  (2,  3, 'Patent & Designschutz abklären', 'EUIPO eSearch Plus'),
  (2,  4, 'Zertifikate abklären', 'TÜV, QIMA, Travado Compliance'),
  (2,  5, 'Logo designen und Markennamen ausdenken', 'Canva, namelix, TMView, DPMA'),
  (2,  6, 'Samples bestellen', '2-3 Samples bestellen'),
  (2,  7, 'Transportkosten anfragen', 'asia-logistics.de, sam-logistik.de, AGL');

INSERT INTO amazon_checklist_master_items (section_id, sort_order, description, remark, link_url, link_label) VALUES
  (2,  8, 'Zolltarifnummer herausfinden', 'erfrage bei info.gewerblich@zoll.de', 'https://auskunft.ezt-online.de/', 'EZT Online');

INSERT INTO amazon_checklist_master_items (section_id, sort_order, description, remark) VALUES
  (2,  9, 'Marge nochmals kalkulieren', 'Chance/Risiko Rechner'),
  (2, 10, 'Markennamen erstellen & Marke anmelden', 'Beim DPMA oder EUIPO mit Rabatt'),
  (2, 11, 'Domain registrieren', 'checkdomain.de (gluecksberg.com)'),
  (2, 12, 'Mitbewerber Produkte bestellen und vergleichen', 'Danach wieder zurückschicken'),
  (2, 13, 'Für einen Hersteller entscheiden', 'Vorteilhaft über Jingsourcing');

INSERT INTO amazon_checklist_master_items (section_id, sort_order, description, remark) VALUES
  (3,  1, 'PO Agreement erstellen und unterzeichnen lassen', 'Mit ChatGPT'),
  (3,  2, 'Bei GS1 registrieren und EANs kaufen', 'SmartStarter 10 GS1 mit Zertifikat (empfohlen)'),
  (3,  3, 'Barcodes für jede Variante erstellen', 'GS1 GTIN anlegen'),
  (3,  4, 'Verpackungsdesign erstellen (lassen)', 'Packaging Template bei Lieferanten anfragen'),
  (3,  5, 'Flyer ertellen (lassen)', 'Rahad/ChatGPT/Canva'),
  (3,  6, 'Product Etikett/Label (Care Label) erstellen, wenn nötig', 'ChatGPT/Canva'),
  (3,  7, 'QR Codes (pro Variante) für Bewertungen erstellen', 'In der AMZ Ecosystem App (bei Ressourcen)'),
  (3,  8, 'Bewertungskarten ertellen (lassen)', 'Rahad/ChatGPT/Canva'),
  (3,  9, 'Amazon Listing anlegen', 'Amazon Seller Account'),
  (3, 10, 'QR Code mit Bewertunglink hinterlegen', 'In der AMZ Ecosystem App (bei Ressourcen)'),
  (3, 11, 'TÜV Zertifizierung und Labortests durchführen lassen', 'TÜV Süd, TÜV Rheinland, QIMA'),
  (3, 12, 'Masterbox Label (mit heavy weight label) erstellen', 'Word Template'),
  (3, 13, 'Bestellung aufgeben über Alibaba Trade Assurance', 'Alibaba Trade Assurance oder Jingsourcing (sicher)'),
  (3, 14, 'Import organisieren (Invoice, Packliste & ZTN mitsenden)', 'Amazon AGL oder Asia Logistik'),
  (3, 15, 'Transportversicherung abschließen', 'Direkt über AGL oder Allianz, AXA etc'),
  (3, 16, 'Qualitätskontrolle in China organisieren', 'AsiaInspection, Jingsourcing, GQC (Stephan)'),
  (3, 17, 'Transportversicherung abschließen', 'Über AGL'),
  (3, 18, 'Registrierung Verpackungsregister LUCID', 'verpackungsregister.org'),
  (3, 19, 'Verpackungslizenzierung LUCID', 'Usepac/Prezero/DerGrünePunkt (empfohlen)');

INSERT INTO amazon_checklist_master_items (section_id, sort_order, description, remark) VALUES
  (4,  1, 'Produktbilder erstellen', 'KI (Freepik)'),
  (4,  2, 'Keyword Recherche', 'Helium 10 Cerebro und Keyword Prozessor'),
  (4,  3, 'Titel erstellen', '<200 Bytes am besten sogar <80 Bytes'),
  (4,  4, 'Bullet Points erstellen', '200-249 Bytes nicht >249'),
  (4,  5, 'Produktsuche (Backend) Keywords', '<249 Bytes'),
  (4,  6, 'Produktbeschreibung erstellen', '<2000 Bytes'),
  (4,  7, 'AGB, Impressum etc. bei Amazon hinterlegen', 'IT-Rechts-Kanzlei'),
  (4,  8, 'Betriebs- & Produkthaftpflichtversicherung + Rechtschutz abschließen', 'Surein.de'),
  (4,  9, 'eBook erstellen', NULL),
  (4, 10, 'Rechnungssoftware anbinden an Seller Center', 'Billbee (empfohlen mit Rabattlink)'),
  (4, 11, 'Anlieferplan erstellen', NULL),
  (4, 12, 'Sellerboard anbinden', NULL),
  (4, 13, 'Produkt launchen', NULL),
  (4, 14, 'PPC schalten', 'Digital Roar'),
  (4, 15, 'Bewertungsstrategie aufsetzen', NULL),
  (4, 16, 'Vine Kampagne starten oder 3-5 Bewertungen organisieren', NULL),
  (4, 17, 'Werbung optimieren', NULL),
  (4, 18, 'Weitere Verkaufsstrategien einführen (Blitzangebote, Coupons…)', NULL),
  (4, 19, 'Bewertungen analysieren und Produkt bei Nachbestellung verbessern', NULL);

INSERT INTO amazon_checklist_master_items (section_id, sort_order, description, remark) VALUES
  (5, 1, 'Anmeldung OSS (One-Stop-Shop)', 'Nur mit DHW Steuerberater');
