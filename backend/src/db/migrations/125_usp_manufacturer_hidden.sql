-- USP-Hersteller aus-/einblenden: reines Ansichts-Flag pro USP-Hersteller-Zeile.
-- hidden = 1 blendet den Hersteller in Vergleichsmatrix + Export-Dropdowns aus.
-- Der Hersteller bleibt im grossen Hersteller-Bereich unveraendert bestehen.
ALTER TABLE amazon_usp_manufacturers ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0;
