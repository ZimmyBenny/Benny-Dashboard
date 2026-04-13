-- Erstellt Event in Apple Calendar, gibt UID zurueck
-- Parameter via Env: CAL_NAME, EVT_TITLE, EVT_START_EPOCH, EVT_END_EPOCH, EVT_ALLDAY (true/false), EVT_LOCATION (optional)

on run
  set calName to system attribute "CAL_NAME"
  set evtTitle to system attribute "EVT_TITLE"
  -- Epoch als String lassen (kein 'as integer' — deutsches macOS wuerde 1.744.395.660 formatieren und date -r wuerde fehlschlagen)
  set startEpochStr to system attribute "EVT_START_EPOCH"
  set endEpochStr to system attribute "EVT_END_EPOCH"
  set allDayStr to system attribute "EVT_ALLDAY"
  try
    set evtLocation to system attribute "EVT_LOCATION"
  on error
    set evtLocation to ""
  end try

  -- Epoch zu AppleScript-Datum via Shell (date -r = Epoch zu local time)
  set startDateStr to do shell script "date -r " & startEpochStr & " '+%m/%d/%Y %H:%M:%S'"
  set endDateStr to do shell script "date -r " & endEpochStr & " '+%m/%d/%Y %H:%M:%S'"
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
    set newUID to uid of newEvent
    return newUID
  end tell
end run
