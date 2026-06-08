ALTER TABLE amazon_manufacturer_offers
  ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD' CHECK (currency IN ('USD','EUR'));
ALTER TABLE amazon_manufacturer_offers
  ADD COLUMN is_latest INTEGER NOT NULL DEFAULT 0 CHECK (is_latest IN (0,1));
