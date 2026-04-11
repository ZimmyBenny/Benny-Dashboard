on run
  tell application "Calendar"
    set calList to {}
    repeat with cal in calendars
      set calName to name of cal
      set calColor to color of cal
      set r to round (red of calColor / 65535 * 255)
      set g to round (green of calColor / 65535 * 255)
      set b to round (blue of calColor / 65535 * 255)
      set hexChars to "0123456789abcdef"
      set rHex to (character ((r div 16) + 1) of hexChars) & (character ((r mod 16) + 1) of hexChars)
      set gHex to (character ((g div 16) + 1) of hexChars) & (character ((g mod 16) + 1) of hexChars)
      set bHex to (character ((b div 16) + 1) of hexChars) & (character ((b mod 16) + 1) of hexChars)
      set colorHex to "#" & rHex & gHex & bHex
      set end of calList to "{\"name\":\"" & calName & "\",\"color\":\"" & colorHex & "\"}"
    end repeat
    set out to "["
    repeat with i from 1 to count of calList
      if i > 1 then set out to out & ","
      set out to out & (item i of calList)
    end repeat
    return out & "]"
  end tell
end run
