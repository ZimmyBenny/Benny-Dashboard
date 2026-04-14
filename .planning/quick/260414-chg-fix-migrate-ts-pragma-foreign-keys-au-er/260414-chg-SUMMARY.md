# Quick Task 260414-chg: Summary

**Task:** Fix migrate.ts PRAGMA foreign_keys ausserhalb Transaktion
**Date:** 2026-04-14
**Commit:** 65d0801

## Was getan wurde

SQLite ignoriert PRAGMA foreign_keys innerhalb einer laufenden Transaktion stillschweigend. Da migrate.ts jede Migration in db.transaction() ausfuehrt, waren die PRAGMA-Zeilen in Migrations 012 und 021 wirkungslos. Dies verursachte bei DROP TABLE Migrationen unbeabsichtigte ON DELETE CASCADE Ausloesungen.

## Geaenderte Dateien

- backend/src/db/migrate.ts: db.pragma('foreign_keys = OFF') vor dem Loop, db.pragma('foreign_keys = ON') danach
- backend/src/db/migrations/012_tasks_archived_status.sql: PRAGMA-Zeilen entfernt
- backend/src/db/migrations/021_contracts_add_aktion_banken.sql: PRAGMA-Zeilen entfernt

## Root Cause

Benutzer verlor Vertrags-Anhaenge (DB-Eintraege) nach Migration 021. Dateien waren noch auf Disk. Anhaenge manuell aus Backup wiederhergestellt. Dieser Fix verhindert gleichartige Datenverluste bei zukuenftigen Rebuild-Migrationen.
