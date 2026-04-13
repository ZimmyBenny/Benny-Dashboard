-- Loescht Event per UID aus Apple Calendar
-- Parameter via Env: EVT_UID, CAL_NAME (hint fuer schnellere Suche)

on run
  set targetUID to system attribute "EVT_UID"
  set calName to system attribute "CAL_NAME"

  tell application "Calendar"
    -- Bekannten Kalender zuerst (schneller)
    try
      set targetCal to first calendar whose name is calName
      set found to (first event of targetCal whose uid is targetUID)
      delete found
      return "deleted"
    end try
    -- Fallback: alle Kalender durchsuchen
    repeat with cal in calendars
      try
        set found to (first event of cal whose uid is targetUID)
        delete found
        return "deleted"
      end try
    end repeat
    return "not_found"
  end tell
end run
