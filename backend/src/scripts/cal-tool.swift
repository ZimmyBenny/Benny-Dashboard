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
      .filter { !$0.hasRecurrenceRules }

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

  let isAllDay = hasFlag(subArgs, flag: "--all-day")
  let notes    = argValue(subArgs, flag: "--notes")
  let location = argValue(subArgs, flag: "--location")

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

// ── Dispatch ──────────────────────────────────────────────────────────────────

let subArgs = Array(args.dropFirst())

switch subcommand {
case "list-calendars":
  runListCalendars()
case "read":
  runRead(subArgs: subArgs)
case "create":
  runCreate(subArgs: subArgs)
case "delete":
  runDelete(subArgs: subArgs)
default:
  errorExit("Unknown subcommand: \(subcommand). Use list-calendars, read, create, or delete.")
}
