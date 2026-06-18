# Amazon „Meine Daten" — Design

**Datum:** 2026-06-18
**Modul:** Amazon (neuer Sidebar-Unterpunkt)
**Status:** Entwurf abgenommen, bereit für Implementierungs-Plan

## Problem / Ziel

Benny will seine persönlichen/geschäftlichen Stammdaten (EORI-Nummer,
Bankverbindung, Steuernummern, Firmen-/Kontaktdaten, Amazon-Konto) an **einem
Ort** hinterlegen — schnell auffindbar (z.B. fürs Importieren/Zoll), mit Schutz
gegen neugierige Blicke am bereits entsperrten Mac.

## Entscheidungen (aus dem Brainstorming)

1. **Ort:** Neuer Sidebar-Unterpunkt **Amazon → „Meine Daten"**, Route
   `/amazon/meine-daten`. Eigene Seite (Electric Noir), Auto-Speicherung.
2. **Schutz:** **PIN/Passwort-Gate** — server-seitig erzwungen (Daten erst nach
   PIN-Prüfung ladbar), nicht nur UI-versteckt. Keine At-Rest-Verschlüsselung
   (bewusst weggelassen, später nachrüstbar).
3. **Felder:** Vier feste Gruppen + beliebig viele **eigene Felder**.
4. **Copy-Buttons** an Werten wie IBAN/EORI.

## PIN-Gate 🔒

- **Einrichtung:** Erste Nutzung → Benutzer legt einen PIN/Passwort fest
  (min. 4 Zeichen). Gespeichert als **bcrypt-Hash** (wie das App-Passwort,
  12 Runden) in `amazon_my_data.pin_hash`.
- **Entsperren:** Beim Öffnen PIN eingeben → `POST /verify-pin` prüft den Hash und
  gibt ein **kurzlebiges Unlock-JWT** zurück (Gültigkeit 60 Min, eigener
  `purpose: 'mydata'`-Claim, signiert mit dem bestehenden JWT-Secret). Das Token
  liegt nur im Speicher (nicht localStorage) → nach Reload/Logout wieder gesperrt.
- **Server-Enforcement:** Die Daten-Routen (`GET/PATCH /amazon/my-data`, Custom-
  Felder) verlangen zusätzlich zum normalen Auth den Header
  `x-mydata-unlock: <unlock-jwt>`. Ohne gültiges Token → `401`. So sind die Daten
  nicht über die API abgreifbar, solange nicht entsperrt wurde.
- **PIN ändern:** `POST /change-pin` mit altem + neuem PIN.
- **PIN vergessen / zurücksetzen:** `POST /reset-pin` verlangt das **App-Login-
  Passwort** (bcrypt-Vergleich gegen `user.password_hash`) und setzt einen neuen
  PIN. So kann jemand am entsperrten Mac den PIN nicht ohne das Login-Passwort
  umgehen.
- **Ehrliche Einordnung (in der Spec dokumentiert, nicht im UI nötig):** Der PIN
  ist ein **Sichtschutz**, keine Verschlüsselung. Die Werte liegen — wie alles in
  der App — als Klartext in der lokalen SQLite-DB (und damit auch im
  Komplett-Backup). Schützt gegen casual snooping, nicht gegen DB-Datei-Diebstahl.

## Felder

**Feste Gruppen** (Spalten in `amazon_my_data`, alle optional/nullable):
- **Steuer & Zoll:** `eori`, `vat_id` (USt-IdNr), `tax_number` (Steuernummer), `finanzamt`
- **Bankverbindung:** `bank_holder`, `iban`, `bic`, `bank_name`
- **Firma & Kontakt:** `name`, `firma`, `adresse`, `email`, `telefon`, `webseite`
- **Amazon-Konto:** `amazon_email`, `amazon_store`, `merchant_token`

**Eigene Felder** (`amazon_my_data_custom`): beliebig viele Zeilen mit `label` +
`value`, anlegbar/löschbar/umsortierbar.

**Copy-Button:** Jedes Wertfeld (feste + eigene) bekommt ein kleines Kopier-Symbol
(Klick → in Zwischenablage, kurzes „kopiert"-Feedback).

## Datenmodell (Backend)

Migration `087_amazon_my_data.sql` (nächste freie Nummer). Single-Row-Muster
(wie `user`, `id = 1` erzwungen):

```
amazon_my_data
  id            INTEGER PRIMARY KEY CHECK (id = 1)
  pin_hash      TEXT             -- bcrypt; NULL = noch kein PIN gesetzt
  eori          TEXT
  vat_id        TEXT
  tax_number    TEXT
  finanzamt     TEXT
  bank_holder   TEXT
  iban          TEXT
  bic           TEXT
  bank_name     TEXT
  name          TEXT
  firma         TEXT
  adresse       TEXT
  email         TEXT
  telefon       TEXT
  webseite      TEXT
  amazon_email  TEXT
  amazon_store  TEXT
  merchant_token TEXT
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch())

amazon_my_data_custom
  id          INTEGER PRIMARY KEY AUTOINCREMENT
  sort_order  INTEGER NOT NULL DEFAULT 0
  label       TEXT    NOT NULL DEFAULT ''
  value       TEXT    NOT NULL DEFAULT ''
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
```

Die Zeile `id=1` wird lazy beim ersten Zugriff angelegt. `PRAGMA foreign_keys`
nicht in der Migration setzen. Kein Bulk-Delete → kein `createBackup`-Aufruf.

## API-Routen

Neuer Router `amazon.mydata.routes.ts`, gemountet unter `/api/amazon`.
Alle Routen liegen hinter dem globalen `verifyToken`. Zusätzlich:

- **PIN-Status:** `GET /amazon/my-data/status` → `{ pinSet: boolean }` (ohne Unlock,
  damit das UI weiß, ob „PIN setzen" oder „PIN eingeben" gezeigt wird).
- `POST /amazon/my-data/set-pin` `{ pin }` — nur wenn noch keiner gesetzt.
- `POST /amazon/my-data/verify-pin` `{ pin }` → `{ token }` (Unlock-JWT 60 Min).
- `POST /amazon/my-data/change-pin` `{ oldPin, newPin }`.
- `POST /amazon/my-data/reset-pin` `{ password, newPin }` (App-Login-Passwort).
- **Daten (verlangen `x-mydata-unlock`):**
  - `GET /amazon/my-data` → feste Felder + `custom: [...]`.
  - `PATCH /amazon/my-data` (Teil-Update der festen Felder).
  - `POST /amazon/my-data/custom`, `PATCH /amazon/my-data/custom/:id`,
    `DELETE /amazon/my-data/custom/:id`, `POST /amazon/my-data/custom/reorder`.

Unlock-Middleware `requireMyDataUnlock`: liest `x-mydata-unlock`, verifiziert JWT
mit `purpose==='mydata'`, sonst `401`.

## Frontend

- Sidebar: `navConfig.ts` → Amazon-`subItems` um `{ path: '/amazon/meine-daten',
  label: 'Meine Daten', icon: 'lock' }` ergänzen; `pageNames` ergänzen.
- Route in `routes.tsx`: `/amazon/meine-daten` → `AmazonMyDataPage`.
- `frontend/src/pages/amazon/AmazonMyDataPage.tsx`:
  - Lädt PIN-Status. Zustand: **gesperrt** (PIN setzen ODER eingeben) / **entsperrt**.
  - **PIN-Gate-Komponente:** Eingabe + „Entsperren" / „PIN festlegen"; Link „PIN
    vergessen" → Dialog mit App-Passwort + neuem PIN.
  - **Entsperrt:** Formular-Gruppen (Steuer & Zoll, Bank, Firma & Kontakt,
    Amazon-Konto) mit Auto-Save on blur + Copy-Buttons; darunter „Eigene Felder"-
    Liste (Bezeichnung + Wert, hinzufügen/löschen/umsortieren) + „PIN ändern".
  - Unlock-Token im React-State/Context; alle Daten-Requests senden den Header.
- API-Funktionen + Hooks (`frontend/src/api/amazon.api.ts` + ggf.
  `hooks/amazon/useMyData.ts`); ein `apiClient`-Helper, der den Unlock-Header setzt.

## UX-Regeln (Projekt-Konventionen)

- Echte Umlaute (Ä/Ö/Ü/ä/ö/ü/ß).
- Bestätigung vor dem Löschen eigener Felder.
- Auto-Speicherung; keine extra „Speichern"-Buttons (außer PIN-Aktionen).
- Copy-Feedback kurz sichtbar.

## Testkriterien (UAT)

1. Erstaufruf ohne PIN → „PIN festlegen" erscheint; nach Festlegen ist der Bereich
   entsperrt.
2. Reload → wieder gesperrt; mit PIN entsperrbar; falscher PIN → Fehlermeldung.
3. Feste Felder (EORI, IBAN, …) eintragen → Auto-Save; Reload (+ entsperren) zeigt
   gespeicherten Stand.
4. Copy-Button kopiert den Wert in die Zwischenablage.
5. Eigenes Feld anlegen, befüllen, umsortieren, löschen (mit Bestätigung).
6. PIN ändern (mit altem PIN); PIN zurücksetzen (mit App-Passwort).
7. Daten-API ohne gültiges Unlock-Token → `401` (server-seitiger Schutz greift).

## Offen / bewusst NICHT enthalten (YAGNI)

- At-Rest-Verschlüsselung der Felder (späteres Upgrade möglich).
- Mehrere Bankkonten als eigene Struktur (zweites Konto via „Eigene Felder").
- Übernahme der Daten in PDFs/andere Module (vorerst nur Speicher-Ort).
