-- Migration 055: 'Kundendaten: ...' aus dj_events.notes entfernen (User-Wunsch 2026-05-28)
-- Migration 051 hatte den Inhalt von 'Kundendaten: ...' in customer_freetext
-- gespiegelt, aber die alte Praefix-Zeile in notes belassen (Datenschutz, kein Verlust).
-- Jetzt: aufräumen. customer_freetext ist seit 051 die Quelle, die Praefix-Zeilen in
-- notes sind redundant und stoeren beim Lesen.
--
-- Drei Patterns werden gestrippt:
--  1) 'Kundendaten: <text>\n\n<rest>' -> '<rest>' (Praefix mit nachfolgender Notiz)
--  2) 'Kundendaten: <text>\n<rest>'   -> '<rest>' (Praefix mit Single-Newline)
--  3) 'Kundendaten: <text>'            -> NULL    (Praefix war einzige Notiz)
--
-- WICHTIG: Kein FK-Pragma setzen — wird zentral in migrate.ts gesteuert
-- WICHTIG: Auto-Backup laeuft via migrate.ts vor Anwendung

-- Pattern 1+2: Praefix-Zeile abschneiden, restlichen Inhalt erhalten
UPDATE dj_events
SET notes = TRIM(SUBSTR(notes, INSTR(notes, char(10)) + 1))
WHERE notes IS NOT NULL
  AND notes LIKE 'Kundendaten: %'
  AND INSTR(notes, char(10)) > 0;

-- Pattern 3: Notiz besteht NUR aus dem Praefix -> NULL setzen
UPDATE dj_events
SET notes = NULL
WHERE notes IS NOT NULL
  AND notes LIKE 'Kundendaten: %'
  AND INSTR(notes, char(10)) = 0;

-- Leere Strings ggf. zu NULL
UPDATE dj_events
SET notes = NULL
WHERE notes IS NOT NULL
  AND TRIM(notes) = '';
