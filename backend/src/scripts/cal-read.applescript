-- Liest Events aus konfigurierten Kalendern in einem Datumsbereich
-- Parameter via Env: CAL_NAMES (kommagetrennt), DAYS_BACK, DAYS_FORWARD
-- Gibt JSON-Array zurueck mit Epoch-Sekunden (locale-unabhaengig)

on run
  set calNamesStr to (do shell script "echo $CAL_NAMES")
  set daysBack to (do shell script "echo $DAYS_BACK") as integer
  set daysForward to (do shell script "echo $DAYS_FORWARD") as integer

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
            set evtCal to name of cal

            -- Epoch via Shell (locale-unabhaengig, DST-sicher via date -j)
            -- Versucht deutsches Locale-Format, dann englisches als Fallback
            set startEpoch to (do shell script "date -j -f '%A, %e. %B %Y um %H:%M:%S' " & quoted form of ((start date of evt) as text) & " '+%s' 2>/dev/null || date -j -f '%A, %B %e, %Y at %I:%M:%S %p' " & quoted form of ((start date of evt) as text) & " '+%s' 2>/dev/null || echo 0")
            set endEpoch to (do shell script "date -j -f '%A, %e. %B %Y um %H:%M:%S' " & quoted form of ((end date of evt) as text) & " '+%s' 2>/dev/null || date -j -f '%A, %B %e, %Y at %I:%M:%S %p' " & quoted form of ((end date of evt) as text) & " '+%s' 2>/dev/null || echo 0")
            set stampEpoch to (do shell script "date -j -f '%A, %e. %B %Y um %H:%M:%S' " & quoted form of ((stamp date of evt) as text) & " '+%s' 2>/dev/null || date -j -f '%A, %B %e, %Y at %I:%M:%S %p' " & quoted form of ((stamp date of evt) as text) & " '+%s' 2>/dev/null || echo 0")

            -- Titel escapen: Anfuehrungszeichen durch einfaches Zeichen ersetzen
            set evtTitle to do shell script "printf '%s' " & quoted form of (summary of evt) & " | tr '\"' \"'\""

            set jsonEntry to "{\"uid\":\"" & evtUID & "\",\"title\":\"" & evtTitle & "\",\"startEpoch\":" & startEpoch & ",\"endEpoch\":" & endEpoch & ",\"stampEpoch\":" & stampEpoch & ",\"allDay\":" & (evtAllDay as text) & ",\"cal\":\"" & evtCal & "\"}"
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
