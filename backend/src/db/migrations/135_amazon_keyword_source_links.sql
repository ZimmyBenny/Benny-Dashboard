-- Helium-10-Import: welcher Konkurrent (Quelle-ASIN) rankt für welches Keyword.
-- Abdeckung eines Keywords = Anzahl seiner Links. Additiv, kein Rebuild, kein PRAGMA.
CREATE TABLE IF NOT EXISTS amazon_keyword_source_links (
  keyword_id INTEGER NOT NULL REFERENCES amazon_keywords(id) ON DELETE CASCADE,
  source_id  INTEGER NOT NULL REFERENCES amazon_keyword_sources(id) ON DELETE CASCADE,
  PRIMARY KEY (keyword_id, source_id)
);
CREATE INDEX IF NOT EXISTS ix_aks_links_source ON amazon_keyword_source_links(source_id);
