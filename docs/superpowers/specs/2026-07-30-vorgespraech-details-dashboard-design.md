# Vorgespräch-Details auf der DJ-Dashboard-Kachel

**Datum:** 2026-07-30 · **Status:** Von Benny freigegeben

## Problem

Die Kachel „OFFENE VORGESPRÄCHE" auf dem DJ-Dashboard zeigt nur die Anzahl + einen
„→ Zu den Events"-Link. Benny möchte direkt sehen, **mit wem**, **wann** (Tag + Zeit)
und **wo** das offene Vorgespräch ist.

## Befund (untersucht)

- Der Vorgesprächs-Dialog (Anfragen & Events → Vorgesprächs-Button) nimmt **Datum +
  Uhrzeit** entgegen und legt einen **Kalender-Eintrag** an.
- ABER: Die **Uhrzeit wird nur in den Kalender** geschrieben, **nicht** an `dj_events`
  gespeichert (Mutation persistiert nur datum/ort/plz/notizen — [DjEventsPage.tsx:351](../../frontend/src/pages/dj/DjEventsPage.tsx)).
  Beim erneuten Öffnen des Dialogs ist das Uhrzeit-Feld leer (`setVorgUhrzeit('')`).
- Felder an `dj_events`: vorgespraech_status/_datum/_ort/_notizen/_km/_plz/_calendar_uid
  — **keine Uhrzeit-Spalte**.

## Entscheidung

1. **Uhrzeit dauerhaft speichern** (Grundlage) — neues Feld `vorgespraech_uhrzeit`.
   Behebt nebenbei das „Zeit vergessen"-Problem beim Wiederöffnen des Dialogs.
2. Kachel zeigt **Kunde** (fett) + darunter **Datum · Uhrzeit · Ort** pro offenem
   Vorgespräch. Fehlende Angaben werden weggelassen (kein leeres „·").
3. Datenquelle: aus der bereits geladenen Event-Liste ableiten
   (`vorgespraech_status === 'offen'`) — keine extra API-Last.

## Backend

- **Migration 126:** `ALTER TABLE dj_events ADD COLUMN vorgespraech_uhrzeit TEXT;`
  (additiv, kein Rebuild, kein createBackup, kein PRAGMA foreign_keys).
- Route `PATCH /:id/vorgespraech` (action='offen'): `uhrzeit` aus dem Body übernehmen,
  `vorgespraech_uhrzeit = ?` in das UPDATE aufnehmen.

## Frontend

- **dj.api.ts:** `DjEvent.vorgespraech_uhrzeit?: string | null`; `setDjEventVorgespraech`-
  Payload um `uhrzeit?: string` erweitern.
- **DjEventsPage.tsx:** Dialog öffnen → `setVorgUhrzeit(ev.vorgespraech_uhrzeit ?? '')`
  (Vorbefüllung); Speichern → `uhrzeit: vorgUhrzeit || undefined` mit in die Mutation.
- **DjOverviewPage.tsx:** In der Kachel „OFFENE VORGESPRÄCHE" unter der Zahl pro
  offenem Vorgespräch eine kompakte Zeile:
  - Kunde (customer_name || customer_org || customer_freetext || '—'), fett.
  - Darunter: `formatDate(datum)` · `uhrzeit` · `ort` — nur vorhandene Teile, mit „ · "
    verbunden.
  - Max. 3 Einträge listen. „→ Zu den Events" (ganze Kachel klickbar) bleibt.

## Verifikation

1. Migration läuft (Spalte existiert).
2. Vorgespräch mit Uhrzeit speichern → Uhrzeit in `dj_events.vorgespraech_uhrzeit`;
   Dialog erneut öffnen → Uhrzeit vorbefüllt; Kalender-Eintrag unverändert korrekt.
3. Dashboard-Kachel zeigt Kunde + Datum + Uhrzeit (+ Ort falls vorhanden).
4. Ohne Uhrzeit/Ort: Zeile bleibt sauber ohne leere Trenner.

## Nicht im Scope

- Uhrzeit rückwirkend aus bestehenden Kalender-Einträgen ziehen (Altbestand ohne
  gespeicherte Uhrzeit zeigt nur das Datum, bis einmal neu gespeichert).
- Mehr als 3 Vorgespräche einzeln anzeigen.
