# Amazon Hersteller — kompakte Liste + eigene Detailseite

**Status:** Entwurf — vom Nutzer bestätigt („weiter")
**Datum:** 2026-06-08
**Modul:** Amazon Hersteller-Bereich (reines Frontend-Refactoring)

---

## Ziel

Die Hersteller-Sektion auf der Produkt-Detailseite ist aktuell unübersichtlich, weil alle Hersteller
voll ausgeklappt untereinander stehen. Stattdessen: eine **kompakte Liste**; ein Klick auf einen
Hersteller öffnet eine **eigene Detailseite** (eigene URL, Zurück-Button) mit allen Daten dieses
Herstellers. Der **Angebotsvergleich** bleibt in der Übersicht.

## Entscheidungen (aus der Diskussion)
- **Eigene Seite/URL** (echte Route) mit Zurück-Button; Browser-Zurück funktioniert.
- **Listen-Zeile mit Kurzinfos:** Name + Ansprechpartner + Anzahl Angebote + günstigster EUR-Preis
  + ⭐ wenn ein Angebot als „aktuell" markiert ist.
- **Reines Frontend** — keine Backend-/DB-Änderung.

## Scope

### In Scope
- Neue Route `/amazon/entwicklung/products/:id/hersteller/:mId` → Seite `ManufacturerDetailPage`.
- `ManufacturersSection` wird zur kompakten, klickbaren Liste (mit Drag-Sortierung, „Hersteller
  hinzufügen", Kurs-Feld, Angebotsvergleich).
- Stammdaten-Bearbeitung + Angebote (inkl. Dateien/Stern/Währung) wandern auf die Detailseite.

### Explizit out of Scope
- Keine Backend-Routen/Migrationen, keine neuen Datenfelder.
- Kein Redesign der Angebots-Zeile selbst (bleibt wie gebaut).
- Vergleichstabelle bleibt unverändert (nur Position: weiterhin in der Sektion/Übersicht).

## Datensicherheit
Rein visuelles Refactoring; keine Datenänderung. Löschen eines Herstellers nutzt die bestehende,
bestätigte Route (mit Confirm-Dialog).

---

## Routing

`frontend/src/routes/routes.tsx`: neue Route hinzufügen (neben
`/amazon/entwicklung/products/:id`):
```tsx
{ path: '/amazon/entwicklung/products/:id/hersteller/:mId', element: <ManufacturerDetailPage /> },
```
(React Router v7 rankt nach Spezifität — Reihenfolge unkritisch.) Import der Seite ergänzen.

## Komponenten

### Neu: `frontend/src/pages/amazon/ManufacturerDetailPage.tsx`
- `useParams<{ id: string; mId: string }>()` → `productId`, `mId` (Integer); bei ungültig →
  Hinweis + Link zur Produktseite.
- `useManufacturers(productId)`; Hersteller per `mId` finden. Lade-/Fehler-/Nicht-gefunden-Zustände
  (bei „nicht gefunden" Link zurück zur Produktseite).
- Layout in `PageWrapper` (wie `AmazonProductDetailPage`):
  - **Header**: Zurück-Button (`navigate('/amazon/entwicklung/products/' + productId)`, `arrow_back`)
    + Titel = Hersteller-Name (oder „Hersteller").
  - **Stammdaten** (Inline-Edit, commit-on-blur, lokaler State je Feld mit Reset bei Prop-Wechsel —
    Logik aus der bisherigen `ManufacturerCard` übernehmen): Name, Ansprechpartner, Adresse
    (`textarea`), E-Mail, Webseite, Notizen (`textarea`). `useUpdateManufacturer`.
  - **Angebote**: `<ManufacturerOffers productId={productId} mId={mId} offers={manufacturer.offers} />`
    (unverändert; enthält Währung, Stern, Datei-Upload).
  - **Löschen**: Button mit Bestätigungsdialog (gleicher `DeleteManufacturerDialog`-Stil); bei
    Bestätigung `useDeleteManufacturer().mutate(mId)` und danach
    `navigate('/amazon/entwicklung/products/' + productId)`.

### Umbau: `frontend/src/components/amazon/manufacturers/ManufacturersSection.tsx`
- Statt `ManufacturerCard`-Liste eine **kompakte Liste** klickbarer Zeilen rendern. Pro Zeile:
  - **Drag-Griff** (Nummern-Badge, native Pointer-Events wie bisher) — nur dieser Bereich startet das
    Sortieren; der Rest der Zeile navigiert.
  - **Klickbarer Bereich** (Button/`onClick`) → `navigate('/amazon/entwicklung/products/' + productId
    + '/hersteller/' + m.id)`: zeigt Name (fett), Ansprechpartner, „N Angebote" (`m.offers.length`),
    günstigster EUR-Preis, ⭐ wenn `m.offers.some(o => o.is_latest)`.
  - Günstigster EUR-Preis: `min` über `eurPreis(o, rate)` aller Angebote (nur nicht-null); formatiert
    „xx,xx €"; keiner parsebar → „—". `rate = parsePreis(data.settings.usd_eur_rate)`.
- **Kurs-Feld** „1 USD = X €" bleibt oben (wie jetzt).
- **„Hersteller hinzufügen"**: `useCreateManufacturer().mutate(undefined, { onSuccess: (m) =>
  navigate('/amazon/entwicklung/products/' + productId + '/hersteller/' + m.id) })` — legt an und
  springt direkt in die neue Detailseite.
- **Angebotsvergleich** bleibt darunter: `<ManufacturerComparison manufacturers={manufacturers}
  rate={rate} />`.
- Drag-Reorder-Logik (lokaler `order`-State, down/enter/up, `useReorderManufacturers`) bleibt; das
  Klick-Navigieren darf NICHT durch den Drag-Griff ausgelöst werden (Griff ist eigenes Element neben
  dem klickbaren Bereich).
- Der Lösch-/Bestätigungs-Dialog der Sektion entfällt hier (Löschen passiert auf der Detailseite).

### Entfällt/wandert: `frontend/src/components/amazon/manufacturers/ManufacturerCard.tsx`
- Die Stammdaten-Bearbeitung wird in `ManufacturerDetailPage` übernommen. `ManufacturerCard` wird
  nicht mehr von der Sektion verwendet. Die Datei kann entfernt werden (oder bleibt ungenutzt) —
  empfohlen: **entfernen**, um Toten Code zu vermeiden.

## Fehlerbehandlung
- Ungültige/fehlende `id`/`mId` → Hinweis + „Zurück zur Übersicht/Produktseite".
- Hersteller (mId) nicht in der Liste → „Hersteller nicht gefunden" + Link zur Produktseite (z. B.
  nach Löschen, wenn jemand die URL erneut öffnet).

## Tests
Reines Frontend ohne Unit-Test-Harness für Komponenten:
- `tsc --noEmit` + `vite build` grün.
- **Manuelles UAT:**
  1. Produktseite → Hersteller-Sektion zeigt **kompakte Liste** (nicht mehr alles ausgeklappt) mit
     Name/Ansprechpartner/„N Angebote"/EUR-Preis/⭐.
  2. Klick auf eine Zeile → eigene Detailseite (URL ändert sich); Stammdaten + Angebote sichtbar;
     Bearbeiten speichert.
  3. Zurück-Button + Browser-Zurück → zurück zur Produktseite, Liste unverändert.
  4. „Hersteller hinzufügen" → springt direkt in die neue Detailseite.
  5. Auf der Detailseite löschen (mit Bestätigung) → zurück zur Produktseite, Hersteller weg.
  6. Drag-Sortierung in der Liste funktioniert weiter; Angebotsvergleich unverändert sichtbar.

## Sicherheit
Keine neuen Endpunkte; bestehende JWT-geschützte Routen. Keine Datenrisiken (visuelles Refactoring).
