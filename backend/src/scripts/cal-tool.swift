import Foundation
import EventKit

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

let isoFormatter: ISO8601DateFormatter = {
  let f = ISO8601DateFormatter()
  f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
  return f
}()

let isoFormatterNoFrac: ISO8601DateFormatter = {
  let f = ISO8601DateFormatter()
  f.formatOptions = [.withInternetDateTime]
  return f
}()

func parseISO(_ s: String) -> Date? {
  return isoFormatter.date(from: s) ?? isoFormatterNoFrac.date(from: s)
}

func formatISO(_ d: Date) -> String {
  return isoFormatterNoFrac.string(from: d)
}

func cgColorToHex(_ cgColor: CGColor?) -> String? {
  guard let c = cgColor, let comps = c.components, comps.count >= 3 else { return nil }
  let r = Int((comps[0] * 255).rounded())
  let g = Int((comps[1] * 255).rounded())
  let b = Int((comps[2] * 255).rounded())
  return String(format: "#%02x%02x%02x", r, g, b)
}

func jsonOutput(_ obj: Any) {
  if let data = try? JSONSerialization.data(withJSONObject: obj, options: [.prettyPrinted]),
     let str = String(data: data, encoding: .utf8) {
    print(str)
  }
}

func errorExit(_ message: String) -> Never {
  jsonOutput(["error": message])
  exit(1)
}

// ── Argument-Parsing ──────────────────────────────────────────────────────────

func argValue(_ args: [String], flag: String) -> String? {
  guard let idx = args.firstIndex(of: flag), idx + 1 < args.count else { return nil }
  return args[idx + 1]
}

func hasFlag(_ args: [String], flag: String) -> Bool {
  return args.contains(flag)
}

// ── Hauptlogik ────────────────────────────────────────────────────────────────

let args = Array(CommandLine.arguments.dropFirst())

guard let subcommand = args.first else {
  errorExit("Usage: cal-tool <list-calendars|read|create|delete> [options]")
}

let store = EKEventStore()

// EventKit-Zugriffsanfrage mit RunLoop fuer Async-Callback
func requestAccess(completion: @escaping (Bool) -> Void) {
  if #available(macOS 14.0, *) {
    store.requestFullAccessToEvents { granted, error in
      if let error = error {
        print("[cal-tool] Access error: \(error.localizedDescription)", to: &standardError)
      }
      completion(granted)
    }
  } else {
    store.requestAccess(to: .event) { granted, error in
      if let error = error {
        print("[cal-tool] Access error: \(error.localizedDescription)", to: &standardError)
      }
      completion(granted)
    }
  }
}

var standardError = FileHandle.standardError

extension FileHandle: TextOutputStream {
  public func write(_ string: String) {
    if let data = string.data(using: .utf8) {
      self.write(data)
    }
  }
}

// ── Subcommand: list-calendars ────────────────────────────────────────────────

func runListCalendars() {
  requestAccess { granted in
    guard granted else { errorExit("EventKit access denied") }

    let calendars = store.calendars(for: .event)
      .filter { $0.type != .birthday }

    var result: [[String: Any]] = []
    for cal in calendars {
      var entry: [String: Any] = [
        "id":    cal.calendarIdentifier,
        "title": cal.title,
        "type":  String(cal.type.rawValue),
      ]
      if let hex = cgColorToHex(cal.cgColor) {
        entry["color"] = hex
      } else {
        entry["color"] = NSNull()
      }
      result.append(entry)
    }

    jsonOutput(result)
    CFRunLoopStop(CFRunLoopGetMain())
  }
  CFRunLoopRun()
}

// ── Subcommand: read ──────────────────────────────────────────────────────────

func runRead(subArgs: [String]) {
  guard let fromStr = argValue(subArgs, flag: "--from"),
        let toStr   = argValue(subArgs, flag: "--to"),
        let fromDate = parseISO(fromStr + "T00:00:00Z") ?? parseISO(fromStr),
        let toDate   = parseISO(toStr   + "T23:59:59Z") ?? parseISO(toStr) else {
    errorExit("read requires --from YYYY-MM-DD --to YYYY-MM-DD")
  }

  requestAccess { granted in
    guard granted else { errorExit("EventKit access denied") }

    let predicate = store.predicateForEvents(withStart: fromDate, end: toDate, calendars: nil)
    let events = store.events(matching: predicate)

    var result: [[String: Any]] = []
    for evt in events {
      guard let cal = evt.calendar else { continue }
      if cal.type == .birthday { continue }

      var entry: [String: Any] = [
        "id":            evt.eventIdentifier ?? "",
        "calendarId":    cal.calendarIdentifier,
        "calendarTitle": cal.title,
        "title":         evt.title ?? "(kein Titel)",
        "startDate":     formatISO(evt.startDate),
        "endDate":       formatISO(evt.endDate),
        "isAllDay":      evt.isAllDay,
      ]
      entry["location"] = evt.location as Any? ?? NSNull()
      entry["notes"]    = evt.notes    as Any? ?? NSNull()

      result.append(entry)
    }

    jsonOutput(result)
    CFRunLoopStop(CFRunLoopGetMain())
  }
  CFRunLoopRun()
}

// ── Subcommand: create ────────────────────────────────────────────────────────

func runCreate(subArgs: [String]) {
  guard let calId   = argValue(subArgs, flag: "--calendar-id"),
        let title   = argValue(subArgs, flag: "--title"),
        let startStr = argValue(subArgs, flag: "--start"),
        let endStr   = argValue(subArgs, flag: "--end"),
        let startDate = parseISO(startStr),
        let endDate   = parseISO(endStr) else {
    errorExit("create requires --calendar-id ID --title TEXT --start ISO --end ISO")
  }

  let isAllDay     = hasFlag(subArgs, flag: "--all-day")
  let notes        = argValue(subArgs, flag: "--notes")
  let location     = argValue(subArgs, flag: "--location")
  let alarmMinStr  = argValue(subArgs, flag: "--alarm-minutes")
  let alarmMinutes = alarmMinStr.flatMap { Int($0) }

  requestAccess { granted in
    guard granted else { errorExit("EventKit access denied") }

    guard let calendar = store.calendars(for: .event).first(where: { $0.calendarIdentifier == calId }) else {
      errorExit("Calendar not found: \(calId)")
    }

    let newEvent = EKEvent(eventStore: store)
    newEvent.calendar  = calendar
    newEvent.title     = title
    newEvent.startDate = startDate
    newEvent.endDate   = endDate
    newEvent.isAllDay  = isAllDay
    if let n = notes    { newEvent.notes    = n }
    if let l = location { newEvent.location = l }
    if let mins = alarmMinutes {
      newEvent.addAlarm(EKAlarm(relativeOffset: TimeInterval(-mins * 60)))
    }

    do {
      try store.save(newEvent, span: .thisEvent, commit: true)
    } catch {
      errorExit("Failed to save event: \(error.localizedDescription)")
    }

    let result: [String: Any] = [
      "id":            newEvent.eventIdentifier ?? "",
      "calendarId":    calendar.calendarIdentifier,
      "calendarTitle": calendar.title,
      "title":         newEvent.title ?? "",
      "startDate":     formatISO(newEvent.startDate),
      "endDate":       formatISO(newEvent.endDate),
      "isAllDay":      newEvent.isAllDay,
      "location":      newEvent.location as Any? ?? NSNull(),
      "notes":         newEvent.notes    as Any? ?? NSNull(),
    ]

    jsonOutput(result)
    CFRunLoopStop(CFRunLoopGetMain())
  }
  CFRunLoopRun()
}

// ── Subcommand: list-reminders ────────────────────────────────────────────────

func requestReminderAccess(completion: @escaping (Bool) -> Void) {
  if #available(macOS 14.0, *) {
    store.requestFullAccessToReminders { granted, error in
      if let error = error {
        print("[cal-tool] Reminder access error: \(error.localizedDescription)", to: &standardError)
      }
      completion(granted)
    }
  } else {
    store.requestAccess(to: .reminder) { granted, error in
      if let error = error {
        print("[cal-tool] Reminder access error: \(error.localizedDescription)", to: &standardError)
      }
      completion(granted)
    }
  }
}

func runListReminders(subArgs: [String]) {
  let fromStr = argValue(subArgs, flag: "--from")
  let toStr   = argValue(subArgs, flag: "--to")

  requestReminderAccess { granted in
    guard granted else { errorExit("EventKit reminder access denied") }

    let predicate = store.predicateForReminders(in: nil)

    store.fetchReminders(matching: predicate) { reminders in
      guard let reminders = reminders else {
        jsonOutput([] as [[String: Any]])
        CFRunLoopStop(CFRunLoopGetMain())
        return
      }

      // Datumsfilter (optional, basierend auf dueDate)
      var fromDate: Date? = nil
      var toDate: Date? = nil
      if let f = fromStr { fromDate = parseISO(f + "T00:00:00Z") ?? parseISO(f) }
      if let t = toStr   { toDate   = parseISO(t + "T23:59:59Z") ?? parseISO(t) }

      var result: [[String: Any]] = []

      for reminder in reminders {
        guard !reminder.isCompleted else { continue }

        // dueDate aus DateComponents berechnen
        var dueDate: Date? = nil
        if let comps = reminder.dueDateComponents {
          dueDate = Calendar.current.date(from: comps)
        }

        // Erinnerungen ohne Fälligkeitsdatum überspringen — gehören nicht in den Kalender
        guard let due = dueDate else { continue }

        // Datumsfilter anwenden
        if let from = fromDate, due < from { continue }
        if let to   = toDate,   due > to   { continue }

        let dueDateStr = formatISO(due)

        var entry: [String: Any] = [
          "id":            reminder.calendarItemIdentifier,
          "calendarId":    reminder.calendar?.calendarIdentifier ?? "",
          "calendarTitle": reminder.calendar?.title ?? "Erinnerungen",
          "title":         reminder.title ?? "(keine Beschreibung)",
          "startDate":     dueDateStr,
          "endDate":       dueDateStr,
          "isAllDay":      reminder.dueDateComponents?.hour == nil, // kein Zeitanteil = ganztägig
          "isReminder":    true,
        ]
        entry["location"] = NSNull()
        entry["notes"]    = reminder.notes as Any? ?? NSNull()

        result.append(entry)
      }

      jsonOutput(result)
      CFRunLoopStop(CFRunLoopGetMain())
    }
  }
  CFRunLoopRun()
}

// ── Subcommand: delete ────────────────────────────────────────────────────────

func runDelete(subArgs: [String]) {
  guard let eventId = argValue(subArgs, flag: "--event-id") else {
    errorExit("delete requires --event-id ID")
  }

  requestAccess { granted in
    guard granted else { errorExit("EventKit access denied") }

    guard let event = store.event(withIdentifier: eventId) else {
      errorExit("Event not found: \(eventId)")
    }

    do {
      try store.remove(event, span: .thisEvent, commit: true)
    } catch {
      errorExit("Failed to delete event: \(error.localizedDescription)")
    }

    jsonOutput(["ok": true])
    CFRunLoopStop(CFRunLoopGetMain())
  }
  CFRunLoopRun()
}

// ── Subcommand: update ────────────────────────────────────────────────────────

func runUpdate(subArgs: [String]) {
  guard let eventId = argValue(subArgs, flag: "--event-id") else {
    errorExit("update requires --event-id ID")
  }

  let newTitle    = argValue(subArgs, flag: "--title")
  let startStr    = argValue(subArgs, flag: "--start")
  let endStr      = argValue(subArgs, flag: "--end")
  let newNotes    = argValue(subArgs, flag: "--notes")
  let newLocation = argValue(subArgs, flag: "--location")
  let newCalId    = argValue(subArgs, flag: "--calendar-id")
  let isAllDay    = hasFlag(subArgs, flag: "--all-day")
  let clearNotes  = hasFlag(subArgs, flag: "--clear-notes")
  let clearLoc    = hasFlag(subArgs, flag: "--clear-location")
  let alarmMinStr  = argValue(subArgs, flag: "--alarm-minutes")
  let alarmMinutes = alarmMinStr.flatMap { Int($0) }

  requestAccess { granted in
    guard granted else { errorExit("EventKit access denied") }

    guard let event = store.event(withIdentifier: eventId) else {
      errorExit("Event not found: \(eventId)")
    }

    if let t = newTitle   { event.title     = t }
    if let n = newNotes   { event.notes     = n }
    if let l = newLocation { event.location = l }
    if clearNotes         { event.notes     = nil }
    if clearLoc           { event.location  = nil }

    if let s = startStr, let startDate = parseISO(s) { event.startDate = startDate }
    if let e = endStr,   let endDate   = parseISO(e) { event.endDate   = endDate   }

    if startStr != nil || endStr != nil {
      event.isAllDay = isAllDay
    }

    if let calId = newCalId,
       let calendar = store.calendars(for: .event).first(where: { $0.calendarIdentifier == calId }) {
      event.calendar = calendar
    }

    // Alarm: bestehende löschen und neu setzen wenn --alarm-minutes übergeben
    if alarmMinStr != nil {
      event.alarms = nil
      if let mins = alarmMinutes, mins >= 0 {
        event.addAlarm(EKAlarm(relativeOffset: TimeInterval(-mins * 60)))
      }
    }

    do {
      try store.save(event, span: .thisEvent, commit: true)
    } catch {
      errorExit("Failed to update event: \(error.localizedDescription)")
    }

    guard let cal = event.calendar else { errorExit("Calendar missing after update") }

    let result: [String: Any] = [
      "id":            event.eventIdentifier ?? eventId,
      "calendarId":    cal.calendarIdentifier,
      "calendarTitle": cal.title,
      "title":         event.title ?? "",
      "startDate":     formatISO(event.startDate),
      "endDate":       formatISO(event.endDate),
      "isAllDay":      event.isAllDay,
      "location":      event.location as Any? ?? NSNull(),
      "notes":         event.notes    as Any? ?? NSNull(),
    ]

    jsonOutput(result)
    CFRunLoopStop(CFRunLoopGetMain())
  }
  CFRunLoopRun()
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

let subArgs = Array(args.dropFirst())

switch subcommand {
case "list-calendars":
  runListCalendars()
case "read":
  runRead(subArgs: subArgs)
case "list-reminders":
  runListReminders(subArgs: subArgs)
case "create":
  runCreate(subArgs: subArgs)
case "update":
  runUpdate(subArgs: subArgs)
case "delete":
  runDelete(subArgs: subArgs)
default:
  errorExit("Unknown subcommand: \(subcommand). Use list-calendars, read, list-reminders, create, update, or delete.")
}
