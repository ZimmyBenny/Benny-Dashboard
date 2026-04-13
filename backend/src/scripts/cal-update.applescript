-- Aktualisiert Event per UID in Apple Calendar
-- Parameter via Env: EVT_UID, CAL_NAME, EVT_TITLE, EVT_START_EPOCH, EVT_END_EPOCH, EVT_LOCATION (optional)

on run
  set targetUID to system attribute "EVT_UID"
  set calName to system attribute "CAL_NAME"
  set evtTitle to system attribute "EVT_TITLE"
  -- Epoch als String lassen (kein 'as integer' — deutsches macOS wuerde 1.744.395.660 formatieren)
  set startEpochStr to system attribute "EVT_START_EPOCH"
  set endEpochStr to system attribute "EVT_END_EPOCH"
  try
    set evtLocation to system attribute "EVT_LOCATION"
  on error
    set evtLocation to ""
  end try

  set startDateStr to do shell script "date -r " & startEpochStr & " '+%m/%d/%Y %H:%M:%S'"
  set endDateStr to do shell script "date -r " & endEpochStr & " '+%m/%d/%Y %H:%M:%S'"
  set startDate to date startDateStr
  set endDate to date endDateStr

  tell application "Calendar"
    -- Zuerst bekannten Kalender versuchen (schneller)
    try
      set targetCal to first calendar whose name is calName
      set found to (first event of targetCal whose uid is targetUID)
      set summary of found to evtTitle
      set start date of found to startDate
      set end date of found to endDate
      if evtLocation is not "" then set location of found to evtLocation
      return "ok"
    end try
    -- Fallback: alle Kalender durchsuchen
    repeat with cal in calendars
      try
        set found to (first event of cal whose uid is targetUID)
        set summary of found to evtTitle
        set start date of found to startDate
        set end date of found to endDate
        if evtLocation is not "" then set location of found to evtLocation
        return "ok"
      end try
    end repeat
    return "not_found"
  end tell
end run
