-- Migration 036: document_type Feld für dj_quotes (GoBD-Vorbereitung Dokumenttypen)
-- Mögliche Werte: 'angebot', 'rechnung', 'lieferschein', 'auftragsbestaetigung'
ALTER TABLE dj_quotes ADD COLUMN document_type TEXT NOT NULL DEFAULT 'angebot';
