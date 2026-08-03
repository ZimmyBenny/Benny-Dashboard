# Namen bei „Offene Anfragen" & „Angebote ausstehend" (DJ-Dashboard)

**Datum:** 2026-07-31 · **Status:** Von Benny freigegeben

## Ziel

Die Kacheln „Offene Anfragen" und „Angebote ausstehend" zeigen bisher nur eine
Zahl. Analog zur Kachel „Offene Vorgespräche" sollen sie die zugehörigen Namen
(+ Kontext) auflisten.

## Datenlage (untersucht)

- **Offene Anfragen** = `dj_events` mit Status `anfrage`/`neu`/`vorgespraech_vereinbart`,
  `deleted_at IS NULL` (Definition aus `dj.routes.ts` `openRequests`). Die Event-Liste
  ist im Dashboard bereits geladen (`fetchDjEvents()`) → **kein neuer Request**.
- **Angebote ausstehend** = `dj_quotes` mit Status `gesendet`, `deleted_at IS NULL`
  (`pendingQuotes`). Das Dashboard lädt Angebote **noch nicht** → eine zusätzliche
  Query `fetchDjQuotes({ status: 'gesendet' })` ist nötig. Backend liefert
  `customer_name` / `customer_org` bereits mit (JOIN in `dj.quotes.routes.ts`).

## Darstellung (wie Vorgespräche-Kachel)

Trennlinie über der Liste, je Eintrag ein abgesetzter Bindestrich, Kunde fett,
Detailzeile darunter. Fehlende Teile werden weggelassen (kein leeres „·").
Max. 3 Einträge. Bei 0 Einträgen nur die Zahl (wie bisher).

- **Offene Anfragen:** Kunde · darunter `Eventdatum · Titel`. Sortiert nach
  `event_date` aufsteigend.
- **Angebote ausstehend:** Kunde · darunter `Angebotsnummer · Betrag (brutto)`.
  Sortiert nach `quote_date` aufsteigend.

Kundenname-Fallback jeweils: `customer_name` → `customer_org` → `customer_freetext`
(nur Events) → `'Unbekannt'`.

## Layout

Beide Kacheln werden vom kompakten KPI-Aufbau (Zahl + Icon nebeneinander) auf den
Aufbau der Vorgespräche-Kachel umgestellt: Titelzeile mit Icon, darunter die Zahl,
darunter die Liste. Klick-Ziele bleiben unverändert
(`/dj/events?filter=_offene_anfragen`, `/dj/quotes?filter=gesendet`).

## Umsetzung

- `DjOverviewPage.tsx`: Query `['dj-quotes-pending']` ergänzen; zwei `useMemo`-
  Ableitungen (`offeneAnfragen`, `ausstehendeAngebote`) analog `offeneVorgespraeche`;
  beide Kacheln umbauen. Kein Backend-Eingriff, keine Migration.

## Verifikation

1. Kachel „Offene Anfragen" zeigt Jutta Rötz + Stefan Bucher mit Datum und Titel.
2. Kachel „Angebote ausstehend" zeigt aktuell 0 → keine Liste, nur die Zahl.
3. Zahlen bleiben identisch zu den Overview-Zählern.

## Nicht im Scope

- Mehr als 3 Einträge anzeigen
- Backend-Overview-Endpoint um Detaildaten erweitern
