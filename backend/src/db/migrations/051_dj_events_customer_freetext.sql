-- Migration 051: dj_events.customer_freetext (User-Decision 2026-05-27)
-- Notiz-Feld fuer Kundendaten wenn (noch) kein Kontakt-Datensatz angelegt ist.
-- Zeigt sich als Fallback in der "Kunde"-Spalte der Anfragen/Events-Tabelle.
--
-- WICHTIG: Kein FK-Pragma setzen — wird zentral in migrate.ts gesteuert
-- WICHTIG: Auto-Backup laeuft via migrate.ts vor Anwendung

ALTER TABLE dj_events ADD COLUMN customer_freetext TEXT;

-- Backfill: extrahiere bestehende "Kundendaten: ..."-Zeilen aus notes
-- Pattern: "Kundendaten: <wert>\n\n<rest>" oder nur "Kundendaten: <wert>"
-- SQLite hat keine Regex-Replace, daher SUBSTR/INSTR mit dem Prefix.
UPDATE dj_events
SET customer_freetext = TRIM(
  SUBSTR(
    notes,
    INSTR(notes, 'Kundendaten: ') + LENGTH('Kundendaten: '),
    CASE
      WHEN INSTR(SUBSTR(notes, INSTR(notes, 'Kundendaten: ')), char(10)) > 0
        THEN INSTR(SUBSTR(notes, INSTR(notes, 'Kundendaten: ')), char(10)) - LENGTH('Kundendaten: ') - 1
      ELSE LENGTH(notes) - INSTR(notes, 'Kundendaten: ') - LENGTH('Kundendaten: ') + 1
    END
  )
)
WHERE customer_id IS NULL
  AND notes IS NOT NULL
  AND INSTR(notes, 'Kundendaten: ') > 0;
