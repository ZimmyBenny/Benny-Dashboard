-- Migration 037: Du/Sie-Textbausteine + anrede_form auf dj_quotes

-- Neue Default-Textbausteine für Du- und Sie-Form
INSERT OR IGNORE INTO dj_settings (key, value) VALUES ('default_header_text_du', '""');
INSERT OR IGNORE INTO dj_settings (key, value) VALUES ('default_footer_text_du', '""');
INSERT OR IGNORE INTO dj_settings (key, value) VALUES ('default_header_text_sie', '""');
INSERT OR IGNORE INTO dj_settings (key, value) VALUES ('default_footer_text_sie', '""');

-- Anrede-Form auf Angeboten speichern
ALTER TABLE dj_quotes ADD COLUMN anrede_form TEXT DEFAULT 'du';
