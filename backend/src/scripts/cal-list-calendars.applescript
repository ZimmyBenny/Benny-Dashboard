on run
  tell application "Calendar"
    set calList to {}
    repeat with cal in calendars
      set end of calList to "\"" & (name of cal) & "\""
    end repeat
    set out to "["
    repeat with i from 1 to count of calList
      if i > 1 then set out to out & ","
      set out to out & (item i of calList)
    end repeat
    return out & "]"
  end tell
end run
