-- Aktualisiert Event per UID in Apple Calendar
-- Sucht zuerst im bekannten Kalender (schneller), dann Fallback ueber alle
-- Parameter via Env: EVT_UID, CAL_NAME, EVT_TITLE, EVT_START_EPOCH, EVT_END_EPOCH, EVT_LOCATION (optional)

on run
  set targetUID to (do shell script "echo $EVT_UID")
  set calName to (do shell script "echo $CAL_NAME")
  set evtTitle to (do shell script "echo $EVT_TITLE")
  set startEpoch to (do shell script "echo $EVT_START_EPOCH") as integer
  set endEpoch to (do shell script "echo $EVT_END_EPOCH") as integer
  set evtLocation to (do shell script "echo $EVT_LOCATION")

  set startDateStr to do shell script "date -r " & startEpoch & " '+%m/%d/%Y %H:%M:%S'"
  set endDateStr to do shell script "date -r " & endEpoch & " '+%m/%d/%Y %H:%M:%S'"
  set startDate to date startDateStr
  set endDate to date endDateStr

  tell application "Calendar"
    -- Zuerst bekannten Kalender versuchen (deutlich schneller)
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
