-- Migration 035: Default-Textbausteine für DJ-Angebote
-- Legt leere Default-Einträge für Kopf- und Fußtext an (INSERT OR IGNORE)
INSERT OR IGNORE INTO dj_settings (key, value) VALUES
  ('default_header_text', '""'),
  ('default_footer_text', '""');
