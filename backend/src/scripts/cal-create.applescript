-- Erstellt Event in Apple Calendar, gibt UID zurueck
-- Parameter via Env: CAL_NAME, EVT_TITLE, EVT_START_EPOCH, EVT_END_EPOCH, EVT_ALLDAY (true/false), EVT_LOCATION (optional)

on run
  set calName to (do shell script "echo $CAL_NAME")
  set evtTitle to (do shell script "echo $EVT_TITLE")
  set startEpoch to (do shell script "echo $EVT_START_EPOCH") as integer
  set endEpoch to (do shell script "echo $EVT_END_EPOCH") as integer
  set allDayStr to (do shell script "echo $EVT_ALLDAY")
  set evtLocation to (do shell script "echo $EVT_LOCATION")

  -- Epoch zu AppleScript-Datum via Shell (date -r = Epoch zu local time)
  set startDateStr to do shell script "date -r " & startEpoch & " '+%m/%d/%Y %H:%M:%S'"
  set endDateStr to do shell script "date -r " & endEpoch & " '+%m/%d/%Y %H:%M:%S'"
  set startDate to date startDateStr
  set endDate to date endDateStr

  tell application "Calendar"
    set targetCal to first calendar whose name is calName
    set newEvent to make new event at end of events of targetCal with properties {summary:evtTitle, start date:startDate, end date:endDate}
    if allDayStr is "true" then
      set allday event of newEvent to true
    end if
    if evtLocation is not "" then
      set location of newEvent to evtLocation
    end if
    -- UID auslesen (Zugriff erzwingt Commit in Calendar)
    set newUID to uid of newEvent
    return newUID
  end tell
end run
