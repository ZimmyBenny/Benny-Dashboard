# Rechnungs-Template — Layout-Referenz

Dieses Dokument beschreibt das Layout der finalisierten Rechnungs-PDFs. Es orientiert sich an Bennys bisheriger Rechnung **RE-1060** aus SevDesk, damit Kunden keinen Bruch wahrnehmen.

Der PDF-Generator (Empfehlung: **Puppeteer** mit HTML-Template) soll aus dem bestehenden Design-System ausbrechen und stattdessen ein klassisches, druckfähiges Geschäftsbrief-Layout produzieren. **Keine Kinetic-Pulse-Farben im PDF**. Das PDF ist schwarz auf weiß.

---

## Papierformat & Ränder

- Format: **DIN A4** (210 × 297 mm)
- Ränder: oben 25 mm, unten 25 mm, links 25 mm, rechts 20 mm
- Schrift: **Inter** oder **Helvetica**, 10pt Basistext
- Zeilenabstand: 1.4

---

## Seitenaufbau (Seite 1)

```
┌──────────────────────────────────────────────────────────┐
│                                                          │
│  Benjamin Zimmermann · Mittelweg 10 · 93426 Roding       │ ← Absenderzeile (8pt, unterstrichen)
│                                                          │
│                                                          │
│  [Empfänger]                          Rechnungs-Nr:      │
│  {{salutation}} {{first_name}}         RE-{{number}}     │
│  {{last_name}}                        Rechnungsdatum:    │
│  {{company}}                           {{invoice_date}}  │
│  {{address}}                          Referenz:          │
│  {{zip}} {{city}}                      {{event_title}}   │
│                                       Lieferdatum:       │
│                                        {{delivery_date}} │
│                                       Kundennummer:      │
│                                        {{customer_no}}   │
│                                       Ansprechpartner:   │
│                                        Benjamin          │
│                                        Zimmermann        │
│                                                          │
│                                                          │
│  Rechnung Nr. RE-{{number}}                              │ ← 14pt bold
│                                                          │
│  {{header_text}}                                         │
│                                                          │
│                                                          │
│  ┌─┬─────────────────────┬────┬──────┬──────┬────────┐  │
│  │#│ Beschreibung        │Menge│Einhheit│Einzelpreis│Gesamt│ │
│  ├─┼─────────────────────┼────┼──────┼──────┼────────┤  │
│  │1│ Grundpaket 80 Gäste │  1 │Pausch│1.200,00€ │1.200,00€│ │
│  │2│ Funkmikrofon        │  1 │Stück │   50,00€ │   50,00€│ │
│  │…│ …                   │    │      │          │         │ │
│  └─┴─────────────────────┴────┴──────┴──────┴────────┘  │
│                                                          │
│                          Gesamtbetrag netto: 1.050,42 €  │
│                          Umsatzsteuer 19 %:    199,58 €  │
│                          ─────────────────────────────   │
│                          Gesamtbetrag brutto: 1.250,00 € │ ← bold
│                                                          │
│                                                          │
│  {{footer_text}}                                         │
│                                                          │
│  Zahlung per {{payment_method}} bis {{due_date}}.        │
│                                                          │
│                                                          │
│  Mit freundlichen Grüßen                                 │
│                                                          │
│  Benjamin Zimmermann                                     │
│                                                          │
│                                                          │
├──────────────────────────────────────────────────────────┤ ← Footer-Trennung (1pt grau)
│ Dein Event DJ |         Tel: 01711493222        Raiffeisenbank  │
│ Benjamin Zimmermann     Benjamin.Z@gmx.de       Neustadt-Voh.   │
│ Mittelweg 10            www.dein-event-dj.com   IBAN: DE59...   │
│ 93426 Roding            Steuer-Nr: 21129292323  BIC: GENODEF1NEW│
└──────────────────────────────────────────────────────────┘
```

---

## Details

### Kopfzeile (Absenderzeile)
- 8pt, hellgrau (#666)
- Format: `Benjamin Zimmermann · Mittelweg 10 · 93426 Roding`
- Endet mit 0.5pt-Linie darunter

### Empfänger-Block (links)
- Ab ca. 50 mm vom oberen Rand
- 11pt
- Reihenfolge:
  1. Anrede + Vorname + Nachname (oder Firma)
  2. Firma (falls separat)
  3. Straße
  4. PLZ + Ort
  5. Land (nur wenn nicht Deutschland)

### Meta-Block (rechts, neben Empfänger)
- Zweispaltig: Label links, Wert rechts
- 10pt
- Pflichtfelder:
  - Rechnungs-Nr.
  - Rechnungsdatum
  - Referenz (Event-Titel)
  - Lieferdatum (= Eventdatum)
  - Kundennummer
  - Ansprechpartner (immer: Benjamin Zimmermann)

### Titelzeile
- 14pt bold
- „Rechnung Nr. RE-XXXX"
- Ca. 20 mm unterhalb des Empfänger-/Meta-Blocks

### Kopf-Text
- Aus `invoices.header_text`, ggf. mit Platzhaltern ersetzt
- 10pt, normal
- Absatz vor der Positionstabelle

### Positionstabelle

**Spalten:**
| Nr | Spalte | Ausrichtung | Breite |
|---|---|---|---|
| 1 | Pos. | mitte | 8% |
| 2 | Beschreibung | links | 45% |
| 3 | Menge | rechts | 10% |
| 4 | Einheit | mitte | 12% |
| 5 | Einzelpreis | rechts | 12% |
| 6 | Gesamtpreis | rechts | 13% |

**Tabellen-Styling:**
- Header-Zeile: 9pt bold, grauer Hintergrund (#F0F0F0), 1pt Rahmen
- Datenzeilen: 10pt, horizontale Trennlinien 0.5pt #CCC
- Alle Preise mit Euro-Symbol und deutscher Formatierung: `1.234,56 €`

**Bei Rabatten:** zusätzliche Spalte oder Anmerkung in der Beschreibung („inkl. 10 % Rabatt").

### Summen-Block
- Rechtsbündig unterhalb der Tabelle
- Drei Zeilen:
  1. `Gesamtbetrag netto:    1.050,42 €`
  2. `Umsatzsteuer 19 %:       199,58 €`
  3. `──────────────────────────────────` (0.5pt Linie)
  4. `Gesamtbetrag brutto:  1.250,00 €` — bold, 11pt

### Fuß-Text
- 10pt
- Aus `invoices.footer_text`
- Danach: Zahlungshinweis (`Zahlung per {{method}} bis {{due_date}}`)

### Grußformel
- "Mit freundlichen Grüßen"
- Leerzeile
- "Benjamin Zimmermann"
- 10pt

### Footer (unterer Seitenrand)
- 1pt graue Linie über dem Footer
- 4 Spalten, 8pt, grauer Text (#666)
- Inhalt siehe ASCII-Grafik oben
- Fix positioniert am unteren Seitenrand, auf allen Folgeseiten wiederholen

---

## Mehrseitige Rechnungen

Bei mehr als ca. 12 Positionen geht die Rechnung auf Seite 2.

- Footer wiederholt sich auf allen Seiten
- Seitenzahl oben rechts im Meta-Bereich: `Seite 1 von 2`
- Positionstabellen-Header wird auf jeder Seite wiederholt
- Summen-Block **nur auf der letzten Seite**

---

## Stornorechnung

Identisches Layout, mit folgenden Änderungen:

- Titel: „**Stornorechnung Nr. SR-XXXX zu Rechnung RE-YYYY**"
- Kopftext (festverdrahtet):
  > „Hiermit stornieren wir die Rechnung RE-YYYY vom {{original_invoice_date}}. Die nachfolgend aufgeführten Positionen heben die ursprüngliche Rechnung vollständig auf."
- Positionen mit **negativen** Vorzeichen
- Summen-Block zeigt negative Beträge
- Footer identisch

---

## Angebot-PDF

Gleiches Layout wie Rechnung, aber:

- Absenderzeile identisch
- Titel: „**Angebot Nr. AN-XXXX**"
- Kein „Lieferdatum", stattdessen „Gültig bis: {{valid_until}}"
- Kein „Rechnungsdatum", stattdessen „Angebotsdatum"
- Fuß-Text enthält den Hinweis: „Dieses Angebot ist freibleibend und gültig bis {{valid_until}}."
- Kein Zahlungshinweis/Fälligkeit
- Summenblock: statt „Gesamtbetrag brutto" → „**Angebotssumme brutto**"

---

## Technische Empfehlungen für den PDF-Generator

### Stack
- **Puppeteer** (Headless Chrome) mit einem HTML+CSS-Template
- Alternative: `pdfkit` (JS) oder `WeasyPrint` (Python) — beide unterstützen Print-CSS gut
- **Nicht empfohlen:** `jsPDF` clientseitig (zu wenig Kontrolle über Layout)

### Template-Engine
- Handlebars oder Eta für Variablen-Substitution im HTML-Template
- Template liegt in `/backend/src/modules/dj/pdf/templates/invoice.html`

### Rendering-Flow
1. Daten aus DB laden (Rechnung + Items + Kunde + Firmendaten aus Settings)
2. Beträge berechnen, deutsch formatieren (siehe `DESIGN_SYSTEM.md` → `formatCurrency`)
3. HTML-Template rendern
4. Puppeteer → PDF
5. PDF-Bytes zurückgeben
6. SHA256 berechnen, in DB speichern
7. PDF-Datei unter `backups/invoices/RE-XXXX.pdf` ablegen

### Print-CSS-Hinweise
- `@page { size: A4; margin: 25mm 20mm 25mm 25mm; }`
- `body { font-family: 'Inter', 'Helvetica', sans-serif; font-size: 10pt; }`
- Footer mit `position: fixed; bottom: 0;` + `@page { @bottom-center { content: ... } }`
- Tabellen-Header-Repeat: `<thead>` mit `display: table-header-group;`

---

## Vorschau im UI

Vor dem Finalisieren öffnet sich ein Overlay mit PDF-Preview. Optionen:

- PDF-Vorschau neu laden
- Kopf-/Fuß-Text anpassen (nur solange `entwurf`)
- „Finalisieren & versenden" (Primary Button, grün — hier ist Emerald Green erlaubt, weil Erfolgs-Aktion)
- „Abbrechen"

Nach Finalisierung: keine Bearbeitung mehr, nur noch „Drucken" / „Erneut versenden" / „Stornieren".
