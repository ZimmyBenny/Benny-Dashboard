CREATE TABLE amazon_manufacturer_settings (
  product_id   INTEGER PRIMARY KEY REFERENCES amazon_products(id),
  usd_eur_rate TEXT,
  updated_at   INTEGER NOT NULL DEFAULT (unixepoch())
);
