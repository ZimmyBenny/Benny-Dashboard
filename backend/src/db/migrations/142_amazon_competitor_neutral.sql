-- "Neutral"-Feld je Mitbewerber (neutrale Fakten wie Kartonstärke, Maße …). Additiv.
ALTER TABLE amazon_competitors ADD COLUMN neutral TEXT NOT NULL DEFAULT '';
