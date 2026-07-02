# Amazon-Modul-Dashboard — Design

**Datum:** 2026-07-02
**Status:** Freigegeben (Design), Umsetzung ausstehend

## Ziel

Beim Klick auf „Amazon" in der Sidebar landet man künftig auf einem eigenständigen
**Amazon-Dashboard** (Modul-Übersicht) statt direkt auf der „Entwicklung"-Seite.
Von diesem Dashboard aus navigiert man in die Unterbereiche und sieht auf einen Blick
den Stand der Produktentwicklung, offene Amazon-Aufgaben und den Fortschritt der
aktiven Produkte.

## Ausgangslage

- `/amazon` ist aktuell nur eine `<Navigate>`-Weiterleitung auf `/amazon/entwicklung`
  (das ECO-Board `AmazonOverviewPage`). Der `/amazon`-Slot ist damit frei für eine
  echte Übersichtsseite.
- Die Amazon-Sidebar-Gruppe klappt sich beim Landen auf einer Amazon-Route **nicht**
  automatisch auf (Auto-Expand ist in `Sidebar.tsx` nur für `/dj` verdrahtet).
- Aufgaben haben ein Feld `area` mit fester Auswahl inkl. „Amazon" →
  `GET /api/tasks?area=Amazon` ist direkt nutzbar.
- Es gibt noch keine aggregierte Amazon-Stats-Route; Rohdaten (Produkte, Checkliste
  mit `is_done`, Sourcing mit 9 Checkpoints) sind aber alle vorhanden.

## Scope (v1)

Enthalten:
1. Navigations-Kacheln zu den Unterbereichen
2. Status-KPIs (Interessant / Aktiv / Bestehend / Verworfen)
3. Aktive Produkte mit Fortschritt (Checkliste X/Y, Sourcing X/9)
4. Offene Amazon-Aufgaben
5. Schnellaktion „Produkt direkt entwickeln"

Bewusst **nicht** in v1 (später möglich):
- Anstehende Amazon-Termine (Kalender kennt keinen Amazon-Tag; separate Entscheidung nötig)
- Bewertungen-KPI (offene Erstattungen / Profit)
- „Nächster Schritt" je aktivem Produkt (erste offene Checklisten-Position)

## Routing & Navigation

- Neue Seite **`AmazonDashboardPage`** unter `frontend/src/pages/amazon/`,
  gemountet auf **`/amazon`** (bisherige `<Navigate>`-Weiterleitung entfällt).
- „Entwicklung" bleibt unverändert auf `/amazon/entwicklung` inkl. aller Unterrouten
  (`/checkliste`, `/markenname`, `products/:id`, …).
- **Sidebar:** Klick auf den Parent „Amazon" navigiert nach `/amazon` **und** klappt
  das Untermenü auf. Die vorhandenen Unterpunkte bleiben unverändert.
- **Auto-Expand-Fix:** Die Amazon-Gruppe klappt sich auf, wenn `location.pathname`
  mit `/amazon` beginnt (analog zur bestehenden DJ-Logik in `Sidebar.tsx`).
- Header-Titel-Mapping (`pageNames` in `navConfig.ts`) um `/amazon` = „Amazon-Dashboard"
  ergänzen.

## Seiten-Layout (Reihenfolge von oben)

1. **Header** — Titel „Amazon-Dashboard" / Untertitel „Dein Produktentwicklungs-Überblick",
   `shopping_cart`-Icon. Rechts Schnellaktion **„+ Produkt direkt entwickeln"**, öffnet den
   bestehenden `NewProductDialog`.
2. **Status-KPIs** — 4 klickbare KPI-Kacheln: Interessant / Aktiv / Bestehend / Verworfen
   (Zahlwert + Uppercase-Label + Icon). Klick → `/amazon/entwicklung`.
3. **Aktive Produkte mit Fortschritt** — Karten der Produkte mit `status='aktiv'`, je Karte
   Bild/Name + zwei Fortschrittsbalken: Checkliste (erledigt/gesamt) und Sourcing (X/9).
   Klick → Produkt-Detail (`/amazon/entwicklung/products/:id`). Leerzustand, wenn keine
   aktiven Produkte.
4. **Offene Amazon-Aufgaben** — Liste offener Aufgaben (Bereich „Amazon", Status nicht in
   `done`/`archived`), sortiert nach Fälligkeit. Je Zeile: Titel, Priorität, Fälligkeitsdatum.
   Klick → Aufgaben-Modul. Leerzustand, wenn keine offenen Aufgaben.
5. **Navigations-Kacheln** (Launchpad) — je eine Kachel für Entwicklung, Checkliste,
   Markenname, Meine Daten mit Icon + Label, verlinkt auf die jeweilige Route.

## Daten / Backend

### Neuer Endpoint `GET /api/amazon/dashboard` (rein lesend)

Liefert in einem Aufruf:

```jsonc
{
  "counts": { "interessant": 0, "aktiv": 1, "bestehend": 0, "verworfen": 0 },
  "active": [
    {
      "id": 12,
      "name": "Rausfallschutz Boxspringbett",
      "has_image": true,
      "checklist": { "done": 3, "total": 8 },
      "sourcing":  { "done": 2, "total": 9 }
    }
  ]
}
```

- `counts`: Aggregation über `amazon_products.status`.
- `active`: alle Produkte mit `status='aktiv'`, je Produkt:
  - `checklist`: erledigte vs. gesamte Items der **produkt-eigenen** Checkliste
    (`is_done`-Summe / Anzahl).
  - `sourcing`: Anzahl gesetzter Sourcing-Checkpoints (`cp_*`, `SOURCING_CP_KEYS`) / 9.
  - `has_image`: ob ein Produktbild hinterlegt ist (für Kartenanzeige).
- Registrierung in `backend/src/app.ts` unter Prefix `/api/amazon` (neue Route-Datei
  `amazon.dashboard.routes.ts` oder Ergänzung einer bestehenden Amazon-Route).
- **Kein Backup nötig** — reine Leseoperation (siehe CLAUDE.md Datensicherheit).

### Bestehende Endpoints

- **Status-KPIs** können alternativ client-seitig aus `GET /products?include_discarded=true`
  abgeleitet werden; werden hier aber der Einfachheit halber aus `counts` des neuen
  Dashboard-Endpoints bedient (eine Quelle).
- **Offene Aufgaben:** `GET /api/tasks?area=Amazon`, client-seitig auf Status nicht in
  `done`/`archived` gefiltert und nach `due_date` sortiert.

### Frontend-Anbindung

- Neuer API-Wrapper in `frontend/src/api/amazon.api.ts`: `getAmazonDashboard()` +
  Typen `AmazonDashboard`, `AmazonDashboardActiveProduct`.
- Neuer Hook `useAmazonDashboard()` (TanStack Query) analog bestehender Amazon-Hooks.
- Aufgaben über den bestehenden Tasks-API-Wrapper.

## Design / Electric Noir

- `PageWrapper` + `.module-card`-Muster wie `DashboardPage.tsx`.
- KPI-Kacheln analog dem KPI-Streifen des Haupt-Dashboards (bzw. `dj/KPICard.tsx` als
  Baustein-Referenz).
- Fortschrittsbalken in den Akzentfarben des Electric-Noir-Systems (keine neuen Farben).
- Echte Umlaute in allen sichtbaren Texten (Ä/Ö/Ü/ä/ö/ü/ß).

## Komponenten-Schnitt (Frontend)

- `AmazonDashboardPage.tsx` — Seiten-Orchestrierung, lädt Dashboard + Aufgaben.
- `AmazonStatusKpis.tsx` — die 4 KPI-Kacheln.
- `AmazonActiveProducts.tsx` — Karten aktiver Produkte inkl. Fortschrittsbalken.
- `AmazonOpenTasks.tsx` — Liste offener Amazon-Aufgaben.
- `AmazonNavTiles.tsx` — Navigations-Kacheln zu den Unterbereichen.

(Feiner Schnitt kann in der Umsetzungsplanung verfeinert werden; Leitlinie: jede
Komponente hat einen klaren Zweck und lässt sich isoliert verstehen.)

## Fehlerbehandlung / Leerzustände

- Lade- und Fehlerzustand für den Dashboard-Endpoint (Skeleton bzw. dezente Fehlermeldung).
- Leerzustände für „Aktive Produkte" und „Offene Aufgaben", wenn nichts vorhanden ist.
- Aufgaben-Abfrage schlägt unabhängig vom Dashboard-Endpoint fehl → Teilanzeige bleibt
  funktionsfähig (getrennte Queries).

## Nicht enthalten / Abgrenzung

- Keine Änderungen an „Entwicklung", Checkliste, Markenname, Meine Daten selbst.
- Keine Schreiboperationen; keine Migration.
- Kein Kalender-/Termine-Feature, kein Bewertungen-KPI (v1-Abgrenzung, siehe Scope).
