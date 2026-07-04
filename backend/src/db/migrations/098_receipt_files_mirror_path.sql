-- Migration 098: receipt_files.mirror_path — Belege-Finder-Spiegel Tracking (2026-07-04)
-- Additiv: reine Tracking-Spalte fuer den zuletzt gespiegelten relativen Pfad
-- im Finder-Spiegel (siehe lib/belegeMirror.ts). Kein PRAGMA foreign_keys
-- (zentral in migrate.ts gesteuert).
ALTER TABLE receipt_files ADD COLUMN mirror_path TEXT NULL;
