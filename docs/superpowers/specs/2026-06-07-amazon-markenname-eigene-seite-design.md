# Amazon — Markenname als eigenständige Seite (statt pro Produkt-Detailseite)

**Status:** Entwurf — bereit zur Review
**Datum:** 2026-06-07
**Modul:** Amazon Entwicklung

---

## Ziel

Die Sektion „Markenname" liegt heute als Akkordeon **innerhalb jeder Produkt-Detailseite**
(`/amazon/entwicklung/products/:id`). Sie soll von dort **verschwinden** und stattdessen als
**eigenständige Seite** mit eigenem Sidebar-Punkt unter Amazon erreichbar sein — neben
„Entwicklung" und „Checkliste".

Auf der neuen Seite wählt man oben per **Dropdown** ein Produkt; darunter erscheint der
**unveränderte** Markenname-Bereich genau dieses Produkts.

## Datensicherheit (oberste Priorität)

Die vorhandenen Markennamen sind **echte, produktive Daten** und müssen **vollständig
unverändert** erhalten bleiben.

- Das Datenmodell bleibt **identisch**: Markennamen sind weiter an `product_id` gebunden
  (`amazon_brand_name` 1:1, `amazon_brand_name_candidates` 1:n).
- **Keine** Migration, **kein** DROP, **kein** Verschieben/Umschreiben von Datensätzen.
- **Keine** Backend-Änderung — die Routen `/api/amazon/products/:id/brand…` bleiben wie sie sind.
- Das Entfernen der Sektion aus der Produktseite ist **reines Frontend/UI** und berührt keine
  Datenbankzeile. Dieselben Datensätze werden über die neue Seite weiter angezeigt und bearbeitet.

Daraus folgt: Es ist **kein** `createBackup`-Aufruf nötig (keine destruktive Bulk-Operation,
keine Migration).

## Scope

### In Scope
- Neue Seite `frontend/src/pages/amazon/AmazonBrandPage.tsx` mit Produkt-Dropdown + Einbindung
  der bestehenden `BrandNameSection`.
- Neue Route `/amazon/entwicklung/markenname` in `frontend/src/routes/routes.tsx`.
- Sidebar-Unterpunkt „Markenname" unter Amazon (`navConfig.ts`) + `pageNames`-Eintrag.
- Entfernen der Markenname-Sektion aus `AmazonProductDetailPage.tsx`.
- Entfernen von `'brand'` aus `useDetailSectionOrder` (`DEFAULT_ORDER` + `DetailSectionId`).

### Explizit out of Scope
- Globale (produkt-übergreifende) Markennamen-Liste — bewusst verworfen, bleibt pro Produkt.
- Produkt-Kachel-/Listen-Auswahl — es wird ein einfaches Dropdown.
- Jede Backend- oder Datenbank-Änderung.
- Änderungen am Inhalt der Markenname-Funktion selbst (Tabelle, Favoriten, PDF, Sterne-Ranking
  bleiben 1:1).

## A) Neue Seite `AmazonBrandPage`

Datei `frontend/src/pages/amazon/AmazonBrandPage.tsx`.

**Verhalten:**
- Lädt Produkte via `useAmazonProducts(true)` (gleiche Quelle wie Übersicht/Detailseite).
- Kopfbereich analog `AmazonOverviewPage`: Icon-Kachel mit `label` (pink-Akzent `#f472b6`),
  Titel „Markenname", Untertitel z. B. „Markennamen je Produkt recherchieren".
- **Produkt-Dropdown** (`<select>` im Electric-Noir-Stil): Optionen = alle Produkte, sortiert wie
  in der Liste geliefert; Label = `product.name`.
  - Ausgewählte `productId` wird in `localStorage` unter `amazon.brand.selected-product`
    gemerkt und beim Laden wiederhergestellt.
  - Default-Auswahl beim ersten Besuch: erstes Produkt der Liste. Ist die gemerkte ID nicht mehr
    vorhanden (Produkt gelöscht), fällt die Auswahl auf das erste Produkt zurück.
- Unter dem Dropdown:
  - Wenn ein Produkt gewählt ist: `<BrandNameSection productId={selected.id} productName={selected.name} />`
    — also exakt der bestehende Bereich inkl. Notizen, Favoriten, Tabelle, Sterne-Ranking, PDF-Export.
  - Wenn **keine** Produkte existieren: dezenter Hinweis „Noch keine Produkte vorhanden. Lege zuerst
    unter Entwicklung ein Produkt an." mit Link auf `/amazon/entwicklung`.
- Loading-/Error-States analog `AmazonOverviewPage` (Lade-Text bzw. „Erneut laden"-Button).
- Seite in `PageWrapper` gehüllt (wie die übrigen Amazon-Seiten).

**Wiederverwendung:** `BrandNameSection` wird **unverändert** eingebunden. Sie rendert weiterhin
ihren eigenen `SectionHeader` mit Status-Badge und Expand-Toggle (Persistenz `brand.is_expanded`
bleibt erhalten). Kein neues Brand-UI nötig.

## B) Routing

In `frontend/src/routes/routes.tsx` neue Route ergänzen, in der Nähe der bestehenden Amazon-Routen:

```tsx
{ path: '/amazon/entwicklung/markenname', element: <AmazonBrandPage /> },
```

Import von `AmazonBrandPage` oben hinzufügen. Reihenfolge unkritisch — der Pfad kollidiert nicht
mit `/products/:id` (statischer Pfad).

## C) Sidebar + Header-Titel

In `frontend/src/components/layout/navConfig.ts`:

- Im Amazon-`subItems`-Array nach „Checkliste" ergänzen:
  ```ts
  { path: '/amazon/entwicklung/markenname', label: 'Markenname', icon: 'label' },
  ```
- In `pageNames` ergänzen:
  ```ts
  '/amazon/entwicklung/markenname': 'Markenname',
  ```

## D) Markenname-Sektion aus der Produkt-Detailseite entfernen

In `frontend/src/pages/amazon/AmazonProductDetailPage.tsx`:
- Import von `BrandNameSection` entfernen.
- Im `DraggableSectionList`-`render` den `if (id === 'brand') …`-Zweig entfernen. Es bleiben
  `sourcing` und `checklist`.

In `frontend/src/hooks/amazon/useDetailSectionOrder.ts`:
- `DEFAULT_ORDER` von `['sourcing', 'brand', 'checklist']` auf `['sourcing', 'checklist']` ändern.
- `DetailSectionId` leitet sich daraus ab → `'brand'` fällt automatisch raus.
- Die bestehende `readOrder`-Logik filtert ungültige Einträge bereits heraus: ein in `localStorage`
  gespeichertes altes `'brand'` wird beim Einlesen ignoriert (nicht mehr in `DEFAULT_ORDER`), daher
  kein Migrationsschritt nötig und keine kaputte Sortierung.

`BrandNameSection`, `BrandNameTable`, `BrandFavoritesPanel`, `BrandNotes`, `useBrand`,
`exportBrandPdf` etc. bleiben **bestehen** (werden jetzt von `AmazonBrandPage` statt von der
Detailseite genutzt). Keine Komponente wird gelöscht.

## Visual Design

- Pink-Akzent `#f472b6` (wie bisher die Brand-Sektion), Icon `label`.
- Dropdown im bestehenden Input-Stil (`var(--color-surface-container-low/high)`, abgerundete Ecken,
  heller Border), konsistent mit anderen Amazon-Controls.
- Kopf-Layout analog `AmazonOverviewPage` (Icon-Kachel + Titel + Untertitel).

## Fehlerbehandlung

- Produkte-Load-Fehler: Inline-Fehler + „Erneut laden" (wie Übersicht).
- Keine Produkte: freundlicher Leerzustand mit Link auf Entwicklung.
- Gemerkte `productId` nicht mehr vorhanden: stiller Fallback auf erstes Produkt.
- Brand-Daten-Load/Save: unverändert über `BrandNameSection` (`AutosaveIndicator`,
  „Erneut laden" innerhalb der Sektion).

## Tests / Manuelles UAT

Kein Backend betroffen → kein neuer Backend-Test nötig. Verifikation manuell:

1. Sidebar zeigt unter Amazon den neuen Punkt „Markenname" (neben Checkliste).
2. Klick öffnet `/amazon/entwicklung/markenname`; Header zeigt „Markenname".
3. Dropdown listet alle Produkte; Auswahl „Rausfallschutz Boxspringbett" zeigt **exakt die
   bisherigen, echten Markennamen-Daten** dieses Produkts (Tabelle, Favoriten, Sterne, Notizen).
4. Bearbeiten (Name, Sterne, Favorit, Notizen) speichert wie zuvor; PDF-Export funktioniert.
5. Seite verlassen und zurückkehren → zuletzt gewähltes Produkt ist wieder vorausgewählt.
6. Produkt-Detailseite (`/amazon/entwicklung/products/:id`) zeigt **nur noch** Sourcing und
   Checkliste — keine Markenname-Sektion mehr.
7. Neues Produkt anlegen → Detailseite zeigt keine Markenname-Sektion.
8. Datenkontrolle: vorhandene Markennamen sind vollständig und unverändert vorhanden.

## Offene Punkte / später
- Optional: Schnell-Link „Markenname bearbeiten" von der Produkt-Detailseite zur neuen Seite mit
  vorausgewähltem Produkt (nicht in diesem Schritt).
