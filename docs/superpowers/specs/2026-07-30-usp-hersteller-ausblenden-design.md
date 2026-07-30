# USP-Hersteller aus-/einblenden

**Datum:** 2026-07-30 · **Status:** Von Benny freigegeben

## Problem

Die USP-Vergleichsmatrix zeigt eine Spalte pro Hersteller. Hersteller, die aktuell
nicht angefragt werden (z.B. Taizhou/Eiliien, Guangzhou/Cindy), stehen weiter im
Vergleich und stören den 1:1-Vergleich der wirklich relevanten Hersteller. Benny
braucht eine Möglichkeit, einzelne Hersteller aus der USP-Ansicht auszublenden —
dauerhaft, ohne sie im großen Hersteller-Bereich zu löschen.

## Entscheidungen (mit Benny geklärt)

1. **Dauerhaft gespeichert** — nicht nur Session-Filter.
2. **Überall im USP** — ausgeblendeter Hersteller verschwindet aus Vergleichsmatrix
   UND aus den PDF-/Vorschau-/Excel-Dropdowns. Bleibt im großen Hersteller-Bereich
   voll erhalten.
3. **Bedienung: Auge-Icon an der Kachel** — ausgeblendete rutschen abgedimmt ans
   Ende der Kachelreihe mit „einblenden"-Klick.

## Datenmodell

Neues Feld `hidden INTEGER NOT NULL DEFAULT 0` auf `amazon_usp_manufacturers`
(nicht auf `amazon_manufacturers` — „ausgeblendet" ist eine reine USP-Ansichts-
Entscheidung). Migration 125, reines `ALTER TABLE ADD COLUMN` (additiv, kein
Rebuild, kein `createBackup` nötig, kein `PRAGMA foreign_keys`).

**Sync-Verträglichkeit:** `syncManufacturersFromHersteller` fasst `hidden` nie an —
neue gespiegelte Hersteller starten sichtbar (Default 0), die Aus-/Einblend-
Entscheidung überlebt Reload und Nachziehen aus dem Hersteller-Bereich.

## Backend (amazon.usp.routes.ts)

- PATCH `/products/:id/usp/manufacturers/:mId` nimmt zusätzlich `hidden` (0/1)
  entgegen (Validierung: nur 0 oder 1), analog zu den bestehenden Feldern.
- `loadManufacturers` liefert `hidden` automatisch mit (`SELECT *`).

## Frontend

**API-Typen (amazon.api.ts):** `UspManufacturer` bekommt `hidden: number`;
`UspManufacturerPatch` erlaubt zusätzlich `hidden`.

**UspSection.tsx:** `const sichtbare = data.manufacturers.filter(m => !m.hidden)`.
An **Vergleichendes** wird nur `sichtbare` gegeben:
- `UspMatrix` (Spalten)
- die beiden PDF-/Vorschau-/Excel-Dropdowns (oben Zeile ~156, unten ~202)

Randfall: sind alle ausgeblendet, greift die bestehende Guard (`manufacturers.length
=== 0` → Matrix rendert nichts). Kacheln bleiben sichtbar → immer rückholbar.

**UspManufacturers.tsx:** bekommt weiterhin die **volle Liste**.
- Sortierung: sichtbare zuerst, ausgeblendete danach.
- Jede Kachel: Auge-Icon (`visibility` / `visibility_off`) oben rechts, Klick ruft
  `update.mutate({ mId, patch: { hidden: m.hidden ? 0 : 1 } })`.
- Ausgeblendete Kacheln: `opacity ~0.45`, durchgestrichenes Auge, sonst identisch.

Echte Umlaute. Keine neuen Confirm-Dialoge nötig (Ausblenden ist reversibel und
nicht destruktiv).

## Nicht im Scope

- Ausblenden im großen Hersteller-Bereich
- Bulk-Aktionen / Mehrfachauswahl
- Eigene Sortierung der ausgeblendeten untereinander
