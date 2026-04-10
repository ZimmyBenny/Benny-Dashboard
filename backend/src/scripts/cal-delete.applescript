-- Loescht Event per UID aus Apple Calendar
-- Sucht zuerst im bekannten Kalender (schneller), dann Fallback ueber alle
-- Parameter via Env: EVT_UID, CAL_NAME (hint fuer schnellere Suche)

on run
  set targetUID to (do shell script "echo $EVT_UID")
  set calName to (do shell script "echo $CAL_NAME")

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
