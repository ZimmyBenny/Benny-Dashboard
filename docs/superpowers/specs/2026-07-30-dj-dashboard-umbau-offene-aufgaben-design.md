# DJ-Dashboard umbauen + „Offene Aufgaben" (DJ)

**Datum:** 2026-07-30 · **Status:** Von Benny freigegeben

## Ziel

Das DJ-Dashboard verschlanken und einen „Offene Aufgaben"-Block (wie beim
Amazon-Dashboard) für den Bereich DJ ergänzen.

## Entfernen (nur Ansicht, Daten/Endpunkte bleiben)

- TERMINE GESAMT
- GESPIELTE VERANSTALTUNGEN (inkl. Ø Gage + Liste)
- BESTÄTIGTE ZUKÜNFTIGE EINNAHMEN

## Bleibt

Nächste Veranstaltungen (oben), OFFENE ANFRAGEN, ANGEBOTE AUSSTEHEND,
OFFENE VORGESPRÄCHE (mit Details), UMSATZ, UNBEZAHLTE RECHNUNGEN, Auslastung
Wochenenden.

## Neu

**DjOpenTasks** — Klon von `AmazonOpenTasks`, gefiltert auf `area: 'DJ'`.
Zeigt offene DJ-Aufgaben (überfällig/heute markiert, Priorität, Fälligkeit),
Zähler, „+ Aufgabe"-Knopf (TaskSlideOver, prefill area 'DJ'), Klick → /tasks.
Leerzustand: „Keine offenen DJ-Aufgaben".

## Layout danach

- Reihe 1 (3 Spalten): Offene Anfragen · Angebote ausstehend · Offene Vorgespräche
- Reihe 2 (2 Spalten): Umsatz · Unbezahlte Rechnungen
- Volle Breite: Offene Aufgaben (DjOpenTasks)
- Volle Breite: Auslastung Wochenenden (unverändert)

## Umsetzung

- Neu: `frontend/src/components/dj/DjOpenTasks.tsx`
- `DjOverviewPage.tsx`: Import + 3 Kacheln entfernt, Vorgespräche in Reihe 1,
  Unbezahlte in Reihe 2, DjOpenTasks-Block ergänzt. Kein Backend-Eingriff.

## Nicht im Scope

- Backend/Overview-Endpoint anpassen (die entfernten Felder bleiben ungenutzt)
