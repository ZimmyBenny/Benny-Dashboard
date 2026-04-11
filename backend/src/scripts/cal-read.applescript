-- Liest Events aus konfigurierten Kalendern in einem Datumsbereich
-- Parameter via Env: CAL_NAMES (kommagetrennt), DAYS_BACK, DAYS_FORWARD
-- Gibt JSON-Array zurueck mit Epoch-Sekunden (locale-unabhaengig)
-- Performance-Hinweis: Calendar.app IPC braucht ~8-10s pro Kalender (whose-Clause
-- ist schneller als "every event of cal" + manuelles Filtern).
-- Bei 10 Kalendern: ~80-100s Laufzeit. execFile timeout muss >= 300s sein.

on run
  -- system attribute liest aus dem osascript-Prozess-Env (korrekt bei execFile mit env:{}).
  -- do shell script "echo $VAR" startet eine neue Shell ohne das Parent-Env — deshalb immer leer.
  try
    set calNamesStr to system attribute "CAL_NAMES"
  on error
    set calNamesStr to ""
  end try
  try
    set daysBack to (system attribute "DAYS_BACK") as integer
  on error
    set daysBack to 30
  end try
  try
    set daysForward to (system attribute "DAYS_FORWARD") as integer
  on error
    set daysForward to 90
  end try

  -- Referenzdatum fuer UTC-Epoch-Berechnung (kein do shell script pro Event noetig)
  set refDate to (date "Donnerstag, 1. Januar 1970 um 00:00:00")
  set utcOffset to time to GMT -- z.B. 7200 fuer UTC+2 (CEST)

  tell application "Calendar"
    set theNow to current date
    set startRange to theNow - (daysBack * days)
    set endRange to theNow + (daysForward * days)
    set jsonParts to {}

    repeat with cal in calendars
      if calNamesStr contains (name of cal) then
        try
          set matchingEvents to (every event of cal whose start date >= startRange and start date <= endRange)
          repeat with evt in matchingEvents
            set evtUID to uid of evt
            set evtAllDay to allday event of evt

            -- Epoch direkt in AppleScript berechnen (kein do shell script pro Event!)
            set startEpoch to (((start date of evt) - refDate) - utcOffset) as integer
            set endEpoch to (((end date of evt) - refDate) - utcOffset) as integer
            set stampEpoch to 0
            try
              set stampEpoch to (((stamp date of evt) - refDate) - utcOffset) as integer
            end try

            -- Titel und Kalender-Name JSON-sicher escapen:
            -- Backslash zuerst (damit er nicht doppelt ersetzt wird), dann " und Steuerzeichen
            set evtTitle to do shell script "printf '%s' " & quoted form of ((summary of evt) as text) & " | sed 's/\\\\/\\\\\\\\/g; s/\"/\\\\\"/g' | tr -d '\\r' | tr '\\n' ' ' | tr '\\t' ' '"
            set evtCalEscaped to do shell script "printf '%s' " & quoted form of ((name of cal) as text) & " | sed 's/\\\\/\\\\\\\\/g; s/\"/\\\\\"/g'"

            set jsonEntry to "{\"uid\":\"" & evtUID & "\",\"title\":\"" & evtTitle & "\",\"startEpoch\":" & startEpoch & ",\"endEpoch\":" & endEpoch & ",\"stampEpoch\":" & stampEpoch & ",\"allDay\":" & (evtAllDay as text) & ",\"cal\":\"" & evtCalEscaped & "\"}"
            set end of jsonParts to jsonEntry
          end repeat
        end try
      end if
    end repeat

    set out to "["
    repeat with i from 1 to count of jsonParts
      if i > 1 then set out to out & ","
      set out to out & (item i of jsonParts)
    end repeat
    return out & "]"
  end tell
end run
