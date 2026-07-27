# Kalender: Mehrere Erinnerungen pro Termin (Apple-konform)

**Datum:** 2026-07-27 · **Status:** Von Benny freigegeben

## Problem

Der Termin-Dialog bietet nur EINE Erinnerung mit wenigen Optionen (5/15/30 Min,
1 Std, 1 Tag). Apple erlaubt mehrere Erinnerungen pro Termin und mehr Vorlaufzeiten
(u. a. 2 Std). Benny will beides — inklusive Übernahme in den Apple-Kalender.

**Ist-Zustand (untersucht):**
- `calendar_events` hat KEIN Alarm-Feld — Erinnerungen werden nur durchgereicht,
  nie gespeichert.
- `cal-tool.swift` (EventKit-Binary) nimmt genau ein `--alarm-minutes` entgegen und
  setzt einen `EKAlarm(relativeOffset: -mins*60)`.
- Der `read`-Subcommand liefert KEINE Alarme zurück (`RawEvent` hat kein Alarm-Feld)
  → beim Bearbeiten sieht man nicht, was gesetzt ist.
- `swiftc` (Swift 6.2.3) ist vorhanden → Binary kann neu gebaut werden.

## Geklärte Anforderungen

- **Bestehende Erinnerungen sichtbar** beim Öffnen/Bearbeiten (Frage 1: A) — Alarme
  werden aus Apple zurückgelesen.
- **Ganztägige Termine** bekommen Apple-typische Optionen mit Uhrzeit 9:00
  (Frage 2: A) — sonst kämen Benachrichtigungen um Mitternacht.

## Datenmodell (Migration 124, additiv)

```sql
ALTER TABLE calendar_events ADD COLUMN alarms TEXT;
```

JSON-Array von **Minuten-Offsets relativ zum Terminstart**, negativ = vorher.
Beispiel: `[-15,-60]` = 15 Min und 1 Std vorher. `[]` = keine Erinnerung.
`NULL` = unbekannt (Alt-Events bis zum nächsten Sync).
Kein Rebuild, kein PRAGMA foreign_keys.

## Offset-Definition (verbindlich)

**Normale Termine** (relativ zum Startzeitpunkt):

| Option | Offset (Min) |
|---|---|
| Zum Zeitpunkt des Termins | 0 |
| 5 / 10 / 15 / 30 Minuten vorher | -5 / -10 / -15 / -30 |
| 1 / 2 Stunden vorher | -60 / -120 |
| 1 / 2 Tage vorher | -1440 / -2880 |
| 1 Woche vorher | -10080 |
| Eigene Zeit | frei (Minuten, negativ = vorher) |

**Ganztägige Termine** (Start = 00:00 des Tages, daher +9h für 9:00 Uhr):

| Option | Offset (Min) | Rechnung |
|---|---|---|
| Am Tag des Termins (9:00) | +540 | 0h + 9h |
| 1 Tag vorher (9:00) | -900 | -24h + 9h |
| 2 Tage vorher (9:00) | -2340 | -48h + 9h |
| 1 Woche vorher (9:00) | -9540 | -168h + 9h |
| Eigene Zeit | frei | |

## Swift-Tool (`backend/src/scripts/cal-tool.swift`)

**Vor dem Neubau: bestehendes Binary sichern** (`cp cal-tool cal-tool.bak`).
Build: `swiftc -O cal-tool.swift -o cal-tool` (Verifikation: `./cal-tool read …`
liefert weiterhin gültiges JSON).

1. **`read`** (und `list-reminders`, soweit betroffen): je Event ein Feld
   `alarmOffsets: [Int]` (Minuten, negativ = vorher) ausgeben.
   - `EKAlarm.relativeOffset` (Sekunden) → `Int(round(offset/60))`.
   - Alarme mit `absoluteDate` statt relativeOffset: in relativen Offset umrechnen
     (`absoluteDate - event.startDate`), damit die UI sie darstellen kann.
2. **`create` / `update`:** neues Flag `--alarm-offsets` mit Komma-Liste, z. B.
   `--alarm-offsets "-15,-60"`. Leerer String = alle Alarme entfernen.
   Bei `update`: nur wenn das Flag übergeben wird, wird `event.alarms` ersetzt
   (Flag fehlt = Alarme unverändert lassen).
   `EKAlarm(relativeOffset: TimeInterval(offsetMinutes * 60))` — **kein
   Vorzeichenwechsel mehr**, das Vorzeichen steckt im Offset.
3. **`--alarm-minutes` entfällt** — TS-Aufrufer wird zeitgleich umgestellt
   (einziger Nutzer). Binary und TS-Code müssen gemeinsam deployt werden.

## Backend

- `calendarSwift.service.ts`:
  - `RawEvent` um `alarmOffsets?: number[]` erweitern; beim Sync als JSON in
    `calendar_events.alarms` schreiben (Apple ist Source of Truth).
  - `createEvent`/`updateEvent`: Parameter `alarm_minutes` → `alarms: number[]`,
    als `--alarm-offsets`-Komma-Liste weiterreichen.
- `calendar.routes.ts`: `POST /events` und `PATCH /events/:id` akzeptieren
  `alarms: number[]`; `GET /events` liefert `alarms` (aus DB, JSON-geparst) mit.
- Validierung: nur ganze Zahlen, Bereich −525600 (1 Jahr) … +525600; max. 10
  Erinnerungen pro Termin (Duplikate werden entfernt).

## Frontend (`CalendarPage.tsx`)

- Statt einer Auswahl eine **Erinnerungs-Liste**: je Eintrag ein Dropdown mit den
  obigen Optionen + ✕ zum Entfernen; darunter **„+ Erinnerung hinzufügen"**
  (bis max. 10). Keine Erinnerungen = leere Liste (Text „Keine Erinnerung").
- **„Eigene Zeit"** blendet ein Zahlenfeld + Einheit (Minuten/Stunden/Tage) und
  Richtung (vorher/nachher) ein.
- Umschalten von **„Ganztägig"** wechselt die Optionsliste; bereits gesetzte Offsets
  bleiben erhalten und werden, wenn sie nicht in der neuen Liste vorkommen, als
  „Eigene Zeit" dargestellt.
- Beim Öffnen eines bestehenden Termins wird die Liste aus `event.alarms` befüllt.
- Echte Umlaute; Entfernen ohne Rückfrage (nicht destruktiv, erst Speichern wirkt).

## Verifikation

1. Neuer Termin mit zwei Erinnerungen (15 Min + 2 Std) → in Apple Kalender beide
   sichtbar (macOS Kalender-App öffnen bzw. `cal-tool read` gegenprüfen).
2. Termin erneut öffnen → beide Erinnerungen werden angezeigt.
3. Eine entfernen, speichern, erneut öffnen → nur noch eine, auch in Apple.
4. Ganztägiger Termin mit „1 Tag vorher (9:00)" → Offset −900 in Apple, Anzeige dort
   als „1 Tag vorher um 09:00".
5. Termin ohne Erinnerung → keine Alarme, kein Fehler.
6. Regressionstest: bestehender Termin ohne Alarm-Änderung wird beim Update nicht
   seiner Alarme beraubt (Flag fehlt = unverändert).

## Nicht im Scope

- Ortsbasierte Erinnerungen („beim Verlassen")
- Alarm-Typen (E-Mail/Ton/App-Aktion)
- Erinnerungen für Apple-Reminders (nur Kalender-Events)
