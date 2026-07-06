-- Migration 108: Vertrags-Reminder nur EINMAL pro Frist (2026-07-06)
-- last_reminded_for merkt das zuletzt erinnerte Fristdatum je Vertrag. Damit erzeugt der
-- Reminder-Job eine vom Nutzer geloeschte Kuendigungs-Aufgabe NICHT bei jedem Lauf neu
-- (er erinnert genau einmal pro Frist). Reine ADD COLUMN, kein Rebuild, kein PRAGMA foreign_keys.
ALTER TABLE contracts_and_deadlines ADD COLUMN last_reminded_for TEXT;
