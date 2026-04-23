# DJ-Modul — Fachliche Spezifikation

Dies ist die konsolidierte Spezifikation. Sie enthält alle Features aus der ursprünglichen Anforderung plus die in Phase 1 bestätigten Erweiterungen.

---

## Übersicht der Seiten

Das DJ-Modul hat **9 Unterseiten**, erreichbar über den Sidebar-Reiter "DJ":

1. Übersicht (Dashboard)
2. Events & Anfragen
3. Angebote
4. Rechnungen
5. Kunden
6. Leistungen & Pakete
7. Fahrten
8. Buchhaltung
9. Einstellungen DJ

---

## Seite 1 — DJ Übersicht (Dashboard)

### KPI-Kacheln (3er Grid auf Desktop, 2er auf Tablet, 1er auf Mobile)

**Reihe 1:**
- 📅 **Termine gesamt** (alle Events im ausgewählten Jahr)
- 📬 **Offene Anfragen** (Status: `neu`, `in_bearbeitung`)
- 📄 **Angebote ausstehend** (Status: `gesendet`, noch keine Reaktion)

**Reihe 2:**
- 💬 **Offene Vorgespräche** (Events mit Status `vorgespraech_vereinbart`)
- 🎵 **Gespielte Veranstaltungen YYYY** (Status: `abgeschlossen`), mit Liste der letzten 2–3
- 💶 **Umsatz YYYY** (Summe bezahlter Rechnungen + erwarteter Umsatz aus bestätigten Events)

**Reihe 3:**
- 🔴 **Unbezahlte Rechnungen** (Summe, Link zu Buchhaltung)
- 📈 **Bestätigte zukünftige Einnahmen** (bestätigte Events, noch nicht bezahlt)

### Farbcodierung der Kacheln
- Blau (`primary`) — neutrale Zahlen
- Grün (`secondary`) — Umsatz, Einnahmen
- Rot (`error`) — Unbezahlt, Warnung
- Violett (`tertiary`) — Geplant, Zukunft

### Widgets
- **Auslastung Wochenenden:** Progress-Bar, freie vs. gebuchte Fr/Sa der nächsten 365 Tage
- **Kalender-Heatmap:** 12-Monats-Grid, nur Fr/Sa hervorgehoben; grün=gebucht, grau=frei, violett=Option/Vorgespräch
- **Umsatz-Vorschau:** Balkendiagramm nach Monat (bestätigte Events summiert) — Recharts
- **Jahres-Filter** (Dropdown: aktuelles Jahr default, Vor-/Folgejahr verfügbar)

### Quick-Capture
Oben prominent: `+ Neue Anfrage` — öffnet einen schlanken Dialog mit den Pflichtfeldern Name, Telefon, Datum, Eventart. Nach Speichern Redirect zur Event-Detailseite.

---

## Seite 2 — Events & Anfragen

### Listenansicht
Zwei Darstellungsmodi, umschaltbar:
- **Tabelle** (Standard, default)
- **Kanban** (Spalten = Status, Drag & Drop ändert Status)

Filter oben: Jahr, Status, Eventart, Suchfeld (Name/Location).

### Status-Flow
```
neu → vorgespraech_vereinbart → angebot_gesendet → bestaetigt → abgeschlossen
                                                              ↘ abgesagt
```

### Event-Felder
- **Kontakt:** Verknüpfung zu `customers` (neu erstellbar inline)
- **Eventart:** `hochzeit`, `firmen_event`, `club_bar`, `geburtstag`, `festival`, `sonstige`
- **Datum & Zeiten:** Datum, Beginn, Ende, Aufbauzeit
- **Location:** Name, Adresse, PLZ, Ort (verknüpft zu `locations`-Tabelle für Wiederverwendung)
- **Entfernung** in km — manuell oder per OSRM berechnet
- **Fahrtzeit einfach** in Minuten — manuell oder per OSRM
- **Gästezahl**
- **Ansprechpartner vor Ort:** Name, Telefon, E-Mail
- **Notizen / besondere Wünsche** (Markdown)
- **Status**
- **Timestamps:** created_at, updated_at, status-History in separater Tabelle

### Event-Detailseite
Full-Page, nicht Modal. Sektionen:
1. **Header** mit Status-Pill, "Tage bis Event"-Anzeige (rot bei <14 Tagen ohne Vorgespräch)
2. **Basisdaten** (alle Felder editierbar solange Status ≠ `abgeschlossen`)
3. **Location** mit OSM-Map-Preview (Leaflet), Distanz-Berechnung, Location-Merker
4. **Timeline** (Status-Verlauf, created_at bis jetzt)
5. **Verknüpfte Dokumente** (Angebote, Rechnungen zu diesem Event)
6. **Direktaktionen:** "Angebot erstellen", "Rechnung erstellen", "Als abgeschlossen markieren", "Absagen"
7. **Musikwünsche** (Link zum öffentlichen Wunsch-Portal, später)
8. **Vorgespräch-Fragebogen** (später)

### OSM/OSRM Integration
- Adress-Autocomplete via Nominatim (`https://nominatim.openstreetmap.org`)
- Distanz & Fahrtzeit via OSRM Public (`https://router.project-osrm.org`)
- **Offline-Fallback:** manuelles Eintragen immer möglich
- Ergebnisse in `locations`-Tabelle cachen, damit gleiche Location kein zweites Mal berechnet wird

---

## Seite 3 — Angebote

### Listenansicht
Tabelle mit: Nummer, Kunde, Event, Datum, Status, Summe, Aktionen.
Filter: Jahr, Status, Kunde.
Status: `entwurf`, `gesendet`, `angenommen`, `abgelehnt`, `abgelaufen`.

### Angebot erstellen/bearbeiten (Full-Page)

**Kopfbereich:**
- Kunde (Suchen/Auswählen aus Kundenliste oder neu erstellen)
- Anschrift (auto-fill aus Kundendaten)
- Betreff (z.B. "Angebot AN-1034")
- Angebotsnummer (temporäre ID solange Entwurf, finale `AN-XXXX` erst bei Finalisierung)
- Angebotsdatum
- Gültig bis (default: +30 Tage)
- Referenz/Veranstaltung (Verlinkung zum Event)
- **Entfernung** (km) und **Anzahl Fahrten** (default 2 = hin + zurück)

**Kopf-Text** (editierbares Textfeld mit Template pro Eventart):
```
Standard (Hochzeit):
"Hallo [Vorname],

vielen Dank für Eure Anfrage. Gerne unterbreite ich euch das gewünschte
freibleibende Angebot für euren großen Tag am [Datum]..."
```
Templates liegen in `settings` unter `templates.quote_header.<eventart>`.

**Positionen:**
Tabelle mit Spalten:
`Pos. | Beschreibung | Menge | Einheit | Einzelpreis | USt. | Rabatt | Betrag`

Aktionen:
- `+ Position hinzufügen` (leere Zeile)
- `+ Leistung aus Katalog` (öffnet Suche)
- `+ Paket hinzufügen` (öffnet Paket-Auswahl, expandiert in einzelne Positionen)
- `+ Gesamtrabatt` (prozentual oder Betrag)
- **Toggle Brutto/Netto-Ansicht**

**Fußbereich:**
- Fuss-Text (editierbar, Template)
- Summen-Block: Netto | USt 19% | **Brutto Gesamt**
- Zahlungsbedingungen (Dropdown aus `settings.payment_terms`)

**Aktionen:**
- `Vorschau` — öffnet PDF-Preview als Overlay
- `Als Entwurf speichern`
- `Finalisieren & Versenden` (vergibt `AN-XXXX`, generiert PDF, öffnet E-Mail-Dialog)
- `Drucken` (PDF-Download)
- `→ Rechnung erstellen` (verfügbar ab Status `angenommen`)
- `Duplizieren als Template` (erstellt neuen Entwurf mit gleichen Positionen)

### Autosave
Entwürfe werden alle 10s gespeichert wenn Änderungen vorliegen. Sichtbarer Indikator: "Gespeichert vor 3s".

---

## Seite 4 — Rechnungen

**Struktur weitgehend identisch zu Angeboten**, mit folgenden Unterschieden:

### Felder
- Rechnungsnummer: `RE-XXXX` (nächste nach RE-1060 = RE-1061), **nach Finalisierung unveränderlich**
- Rechnungsdatum
- Lieferdatum (= Eventdatum üblicherweise)
- Zahlungsziel (z.B. 14 Tage ab Rechnungsdatum)
- Zahlungsmethode (PayPal / Überweisung)

### Status-Flow
```
entwurf → offen → teilbezahlt → bezahlt
                ↘ ueberfaellig
                ↘ storniert
```

### GoBD-Regeln (siehe GoBD_RULES.md für Details)
- Nach Finalisierung: API blockiert UPDATE/DELETE, DB-Trigger blockiert als zweite Schicht
- **Stornierung** erzeugt eine neue Rechnung mit negativen Beträgen (Stornorechnung), Referenz auf Original, eigene `RE-XXXX` Nummer. Original bleibt sichtbar mit Status `storniert`.
- **Begrifflich: "Rechnungskorrektur" oder "Stornorechnung"**, nicht "Gutschrift" (Gutschrift ist steuerlich etwas anderes)
- Beim Finalisieren wird ein PDF-Snapshot generiert und dessen SHA256-Hash in `invoices.pdf_hash` gespeichert

### Anzahlungen / Teilzahlungen
- Rechnung kann mehrere `payments`-Einträge haben
- Status `teilbezahlt` wenn Summe(payments) < total
- Status `bezahlt` wenn Summe(payments) >= total
- Summe(payments) > total → Warnung (Überzahlung)

### Mahnwesen
- Überfällige Rechnungen (`ueberfaellig` = offen + due_date < today) werden rot markiert
- Drei-Stufen-Mahnwesen:
  1. **Zahlungserinnerung** (freundlich, 7 Tage nach Fälligkeit)
  2. **1. Mahnung** (14 Tage)
  3. **2. Mahnung** (28 Tage, mit Mahngebühr 5 €)
- Mahnung-Templates in `settings.templates.dunning.*`
- Mahnungen werden als eigene Dokumente mit PDF archiviert

### Layout
Siehe `RECHNUNGS_TEMPLATE.md` für das exakte Layout basierend auf RE-1060.

---

## Seite 5 — Kunden

### Listenansicht
Tabelle: Kundennummer, Name, Firma, Ort, letzter Kontakt, Anzahl Events, Umsatz gesamt.
Filter/Suche: Volltext über Name/Firma/Ort.

### Kundendetail
- Kundennummer (auto, startend bei 1020, da letzte bekannte 1019)
- Name, Firma, Anrede
- Adresse, PLZ, Ort, Land
- Telefon, Mobil, E-Mail, Website
- Notizen (Markdown)
- **Verknüpfte Events** (Liste, sortiert nach Datum)
- **Verknüpfte Angebote** (Liste)
- **Verknüpfte Rechnungen** (Liste)
- **Statistik:** Anzahl Events, Gesamt-Umsatz, Wiederbuchungs-Indikator

### Import
CSV-Import für SevDesk-Migration. Mapping-UI für Spaltenzuordnung. Duplikat-Erkennung über Name+E-Mail.

---

## Seite 6 — Leistungen & Pakete

### Buchungspakete
Karten-Grid mit Paket-Name, Preis, Anzahl enthaltener Leistungen.
Klick öffnet Paket-Detail (rechte Seite/Drawer): enthaltene Leistungen, Preis, Beschreibung, Bearbeiten.

**Initial-Pakete** (siehe `BUSINESS_DATA.md`):
- Kofferjob — 600,00 € — 4 Leistungen
- Grundpaket bis 80 Gäste — 1.200,00 € — 10 Leistungen
- Grundpaket bis 150 Gäste — 1.400,00 € — 10 Leistungen
- Club Upgrade — 200,00 € — 3 Leistungen

### Leistungskatalog
Kategorisiert nach: Audio, Licht, Effekte, DJ-Services, Sonstiges.
Tabelle mit Name, Kategorie, Einheit, Preis, Aktiv/Inaktiv-Toggle.

**Preis-Versionierung:** Alte Leistungen werden nie im Preis geändert. Bei Preisänderung wird eine neue Version angelegt, die alte auf `active=false` gesetzt. So bleiben alte Angebote/Rechnungen referenzierbar.

### Leistung erstellen/bearbeiten
Modal mit: Kategorie (Dropdown), Name, Beschreibung, Einheit (Stück, Pauschal, Stunde), Preis netto.

---

## Seite 7 — Fahrten

### KPI-Kacheln
- Fahrten gesamt (Jahr)
- Gefahrene Kilometer (Hin + Rück)
- Durchschnitt pro Fahrt
- **Absetzbarer Wert gesamt:** km × 0,30 € (Kilometerpauschale Dienstreisen)

### Fahrten-Tabelle
Spalten: Datum | Veranstaltung | Eventart | Einfache Strecke | Fahrtzeit (einfach) | Gesamt (Hin+Rück) | Absetzbarer Wert

Eventart als farbige Pills (ohne Emerald):
- Hochzeit → `primary/20`
- Firmen-Event → `tertiary/20`
- Club/Bar → `surface-container-highest`
- Geburtstag → `tertiary-dim/20`
- Festival → `primary-dim/20`
- Sonstige → `outline-variant/20`

### Verpflegungsmehraufwand (umbenannt von "Abwesenheitspauschale")
- Separate Tabelle unterhalb
- Berechnung: Aufbau (default 1,5h) + Spielzeit + Abbau (default 1,5h) + Fahrtzeit (hin+zurück) = Gesamtabwesenheit
- **Zwei Stufen** (§ 9 Abs. 4a EStG):
  - 8h–24h Abwesenheit: **14 €**
  - Voller Tag (>24h, bei Festivals): **28 €**
- Spalten: Datum | Veranstaltung | Abwesenheit (h) | Stufe | Pauschale
- Summe am Ende, "absetzbar gesamt"

### Hinweis-Banner
> "Diese Auflistung dient ausschließlich als Orientierungshilfe für die eigene Buchhaltung. Kilometerpauschale (0,30 €/km, Reisekosten-Dienstreisen) und Verpflegungsmehraufwand sind keine Steuerberatung. Bitte vor Einreichung mit Steuerberater abstimmen."

### Filter
Jahres-Dropdown. Export als CSV für Steuerberater.

---

## Seite 8 — Buchhaltung

### Übersicht (oben)
- Einnahmen gesamt (Jahr, nur bezahlte Rechnungen)
- Ausgaben gesamt (Jahr, manuell erfasst)
- **Gewinn/Verlust** (grün/rot)
- **MwSt-Schulden** (19% auf Brutto-Einnahmen, zur Abführung)
- USt-Voranmeldungs-Zeitraum (monatlich/quartalsweise, konfigurierbar in Settings)

### Tabs
1. **Einnahmen:** Liste aller Payments, filterbar nach Zeitraum
2. **Ausgaben:** CRUD für manuelle Ausgaben (Equipment, Benzin, Software-Abos, Versicherung)
   - Kategorien: `equipment`, `fahrzeug`, `buero`, `marketing`, `versicherung`, `sonstiges`
   - Beleg-Upload (PDF/JPG/PNG) → in `/backend/uploads/receipts/` abgelegt
3. **MwSt-Übersicht:** Quartalsweise Aufstellung
   - Eingenommene USt (aus Rechnungen)
   - Vorsteuer (aus Ausgaben mit ausgewiesener USt)
   - Zahllast
4. **Fahrten:** Verlinkt auf Seite 7
5. **Fixkosten:** Wiederkehrende Ausgaben (GEMA, Versicherung, Webseite)

### Export
- **CSV** für Steuerberater (alle Einnahmen/Ausgaben im Zeitraum)
- **Jahresübersicht PDF** (formatiert mit Kinetic Pulse Branding)
- **EÜR-Vorbereitung** — Aggregation nach Anlage-EÜR-Zeilen (Versuch, kein Ersatz für StB)

---

## Seite 9 — Einstellungen DJ

### Tabs/Sektionen
1. **Firmendaten** — Name, Adresse, Kontakt, USt-ID, IBAN, BIC, Bank
2. **Nummernkreise** — Aktuelle Stände, Präfixe, Startwerte (readonly wenn bereits verwendet)
3. **Templates** — Kopf-/Fuß-Texte für Angebote/Rechnungen, Mahnstufen, Terminerinnerungen
4. **Zahlungsbedingungen** — Liste der auswählbaren Bedingungen ("Zahlbar innerhalb 14 Tagen ohne Abzug")
5. **Steuer & Pauschalen** — MwSt-Satz, Kilometerpauschale, Verpflegungsmehraufwand (zweistufig), Aufbau-/Abbauzeit default
6. **E-Mail** — SMTP-Konfiguration für Rechnungsversand
7. **Backup** — manuelles Backup-Trigger, Backup-Historie, Pfad-Config

---

## Zusätzliche Features (später, Schema bereits vorbereitet)

- **Musikwunsch-Portal** — öffentlicher Link pro Event, Kunde kann Songs eintragen
- **Vorgespräch-Fragebogen** — strukturierter Bogen, per Link verschickt
- **Event-Run-Sheet** — minutengenauer Ablaufplan, druckbar
- **Equipment-Inventar** — welches Gerät bei welchem Event, Wartungsintervalle
- **Stornogebühren-Staffelung** — automatische Berechnung bei Absage nach Zeitpunkt
- **Conversion-Tracking** — Anfragen → Angebote → Buchungen, Absage-Gründe
- **Jahresrückblick** — Top-Locations, Top-Kunden, Wiederbuchungsrate
- **Kommandoleiste (Cmd+K)** — globale Navigation und Quick-Actions

---

## Datenfluss-Beispiel: Von der Anfrage zur bezahlten Rechnung

1. Kunde ruft an → Benny legt **Anfrage** an (Seite 2, Quick-Capture)
2. Kontakt wird in `customers` angelegt, Event in `events` mit Status `neu`
3. Nach Telefonat: Status → `vorgespraech_vereinbart`
4. Nach Vorgespräch: **Angebot erstellen** (Seite 3)
   - Pakete/Leistungen auswählen, KM wird automatisch aus Event übernommen
   - Status `entwurf` → `finalisieren` → `AN-1035` vergeben, PDF generiert
   - Versenden: `gesendet`
5. Kunde bestätigt: Status Angebot → `angenommen`, Event → `bestaetigt`
6. **Rechnung aus Angebot erstellen** (Button auf Angebot-Detailseite)
   - Positionen übernommen, neue Nummer erst bei Finalisierung
   - Finalisieren → `RE-1061` vergeben, PDF generiert, Hash gespeichert
7. Event findet statt: Status Event → `abgeschlossen`
8. Zahlung trifft ein: `payments`-Eintrag, Rechnung → `bezahlt`
9. Erscheint automatisch in **Buchhaltung** als Einnahme und in **MwSt-Übersicht**
10. Fahrt erscheint automatisch in **Fahrten** mit absetzbarem Wert
