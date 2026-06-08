ALTER TABLE amazon_usp_manufacturers
  ADD COLUMN manufacturer_id INTEGER REFERENCES amazon_manufacturers(id);
