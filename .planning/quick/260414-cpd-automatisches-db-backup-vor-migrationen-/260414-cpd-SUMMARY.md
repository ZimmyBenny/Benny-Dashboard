# Quick Task 260414-cpd: Summary

**Task:** Automatisches DB-Backup vor Migrationen in migrate.ts
**Date:** 2026-04-14
**Commit:** 6edfe32

## Was getan wurde

Vor jeder Migrationsrunde mit ausstehenden Migrationen wird die Datenbank automatisch gesichert.
Backup-Pfad: ~/.local/share/benny-dashboard/backups/pre-migration-{timestamp}.db

- Backup laeuft NUR wenn es neue Migrationen gibt (pending.length > 0)
- Backup-Fehler blockieren den Start nicht — nur WARN-Log
- Backup-Ordner wird automatisch angelegt

## Geaenderte Dateien

- backend/src/db/migrate.ts: import os + Backup-Block vor dem PRAGMA + Loop
