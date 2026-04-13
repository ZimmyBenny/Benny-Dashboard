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

  -- Epoch-Anker: Shell liefert UTC-Epoch des aktuellen Moments (locale-unabhaengig).
  -- Statt hartkodiertem "Donnerstag, 1. Januar 1970 um 00:00:00" (bricht bei nicht-DE-Locale).
  -- Rechnung: eventEpoch = (eventDate - nowDate) + nowEpoch  (Timezone kuertzt sich heraus)
  set nowEpoch to (do shell script "date '+%s'") as integer

  tell application "Calendar"
    set theNow to current date
    set startRange to theNow - (daysBack * days)
    set endRange to theNow + (daysForward * days)
    set jsonParts to {}

    repeat with cal in calendars
      if calNamesStr contains (name of cal) then
        set calNameStr to name of cal as text
        set isBirthdayCal to (calNameStr is "Geburtstage" or calNameStr is "Birthdays")
        try
          -- Geburtstage-Kalender: Originaldaten sind historisch (z.B. 2016).
          -- Wir holen alle Events und projizieren das Datum auf das aktuelle Jahr.
          if isBirthdayCal then
            set allCalEvents to every event of cal
            repeat with evt in allCalEvents
              try
                set origStart to start date of evt
                -- Geburtstag auf aktuelles und naechstes Jahr projizieren
                repeat with yearOffset from 0 to 1
                  set checkDate to origStart
                  set year of checkDate to (year of theNow) + yearOffset
                  if checkDate >= startRange and checkDate <= endRange then
                    set evtUID to uid of evt
                    set yearSuffix to ((year of theNow) + yearOffset) as text
                    set uniqueUID to evtUID & "-bday-" & yearSuffix
                    set startEpoch to (((checkDate) - theNow) + nowEpoch) as integer
                    set endDate to checkDate + (1 * days)
                    set endEpoch to (((endDate) - theNow) + nowEpoch) as integer
                    -- Einfaches Escaping ohne Shell (Geburtstagsnamen enthalten selten " oder \)
                    set rawTitle to (summary of evt) as text
                    set jsonEntry to "{\"uid\":\"" & uniqueUID & "\",\"title\":\"" & rawTitle & "\",\"startEpoch\":" & startEpoch & ",\"endEpoch\":" & endEpoch & ",\"stampEpoch\":0,\"allDay\":true,\"cal\":\"" & calNameStr & "\"}"
                    set end of jsonParts to jsonEntry
                  end if
                end repeat
              end try
            end repeat
          else
            -- Normaler Kalender: whose-Clause fuer Performance
            set matchingEvents to (every event of cal whose start date >= startRange and start date <= endRange)
            repeat with evt in matchingEvents
              set evtUID to uid of evt
              set evtAllDay to allday event of evt
              set startEpoch to (((start date of evt) - theNow) + nowEpoch) as integer
              set endEpoch to (((end date of evt) - theNow) + nowEpoch) as integer
              set stampEpoch to 0
              try
                set stampEpoch to (((stamp date of evt) - theNow) + nowEpoch) as integer
              end try
              set evtTitle to do shell script "printf '%s' " & quoted form of ((summary of evt) as text) & " | sed 's/\\\\/\\\\\\\\/g; s/\"/\\\\\"/g' | tr -d '\\r' | tr '\\n' ' ' | tr '\\t' ' '"
              set evtCalEscaped to do shell script "printf '%s' " & quoted form of (calNameStr) & " | sed 's/\\\\/\\\\\\\\/g; s/\"/\\\\\"/g'"
              set jsonEntry to "{\"uid\":\"" & evtUID & "\",\"title\":\"" & evtTitle & "\",\"startEpoch\":" & startEpoch & ",\"endEpoch\":" & endEpoch & ",\"stampEpoch\":" & stampEpoch & ",\"allDay\":" & (evtAllDay as text) & ",\"cal\":\"" & evtCalEscaped & "\"}"
              set end of jsonParts to jsonEntry
            end repeat
          end if
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
