# DJ-Modul — Handover-Paket

Dieses Verzeichnis enthält die vollständige Spezifikation für das neue **DJ-Modul** im Pulse Console Dashboard.

**Zielgruppe:** Claude Code (in VS Code) soll diese Dateien als Kontext nutzen und das Modul in das bestehende Monorepo integrieren.

---

## Lesereihenfolge

Bitte in dieser Reihenfolge lesen, bevor Code geschrieben wird:

1. **`PROMPT.md`** — Die eigentliche Aufgabe, Rollen, Arbeitsweise, Akzeptanzkriterien. **Start hier.**
2. **`SPEC.md`** — Fachliche Spezifikation: Seiten, Features, User Flows, Datenmodell-Logik
3. **`DESIGN_SYSTEM.md`** — "The Synthetic Conductor" Design-Tokens, Komponenten-Regeln, Do's & Don'ts
4. **`SCHEMA.sql`** — Vollständiges SQLite-Schema inkl. GoBD-Triggers und Indizes. **Exakt so übernehmen.**
5. **`BUSINESS_DATA.md`** — Firmendaten, Steuerregeln, Leistungskatalog, Pakete (Seed-Daten)
6. **`GoBD_RULES.md`** — Compliance-Anforderungen. **Nicht verhandelbar.**
7. **`RECHNUNGS_TEMPLATE.md`** — Layout-Referenz für den PDF-Generator

---

## Struktur im Ziel-Monorepo

```
/backend
  /src
    /modules
      /dj              ← neues Modul
        /routes
        /services
        /db
        /pdf
        index.js
    ...
/frontend
  /src
    /pages
      /dj              ← neuer Reiter
        /uebersicht
        /events
        /angebote
        /rechnungen
        /kunden
        /leistungen
        /fahrten
        /buchhaltung
        /einstellungen
      ...
    /components
      /dj              ← modul-spezifische Komponenten
    ...
/docs
  /dj-module           ← DIESES VERZEICHNIS
```

Claude Code darf die konkrete Dateistruktur innerhalb von `/backend/src/modules/dj/` und `/frontend/src/pages/dj/` selbst festlegen, solange sie zu den Konventionen des bestehenden Repos passt.

---

## Wichtig

- **Sprache im UI:** Deutsch. Alle Labels, Meldungen, Fehlertexte, E-Mail-Templates.
- **Zahlenformat:** Deutsch (`1.234,56 €`), Datum `DD.MM.YYYY`.
- **Kein Cloud-Dependency** für Kerndaten. OSM/OSRM nur als optionaler Helper mit Fallback.
- **Bestehende Auth** (JWT) wiederverwenden, nicht neu bauen.
- **Bestehendes Design System** (Tailwind-Config mit Kinetic Pulse Tokens) wiederverwenden. Keine neuen Farben einführen.
