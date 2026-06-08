# Amazon Hersteller — Kurs EUR→USD umdrehen + Live-Kurs

**Status:** Entwurf — vom Nutzer bestätigt
**Datum:** 2026-06-08
**Modul:** Amazon Hersteller-Bereich (Kurs/Umrechnung)

---

## Ziel
Das Kurs-Feld dreht von „1 USD = X €" auf **„1 EUR = X $"** (so denkt der Nutzer; z. B. 1 EUR =
1,15 USD). Die EUR-Umrechnung im Vergleich wird entsprechend angepasst (USD-Preis **÷** Kurs).
Zusätzlich ein **„↻ Aktuell holen"-Button**, der den aktuellen EZB-Referenzkurs (EUR→USD) aus dem
Internet holt und einträgt, mit Anzeige **„Stand: <Datum>"**. Manuell überschreibbar bleibt es.

## Entscheidungen
- **Richtung EUR→USD.** Der vorhandene gespeicherte Wert (`usd_eur_rate`, z. B. „1,15") wird ab jetzt
  als **1 EUR = 1,15 USD** interpretiert — keine Datenmigration nötig, nur Bedeutung + Label + Mathe
  ändern. (Spaltenname bleibt `usd_eur_rate` aus Bestandsgründen; Kommentar im Code.)
- **Live-Kurs: Button + Datum** (kein Auto-Update). Quelle: frankfurter.app (EZB), kein Key.

## Scope
### In Scope
- Umrechnungs-Mathe drehen; Label „1 EUR = X $".
- Backend: `GET /amazon/fx/eur-usd` (holt Live-Kurs); Settings um `rate_date` erweitern.
- Migration 082: Spalte `rate_date` in `amazon_manufacturer_settings`.
- Frontend: Label, Button „↻ Aktuell holen", „Stand: <Datum>".
### Out of Scope
- Automatisches Update beim Öffnen (bewusst nicht).
- Weitere Währungen/Quellen.

## Datensicherheit
Additiv (eine Spalte). Keine Bulk-Operation. Der Live-Abruf ist ein reiner GET nach außen (nur auf
Nutzer-Klick), kein Datenabfluss.

---

## Datenmodell
### Migration 082 — `082_amazon_manufacturer_settings_rate_date.sql`
```sql
ALTER TABLE amazon_manufacturer_settings ADD COLUMN rate_date TEXT;
```
`rate_date` = Datum des zuletzt per Live-Abruf geholten Kurses (z. B. „2026-06-06"); bei manueller
Eingabe NULL.

## Backend (`amazon.manufacturers.routes.ts`)
- **`GET /fx/eur-usd`** (→ `/api/amazon/fx/eur-usd`): `fetch('https://api.frankfurter.app/latest?from=EUR&to=USD')`,
  JSON `{ rates: { USD }, date }`. Antwort `{ rate: number, date: string }`. Bei Fehler/Timeout/kein
  USD → `502 { error: 'fx unavailable' }`. (Node-globales `fetch`.)
- **Settings-PATCH** (`/products/:id/manufacturers/settings`) erweitern: Body darf zusätzlich
  `rate_date` (string|null, getrimmt, max 30) enthalten. **Verhalten:** Wenn `rate_date` im Body
  vorhanden → setzen (string oder null). Wenn **nicht** vorhanden → `rate_date = NULL` setzen (eine
  manuelle Kurs-Eingabe löscht die Live-Quelle). `usd_eur_rate` wie bisher. Antwort `{ settings }`
  enthält `rate_date`.
- `SettingsRow`-Interface + GET-Payload: `rate_date: string | null` (über `SELECT *`).

## Frontend
### API (`amazon.api.ts`)
- Settings-Typ überall erweitern: `{ usd_eur_rate: string | null; rate_date: string | null }`
  (in `ManufacturersPayload.settings` und im Rückgabetyp von `updateManufacturerSettings`).
- `updateManufacturerSettings(productId, usdEurRate, rateDate?)` → schickt
  `{ usd_eur_rate, rate_date }` (rate_date optional; weglassen ⇒ Server setzt null).
- Neue Funktion `fetchEurUsdRate(): Promise<{ rate: number; date: string }>` → `GET /amazon/fx/eur-usd`.

### Hooks (`useManufacturers.ts`)
- **`eurPreis` umdrehen:** Kurs ist jetzt EUR→USD.
  ```ts
  export function eurPreis(offer, rate) {
    const p = parsePreis(offer.preis);
    if (p === null) return null;
    if (offer.currency === 'EUR') return p;
    if (rate === null || rate === 0) return null;
    return p / rate;          // USD ÷ (EUR→USD-Kurs) = EUR
  }
  ```
- `useUpdateManufacturerSettings` so anpassen, dass es `{ usdEurRate, rateDate? }` annimmt und an die
  API durchreicht (oder zwei Hooks: manuell vs. live). Empfehlung: Mutation nimmt Objekt
  `{ usdEurRate: string; rateDate?: string | null }`.

### `ManufacturersSection.tsx` (Kurs-Feld)
- Label **„1 EUR ="** … Suffix **„$"** (statt „1 USD =" … „€").
- onBlur (manuell): `updateSettings.mutate({ usdEurRate: rateInput })` (ohne rateDate ⇒ Quelle wird
  gelöscht).
- **Button „↻ Aktuell holen"**: ruft `fetchEurUsdRate()`; bei Erfolg
  `updateSettings.mutate({ usdEurRate: String(rate), rateDate: date })`. Ladezustand + bei Fehler
  kleiner Hinweis „Kurs nicht erreichbar (offline?)".
- **„Stand: <rate_date>"** anzeigen, wenn `data.settings.rate_date` gesetzt.
- `rate = parsePreis(data.settings.usd_eur_rate)` unverändert an `ManufacturerComparison`.

## Fehlerbehandlung
- Live-Abruf offline/Fehler → 502 → Frontend zeigt dezenten Hinweis, Feld bleibt unverändert.
- Kurs 0/leer → USD-Angebote im Vergleich „—" (Division vermieden).

## Tests
### Backend
- `GET /fx/eur-usd`: `global.fetch` mocken (vi) → liefert `{ rates: { USD: 1.0865 }, date: '2026-06-06' }`
  → Route gibt `{ rate: 1.0865, date: '2026-06-06' }`. Fetch wirft/!ok → 502.
- Settings-PATCH: `rate_date` mitsenden → gespeichert + im GET; PATCH ohne `rate_date` → `rate_date`
  wird null (Live-Quelle gelöscht).
### Frontend
`tsc` + `vite build`; manuelles UAT:
1. Feld zeigt „1 EUR = [1,15] $". Vergleich: USD-Angebot 1000 ÷ 1,15 = 869,57 € (EUR-Spalte).
2. „↻ Aktuell holen" füllt den aktuellen Kurs + „Stand: <Datum>". Offline → Hinweis.
3. Manuelles Überschreiben entfernt „Stand"-Anzeige.

## Sicherheit
Live-Abruf nur ausgehend, nur auf Klick. Settings-Route hinter JWT. Prepared Statements.
