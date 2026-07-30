-- Vorgespräch-Uhrzeit dauerhaft am Event speichern (bisher nur im Kalender-Eintrag).
-- Additiv, damit die Uhrzeit im Dialog vorbefüllt und auf dem Dashboard angezeigt
-- werden kann. TEXT im Format "HH:MM".
ALTER TABLE dj_events ADD COLUMN vorgespraech_uhrzeit TEXT;
