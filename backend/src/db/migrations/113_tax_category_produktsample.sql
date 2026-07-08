-- Migration 113: Steuerkategorie „Produktsample" ergaenzen (2026-07-08)
-- Sortiert direkt nach „Wareneinkauf" (sort_order 30) → 35. Idempotent (INSERT OR IGNORE
-- ueber die UNIQUE-Spalten name/slug), damit die Migration auf einer DB mit bereits
-- vorhandener Kategorie nicht scheitert.
INSERT OR IGNORE INTO tax_categories (name, slug, kind, default_vat_rate, default_input_tax_deductible, sort_order)
VALUES ('Produktsample', 'produktsample', 'ausgabe', 19, 1, 35);
