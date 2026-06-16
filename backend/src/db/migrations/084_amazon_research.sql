-- Recherche & Wissen: Themen-Blöcke pro Produkt mit Kombi-Karten
CREATE TABLE amazon_research_topics (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL REFERENCES amazon_products(id),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  title       TEXT    NOT NULL DEFAULT '',
  is_expanded INTEGER NOT NULL DEFAULT 1,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE amazon_research_cards (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id    INTEGER NOT NULL REFERENCES amazon_research_topics(id),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  title       TEXT,
  body        TEXT    NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE amazon_research_card_links (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id     INTEGER NOT NULL REFERENCES amazon_research_cards(id),
  sort_order  INTEGER NOT NULL DEFAULT 0,
  url         TEXT    NOT NULL,
  label       TEXT,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE amazon_research_card_images (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id       INTEGER NOT NULL REFERENCES amazon_research_cards(id),
  sort_order    INTEGER NOT NULL DEFAULT 0,
  file_path     TEXT    NOT NULL,
  original_name TEXT,
  mime          TEXT,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX idx_research_topics_product ON amazon_research_topics(product_id);
CREATE INDEX idx_research_cards_topic ON amazon_research_cards(topic_id);
CREATE INDEX idx_research_card_links_card ON amazon_research_card_links(card_id);
CREATE INDEX idx_research_card_images_card ON amazon_research_card_images(card_id);
