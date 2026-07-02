-- Migration 093: Brand-Recherche — Social-Status-Felder (2026-07-02)
-- Additiv: neue Status-Spalten fuer .shop-Domain, TikTok, Instagram.
-- domain_com_status (Migr. 060) bleibt bewusst als deprecated/ungenutzte Spalte
--   erhalten — kein Table-Rebuild, um SQLite-Rebuild-Risiko zu vermeiden.
-- WICHTIG: Kein FK-Pragma setzen (zentral in migrate.ts). Auto-Backup via migrate.ts.
-- Hinweis: urspruenglich als 092 geplant; umbenannt auf 093, da 092 bereits von
--   Migration 092_receipts_contract_id.sql (paralleler Quick-Task quick-260702-vz7,
--   noch uncommitted) belegt war — Naming-Conflict-Resolution analog Phase 04.

ALTER TABLE amazon_brand_name_candidates
  ADD COLUMN domain_shop_status TEXT
  CHECK (domain_shop_status IS NULL OR domain_shop_status IN ('frei','belegt','unklar'));

ALTER TABLE amazon_brand_name_candidates
  ADD COLUMN tiktok_status TEXT
  CHECK (tiktok_status IS NULL OR tiktok_status IN ('frei','belegt','unklar'));

ALTER TABLE amazon_brand_name_candidates
  ADD COLUMN instagram_status TEXT
  CHECK (instagram_status IS NULL OR instagram_status IN ('frei','belegt','unklar'));
