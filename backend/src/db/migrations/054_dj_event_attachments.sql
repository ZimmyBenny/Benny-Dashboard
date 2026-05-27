-- Migration 054: dj_event_attachments (User-Decision 2026-05-27)
-- Dateianhaenge (E-Mail-Exports, PDFs, Bilder, etc.) pro DJ-Event.
-- Wenn das Event einen customer_id hat, werden die Anhaenge ueber JOIN auch
-- beim Kontakt sichtbar (kein dediziertes contact_id im Anhang noetig).
--
-- WICHTIG: Kein FK-Pragma setzen — wird zentral in migrate.ts gesteuert
-- WICHTIG: Auto-Backup laeuft via migrate.ts vor Anwendung

CREATE TABLE IF NOT EXISTS dj_event_attachments (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id        INTEGER NOT NULL REFERENCES dj_events(id) ON DELETE CASCADE,
    file_path       TEXT NOT NULL,         -- relativer Pfad unter STORAGE_DIR
    original_name   TEXT NOT NULL,         -- Original-Dateiname vom Upload
    mime_type       TEXT,
    size_bytes      INTEGER,
    label           TEXT,                  -- optionale User-Beschreibung
    uploaded_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_dj_event_attachments_event ON dj_event_attachments(event_id);
