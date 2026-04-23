# Business Data — Seed-Daten

Dieses Dokument enthält alle Stammdaten, die beim ersten Setup in die DB geschrieben werden müssen.

---

## Firmendaten (in `dj_settings` als JSON unter Key `company`)

```json
{
  "name": "Benjamin Zimmermann",
  "company": "Dein Event DJ | Benjamin Zimmermann",
  "address": "Mittelweg 10",
  "zip": "93426",
  "city": "Roding",
  "country": "Deutschland",
  "phone": "01711493222",
  "email": "Benjamin.Z@gmx.de",
  "website": "www.dein-event-dj.com",
  "tax_number": "21129292323",
  "vat_id": null,
  "is_vat_liable": true,
  "vat_rate": 19.0,
  "bank": {
    "name": "Raiffeisenbank Neustadt - Vohenstrauß eG",
    "iban": "DE59753900000005302552",
    "bic": "GENODEF1NEW",
    "holder": "Benjamin Zimmermann"
  },
  "payment_methods": ["paypal", "ueberweisung"]
}
```

---

## Nummernkreise (`number_sequences`)

| key | prefix | current_value | padding |
|---|---|---|---|
| `invoice` | `RE` | `1060` | `4` |
| `quote` | `AN` | `1034` | `4` |
| `customer` | `` | `1019` | `0` |
| `credit_note` | `SR` | `0` | `4` |

> Die nächsten vergebenen Nummern sind **RE-1061**, **AN-1035**, Kundennummer **1020**, **SR-0001**.

---

## Steuer- & Pauschal-Einstellungen (in `dj_settings`)

```json
{
  "key": "tax",
  "value": {
    "vat_rate": 19.0,
    "mileage_rate_per_km": 0.30,
    "mileage_type": "reisekosten_dienstreise",
    "mileage_note": "Kilometerpauschale für Dienstreisen (§ 9 Abs. 1 Nr. 4a EStG). Nicht zu verwechseln mit der Entfernungspauschale/Pendlerpauschale, die 2026 auf 38 ct angehoben wurde — diese gilt nur für Wohnung ↔ erste Betriebsstätte. DJ-Fahrten zu wechselnden Einsatzorten laufen über das Reisekostenrecht und bleiben bei 0,30 €/km unverändert.",
    "meal_allowance_8h": 14.00,
    "meal_allowance_24h": 28.00,
    "default_setup_minutes": 90,
    "default_teardown_minutes": 90,
    "default_payment_term_days": 14,
    "dunning_fee": 5.00,
    "cancellation_staggered": {
      "gt_180_days": 0,
      "gt_90_days": 25,
      "gt_30_days": 50,
      "gt_7_days": 75,
      "lt_7_days": 100
    }
  }
}
```

---

## Leistungskatalog (`dj_services`)

### Kategorie: Audio

| Name | Einheit | Preis netto | Beschreibung |
|---|---|---|---|
| Tonanlage klein (bis ca. 80 Gäste) | Pauschal | 150,00 € | Kompaktanlage für kleinere Events |
| Tonanlage mittel (bis ca. 150 Gäste) | Pauschal | 250,00 € | Ausgewogene Beschallung für mittelgroße Events |
| Tonanlage groß (ab 150 Gäste) | Pauschal | 350,00 € | Leistungsstarke Beschallung für große Events |
| Outdoor-/Akku-Tonanlage | Pauschal | 200,00 € | Mobile Anlage ohne Stromanschluss |
| Zweiter Raum Beschallung | Pauschal | 150,00 € | Zusätzliche Zone beschallen |
| Mikrofon (Kabel) | Stück | 25,00 € | Kabelmikrofon für Reden |
| Funkmikrofon | Stück | 50,00 € | Funkmikro, bis 50m Reichweite |
| Headset-Mikrofon | Stück | 60,00 € | Für freihändige Moderation |
| DJ-Controller | Pauschal | 0,00 € | (im DJ-Service enthalten) |
| Laptop | Pauschal | 0,00 € | (im DJ-Service enthalten) |
| Streaming (wenn online) | Pauschal | 0,00 € | Preis auf Anfrage |

### Kategorie: Licht

| Name | Einheit | Preis netto | Beschreibung |
|---|---|---|---|
| Basic Partylicht | Pauschal | 80,00 € | 2 LED-Scheinwerfer, klassische Tanzflächen-Ausleuchtung |
| Erweiterte Lichttechnik | Pauschal | 150,00 € | 4–6 LED-Scheinwerfer, Moving Heads optional |
| Ambientebeleuchtung / Uplights | Pauschal | 120,00 € | Raumfärbung über Uplights |

### Kategorie: Effekte

| Name | Einheit | Preis netto | Beschreibung |
|---|---|---|---|
| Nebelmaschine | Pauschal | 50,00 € | Standard-Nebel für Lichteffekte |
| Hazer | Pauschal | 70,00 € | Feiner Dunst, ideal für Moving Heads |
| Konfetti-Shooter | Stück | 30,00 € | Pro Schuss, für Eröffnungstanz |
| Kaltfunken-Fontäne | Stück | 40,00 € | Für Einzug, Tortenanschnitt (Indoor-tauglich) |
| Bodennebel / Trockeneis-Effekt | Pauschal | 120,00 € | "Tanzen auf Wolken" für ersten Tanz |
| Schwarzlicht | Pauschal | 40,00 € | UV-Effekt für spezielle Mottos |

### Kategorie: DJ-Service

| Name | Einheit | Preis netto | Beschreibung |
|---|---|---|---|
| DJ-Service Grundleistung | Pauschal | 0,00 € | In allen Paketen enthalten |
| Zusätzliche Spielzeit | Stunde | 80,00 € | Pro angefangener Stunde über Paket hinaus |
| Moderation | Pauschal | 100,00 € | Aktive Moderation inkl. Einlagen |

### Kategorie: Sonstiges

| Name | Einheit | Preis netto | Beschreibung |
|---|---|---|---|
| Anfahrt | km | 0,30 € | Kalkulatorisch, nicht auf Rechnung einzeln ausgewiesen |
| Auf-/Abbau Express (<60 min) | Pauschal | 80,00 € | Beschleunigter Auf-/Abbau |

---

## Buchungspakete (`dj_packages` + `dj_package_services`)

> Die Paketpreise sind Festpreise, **nicht** Summe der enthaltenen Einzelleistungen. Claude Code soll die Pakete direkt mit dem angegebenen `price_net` seeden und die enthaltenen Services nur zur Expansion in `quote_items`/`invoice_items` nutzen.

### Paket: Kofferjob

- Preis netto: **600,00 €**
- Beschreibung: "Schlanke DJ-Leistung für kleinere Feiern ohne große Technik"
- Enthaltene Leistungen:
  - DJ-Service Grundleistung
  - Tonanlage klein (bis ca. 80 Gäste)
  - Basic Partylicht
  - Mikrofon (Kabel)

### Paket: Grundpaket bis 80 Gäste

- Preis netto: **1.200,00 €**
- Beschreibung: "Komplettausstattung für Feiern bis 80 Personen inkl. Licht und Effekten"
- Enthaltene Leistungen:
  - DJ-Service Grundleistung
  - Tonanlage klein (bis ca. 80 Gäste)
  - Basic Partylicht
  - Ambientebeleuchtung / Uplights
  - Mikrofon (Kabel)
  - Funkmikrofon
  - Nebelmaschine
  - DJ-Controller
  - Laptop
  - Anfahrt (bis 30 km inklusive)

### Paket: Grundpaket bis 150 Gäste

- Preis netto: **1.400,00 €**
- Beschreibung: "Komplettausstattung für mittelgroße Events bis 150 Personen"
- Enthaltene Leistungen:
  - DJ-Service Grundleistung
  - Tonanlage mittel (bis ca. 150 Gäste)
  - Erweiterte Lichttechnik
  - Ambientebeleuchtung / Uplights
  - Funkmikrofon
  - Mikrofon (Kabel)
  - Hazer
  - DJ-Controller
  - Laptop
  - Anfahrt (bis 30 km inklusive)

### Paket: Club Upgrade

- Preis netto: **200,00 €**
- Beschreibung: "Zusatzpaket für Club/Bar-Atmosphäre auf privaten Events"
- Enthaltene Leistungen:
  - Bodennebel / Trockeneis-Effekt
  - Schwarzlicht
  - Erweiterte Lichttechnik

---

## Zahlungsbedingungen (in `dj_settings` unter Key `payment_terms`)

```json
[
  "Zahlbar innerhalb 14 Tagen ohne Abzug",
  "Zahlbar innerhalb 7 Tagen ohne Abzug",
  "30 % Anzahlung bei Auftragsbestätigung, Restbetrag innerhalb 14 Tagen nach Veranstaltung",
  "Zahlung am Veranstaltungstag in bar oder per Überweisung innerhalb 7 Tagen"
]
```

---

## Template-Texte (in `dj_settings` unter Key `templates`)

### Angebot Kopf-Text (Hochzeit)

```
Hallo {{vorname}},

vielen Dank für Eure Anfrage. Gerne unterbreite ich euch das gewünschte
freibleibende Angebot für euren großen Tag am {{eventdatum}}.

Ich freue mich darauf, euch an diesem besonderen Abend musikalisch zu begleiten.
```

### Angebot Kopf-Text (Firmen-Event)

```
Sehr geehrte/r {{anrede}} {{nachname}},

vielen Dank für Ihre Anfrage. Gerne unterbreite ich Ihnen nachfolgend
ein freibleibendes Angebot für Ihre Veranstaltung am {{eventdatum}}.
```

### Angebot Kopf-Text (Geburtstag / Privat)

```
Hallo {{vorname}},

vielen Dank für deine Anfrage. Anbei mein freibleibendes Angebot
für deine Feier am {{eventdatum}}.
```

### Angebot Fuß-Text (universell)

```
Das Angebot ist gültig bis {{gueltig_bis}}.

Bei Fragen stehe ich jederzeit gerne zur Verfügung.

Mit freundlichen Grüßen
Benjamin Zimmermann
```

### Rechnung Kopf-Text

```
Sehr geehrte/r {{anrede}} {{nachname}},

vielen Dank für das entgegengebrachte Vertrauen und die schöne Veranstaltung
am {{eventdatum}}. Nachfolgend erlaube ich mir, Ihnen die vereinbarten
Leistungen in Rechnung zu stellen.
```

### Rechnung Fuß-Text

```
Bitte überweisen Sie den Gesamtbetrag innerhalb von {{zahlungsziel}} Tagen
auf das unten genannte Konto.

Mit freundlichen Grüßen
Benjamin Zimmermann
```

### Zahlungserinnerung (Mahnstufe 1)

```
Sehr geehrte/r {{anrede}} {{nachname}},

beim Ausgleich der Rechnung {{rechnungsnummer}} vom {{rechnungsdatum}}
ist vermutlich etwas durcheinander gekommen. Der offene Betrag von
{{betrag}} ist bereits seit {{tage_ueberfaellig}} Tagen fällig.

Bitte prüfen Sie, ob die Zahlung bereits angewiesen wurde. Falls nicht,
bitte ich Sie um Ausgleich innerhalb der nächsten 7 Tage.

Mit freundlichen Grüßen
Benjamin Zimmermann
```

### 1. Mahnung (Mahnstufe 2)

```
Sehr geehrte/r {{anrede}} {{nachname}},

trotz meiner Zahlungserinnerung ist der offene Betrag aus Rechnung
{{rechnungsnummer}} in Höhe von {{betrag}} bislang nicht auf meinem
Konto eingegangen.

Ich bitte Sie nun dringend, den Betrag innerhalb von 7 Tagen auszugleichen.

Mit freundlichen Grüßen
Benjamin Zimmermann
```

### Letzte Mahnung (Mahnstufe 3)

```
Sehr geehrte/r {{anrede}} {{nachname}},

leider ist der offene Betrag aus Rechnung {{rechnungsnummer}} in Höhe
von {{betrag}} auch nach zwei Erinnerungen nicht beglichen.

Ich fordere Sie hiermit letztmalig auf, den Betrag zuzüglich einer
Mahngebühr von {{mahngebuehr}} innerhalb von 7 Tagen zu überweisen.
Andernfalls sehe ich mich gezwungen, weitere Schritte einzuleiten.

Mit freundlichen Grüßen
Benjamin Zimmermann
```

---

## Default-Einstellungen

- Auslastungs-Zeitraum Dashboard: nächste 365 Tage
- Wochenend-Definition: Freitag + Samstag (für Auslastungs-Heatmap)
- Jahr-Default im Dashboard: aktuelles Kalenderjahr
- USt-Voranmeldungs-Zeitraum: vierteljährlich (quartalsweise), konfigurierbar
