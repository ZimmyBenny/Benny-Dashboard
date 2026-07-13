-- Text-Varianten je Design-&-Druck-Topic (Beileger etc.). Additiv, keine Kind-Tabellen,
-- kein Rebuild → unkritisch. KEIN PRAGMA foreign_keys (migrate.ts steuert zentral).
CREATE TABLE amazon_product_doc_text_variants (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id    INTEGER NOT NULL REFERENCES amazon_product_doc_topics(id) ON DELETE CASCADE,
  text        TEXT    NOT NULL DEFAULT '',
  is_favorite INTEGER NOT NULL DEFAULT 0,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX idx_apdtv_topic ON amazon_product_doc_text_variants(topic_id, sort_order);
