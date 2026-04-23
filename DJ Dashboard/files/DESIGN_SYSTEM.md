# Design System — "The Synthetic Conductor"

Das bestehende Dashboard verwendet dieses Design System bereits. Das DJ-Modul muss sich **exakt** daran halten. Keine neuen Farben, keine neuen Schriftarten, keine eigenen Interpretationen.

---

## Farb-Tokens

Diese Werte sollten bereits in der Tailwind-Config des bestehenden Repos vorhanden sein. Falls ja: **wiederverwenden**. Falls nein (oder neue benötigt werden): exakt diese Werte verwenden und ergänzen.

### Surface-Hierarchie (Tonal Layering)
```
background / surface:        #060e20
surface-container-low:       #091328
surface-container:           #0f1930
surface-container-high:      #141f38
surface-container-highest:   #192540
surface-bright:              #1f2b49
```

**Nutzung:** Tiefe durch Schichten statt durch Borders. Page-Background `surface`, Cards `surface-container`, Card-Header oder hervorgehobene Elemente `surface-container-high`, Input-Felder `surface-container-highest`.

### Primary (Electric Blue) — Hauptfarbe, Navigation, neutrale KPIs
```
primary:                     #94aaff
primary-dim:                 #3367ff
primary-container:           #809bff
on-primary-container:        #060e20 (oder sehr dunkler Ton)
```

### Secondary (Emerald Green) — AUSSCHLIESSLICH für Erfolg, Wachstum, positive Finanzen
```
secondary:                   #5cfd80
secondary-dim:               #4bee74
secondary-container:         #006e2a
on-secondary-container:      #dee5ff
```

**❌ Niemals verwenden für:** Navigation, Dekoration, Hover-States, generelle Accents.
**✅ Verwenden für:** bezahlte Rechnungen, Umsatz-KPIs, "Speichern erfolgreich", Gewinn-Anzeige.

### Tertiary (Deep Violet) — Geplant, Zukunft, Options-Zustände
```
tertiary:                    #a68cff
tertiary-dim:                #7e51ff
```

### Error
```
error:                       #ff6e84
error-container:             #a70138
```

### Text auf dunklen Flächen
```
on-surface:                  #dee5ff
on-surface-variant:          #a3aac4
outline:                     #6d758c
outline-variant:             #40485d
```

**❌ Niemals reines `#FFFFFF` für Text.** Immer `on-surface` (#dee5ff) oder dunkler.

---

## Typografie

- **Headlines:** `Manrope`, fett (700/800), großzügig, magazin-artig
- **Body / Labels:** `Inter`, regular bis medium, präzise

Typografie-Skala (Empfehlung, am bestehenden Dashboard orientieren falls vorhanden):
```
display:   48px / 56px / Manrope 800
h1:        32px / 40px / Manrope 700
h2:        24px / 32px / Manrope 700
h3:        20px / 28px / Manrope 600
body-lg:   16px / 24px / Inter 400
body:      14px / 20px / Inter 400
label:     12px / 16px / Inter 500 (uppercase-tracking-wide bei KPI-Labels)
mono:      14px / 20px / JetBrains Mono oder bestehender Mono-Stack
```

---

## Strikte Regeln

### Do
- ✅ Tonal Layering für Tiefe: `surface` → `surface-container-low` → `surface-container-highest`
- ✅ Card-Radius: `rounded-xl` (0.75rem)
- ✅ Negative Space als Gestaltungsmittel — lieber mehr Luft als Dichte
- ✅ Glassmorphism für schwebende Elemente (Modals, Drawer, Popover):
  - `bg-surface-variant/40` + `backdrop-blur-[30px]`
  - Linear-Gradient von `primary` 10% zu transparent, Winkel 45°
- ✅ Active-Nav-State: `primary` Farbe + 4px `primary-dim` Glow + `bg-[#3367ff]/20` + `border-r-4 border-[#94aaff]`
- ✅ Tabellen: `divide-y divide-outline-variant/5`, Hover-Row: `bg-[#192540]/30`

### Don't
- ❌ 1px-Borders als Trennlinien (stattdessen Hintergrund-Layering oder sehr dezentes `divide-outline-variant/5`)
- ❌ Reines Weiß `#FFFFFF` für Text
- ❌ Emerald Green für Navigation, Icons, Dekoration
- ❌ Gradient-Hintergründe außerhalb von Glassmorphism-Panels
- ❌ Drop Shadows (stattdessen Layering + Glow bei Fokus)

---

## Komponenten-Rezepte

### KPI-Kachel (Dashboard)
```
Container:  bg-surface-container rounded-xl p-6
Icon:       top-right, 24px, in Akzentfarbe der Kategorie (primary / secondary / tertiary / error)
Label:      text-xs uppercase tracking-wider text-on-surface-variant
Value:      text-3xl Manrope 700 text-on-surface (oder Akzentfarbe bei Umsatz/Warnung)
Sublabel:   text-sm text-on-surface-variant (optional, z.B. "vs. Vorjahr")
```

### Button Primary
```
bg-primary-container text-on-primary-container
px-5 py-2.5 rounded-xl font-medium
hover: bg-primary
no border, no shadow
```

### Button Secondary / Save-Action
```
bg-secondary-container text-on-secondary-container
px-5 py-2.5 rounded-xl font-medium
hover: bg-secondary (leichte Abdunkelung)
```

### Button Ghost
```
bg-transparent text-on-surface
hover: bg-surface-container-high
```

### Button Destructive
```
bg-error-container text-on-surface
hover: bg-error
```

### Card
```
bg-surface-container rounded-xl p-6
Abstand zwischen Cards: gap-6 (24px)
Keine Divider, keine Borders
```

### Input Field
```
bg-surface-container-highest rounded-lg px-4 py-2.5
text-on-surface placeholder:text-on-surface-variant
focus: border-b-2 border-primary (nur bottom accent, kein ring)
no outline, no full border
```

### Status Pill
```
rounded-full px-3 py-1 text-xs font-medium
Farbcodiert je Status:
  entwurf:         bg-outline-variant/20 text-on-surface-variant
  gesendet/offen:  bg-primary/20 text-primary
  bestaetigt:      bg-tertiary/20 text-tertiary
  bezahlt:         bg-secondary/20 text-secondary
  ueberfaellig:    bg-error/20 text-error
  storniert:       bg-outline-variant/30 text-outline line-through
  abgelehnt:       bg-error-container/50 text-on-surface
```

### Tabelle
```
Table:       w-full text-sm
Header:      bg-surface-container-low text-on-surface-variant uppercase tracking-wider text-xs
Rows:        divide-y divide-outline-variant/5
Row-Hover:   bg-[#192540]/30 (subtil)
Zellen:      px-4 py-3
```

### Modal / Drawer
```
Overlay:    bg-surface/80 backdrop-blur-sm
Panel:      bg-surface-container-high rounded-xl
            shadow: kein klassischer Schatten, aber subtiler Glow:
            ring-1 ring-primary-dim/20
Padding:    p-8
```

### Sidebar Nav Item (Active State)
```
bg-[#3367ff]/20 text-primary
border-r-4 border-primary
optional: shadow-[0_0_16px_rgba(148,170,255,0.3)] (Glow)
```

### Sidebar Nav Item (Inactive)
```
text-on-surface-variant
hover: bg-surface-container-high text-on-surface
```

---

## Zahlen- und Datumsformatierung

Alle Zahlen und Daten im UI müssen **deutsch lokalisiert** sein.

### JavaScript-Helper (Empfehlung)
```js
// /frontend/src/lib/format.js
export const formatCurrency = (value) =>
  new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  }).format(value);

export const formatNumber = (value, digits = 0) =>
  new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);

export const formatDate = (dateStr) =>
  new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(dateStr));

export const formatDateTime = (dateStr) =>
  new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateStr));
```

### Beispiele
- `1234.5` → `1.234,50 €`
- `2026-05-17` → `17.05.2026`
- Prozent: `19%` → `19 %` (mit geschütztem Leerzeichen)
- Kilometer: `87.3` → `87,3 km`

---

## Icons

Verwende **Material Symbols** wie im bestehenden Dashboard.
Empfohlene Icons fürs DJ-Modul:
- Hauptreiter: `equalizer`
- Übersicht: `dashboard`
- Events & Anfragen: `event`
- Angebote: `description`
- Rechnungen: `receipt_long`
- Kunden: `group`
- Leistungen & Pakete: `inventory_2`
- Fahrten: `directions_car`
- Buchhaltung: `account_balance`
- Einstellungen DJ: `tune`

---

## Layout-Grundraster

- Sidebar: bestehend, unverändert
- Content-Bereich: `max-w-[1400px] mx-auto px-8 py-10`
- KPI-Grid: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6`
- Page-Header: Headline + optionaler Subtitle + rechtsbündige Primary-Action
- Sektionen untereinander: `space-y-10`
