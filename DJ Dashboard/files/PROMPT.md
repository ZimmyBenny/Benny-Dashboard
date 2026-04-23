# DJ-Modul — Arbeitsauftrag für Claude Code

## Rolle

Du bist ein Senior Full-Stack Entwickler. Du arbeitest in einem bestehenden Monorepo ("Pulse Console / Kinetic Pulse") mit:

- **Backend:** Node.js + Express + SQLite
- **Frontend:** React + Vite + Tailwind
- **Auth:** JWT (bereits vorhanden)
- **Sidebar/Routing/Design System:** bereits etabliert

Du integrierst ein neues Modul **"DJ"** als zusätzlichen Reiter in dieses Dashboard. Das Modul ist ein vollständiges DJ-Business-Management-Tool für Benjamin Zimmermann (Einzelunternehmer, umsatzsteuerpflichtig).

---

## Deine Aufgabe

Lies **alle Dateien** in diesem Verzeichnis (`/docs/dj-module/`) in der Reihenfolge aus der `README.md`. Dann integriere das Modul Seite für Seite in das bestehende Monorepo.

**Du bestimmst die konkrete Code-Struktur selbst** (Dateinamen, Komponenten-Hierarchie, Service-Layer-Aufteilung), solange:

- sie zu den Konventionen des bestehenden Repos passt (erst `ls`, dann planen)
- Backend unter `/backend/src/modules/dj/` liegt
- Frontend unter `/frontend/src/pages/dj/` liegt
- Design System, Auth und Routing des bestehenden Dashboards wiederverwendet werden

---

## Arbeitsweise

### Phase 0 — Orientierung (bevor du irgendetwas schreibst)

1. Untersuche das bestehende Repo:
   - Wie ist `/backend` strukturiert? Welches Module-Pattern wird verwendet?
   - Wie ist `/frontend` strukturiert? Wie sind bestehende Reiter (Home, Business, ...) organisiert?
   - Wo liegt die Tailwind-Config? Welche Tokens/Farben sind schon definiert?
   - Wie sieht das aktuelle Sidebar-Routing aus? Wie fügt man einen neuen Reiter hinzu?
   - Welche SQLite-DB-Datei wird verwendet? Wie werden Migrations aktuell verwaltet?
   - Welche Dependencies sind schon da? (`package.json` im Backend und Frontend)

2. **Schreibe einen kurzen Integrationsplan** bevor du Code produzierst:
   - Welche bestehenden Konventionen folgst du?
   - Wo fügst du welche Datei ein?
   - Welche neuen Dependencies brauchst du und warum?
   - Wie führst du die Migration aus (bestehendes Migrations-System vs. neues)?

3. **Stoppe hier und frage Benny um Bestätigung** bevor du mit Phase 1 beginnst.

### Phase 1 — Fundament

1. **Migration ausführen:** `SCHEMA.sql` in das bestehende Migrations-System einbauen. Alle Tabellen, Indizes, Trigger. Keine Abweichungen vom Schema.
2. **Seed-Daten laden:** Firmendaten, Nummernkreise, Leistungskatalog, Pakete aus `BUSINESS_DATA.md`.
3. **Backend-Basis:**
   - DB-Helper mit Transaktionen
   - Nummernkreis-Service (atomar, lückenlos)
   - Audit-Log-Helper
   - GoBD-Guard-Middleware (blockt UPDATE/DELETE auf finalisierten Rechnungen)
   - Modul-Router unter `/api/dj/*` mit Auth-Middleware
4. **Frontend-Basis:**
   - Sidebar-Eintrag "DJ" mit Untermenü (alle 9 Seiten aus SPEC)
   - Route-Skeleton für alle Seiten (leere Komponenten mit Page-Headline)
   - Shared Components Platzhalter (`KPICard`, `StatusBadge`, `DataTable`, `FormModal`, `PDFPreview`)

Am Ende von Phase 1: Das DJ-Modul ist in der Sidebar sichtbar, alle Unterseiten öffnen sich (leer), die DB ist initialisiert, Seed-Daten sind geladen. **Stoppe hier und hole Feedback.**

### Phase 2 — Seiten-Implementierung (in dieser Reihenfolge)

1. **Kunden** (Seite 5) — einfachster CRUD, Basis für alles
2. **Leistungen & Pakete** (Seite 6) — CRUD, bereits geseedet
3. **Events & Anfragen** (Seite 2) — verknüpft Kunden, Status-Flow, Event-Detailseite mit OSM-Integration
4. **Angebote** (Seite 3) — komplexe Form mit Positionen, Templates, PDF-Preview
5. **Rechnungen** (Seite 4) — 80% Code-Reuse von Angeboten + GoBD-Layer
6. **Fahrten** (Seite 7) — View auf Events, Berechnungen
7. **Buchhaltung** (Seite 8) — Aggregation, Export
8. **DJ Übersicht / Dashboard** (Seite 1) — **zuletzt**, weil erst dann echte Daten fließen
9. **Einstellungen DJ** — parallel bei Bedarf

Nach jeder Seite: kurze Zusammenfassung was gebaut wurde, Screenshots-Hinweise wo sinnvoll, **dann pausieren für Feedback**.

---

## Akzeptanzkriterien (non-negotiable)

### Design
- [ ] Alle Seiten folgen strikt dem Design System aus `DESIGN_SYSTEM.md`
- [ ] Keine 1px-Borders als Trennlinien — nur Hintergrund-Layering
- [ ] Emerald Green (`secondary`) ausschließlich für Erfolg/Umsatz/positive Finanzen
- [ ] Zahlen im deutschen Format, Datum `DD.MM.YYYY`
- [ ] Deutsche UI-Texte durchgehend

### GoBD
- [ ] Finalisierte Rechnungen können via API **nicht** mehr verändert werden (Middleware **und** DB-Trigger)
- [ ] Rechnungsnummern sind lückenlos und werden erst bei Finalisierung vergeben
- [ ] Audit-Log erfasst alle finanzrelevanten Änderungen
- [ ] Storno erzeugt eine neue Rechnung mit negativen Beträgen und Referenz, statt die alte zu löschen
- [ ] PDF-Hash wird beim Finalisieren gespeichert

### Technik
- [ ] Bestehende Auth (JWT) wird wiederverwendet, nicht neu gebaut
- [ ] Bestehende Tailwind-Config wird erweitert, nicht ersetzt
- [ ] Alle DB-Änderungen laufen in Transaktionen
- [ ] Keine neuen Cloud-Dependencies für Kerndaten
- [ ] OSM/OSRM nur als optionaler Helper mit Offline-Fallback

### Tests
- [ ] Mindestens Integration-Tests für: Nummernkreis-Atomarität, GoBD-Guard, Storno-Flow, PDF-Generierung
- [ ] Manuelle Test-Checkliste pro Seite am Ende jeder Phase

---

## Do's

- Frag nach, wenn etwas unklar ist, statt zu raten
- Nutze bestehende Komponenten/Utilities des Repos so weit wie möglich
- Kleine, fokussierte Commits pro logischer Einheit
- Kommentare auf Deutsch, wenn Benny sie lesen soll; auf Englisch wenn Standard-Dev-Kommentare
- Erst Schema → dann Backend-Service → dann API-Route → dann Frontend-Page

## Don'ts

- Keine neuen UI-Frameworks oder Component-Libraries einführen (Tailwind only)
- Keine ORM-Abstraktion einführen wenn das Repo raw SQL nutzt (oder umgekehrt)
- Keine Modals für komplexe Forms (Angebot, Rechnung) — Full-Page Routes
- Keine eigenmächtigen Änderungen am bestehenden Dashboard-Code außerhalb des DJ-Moduls und der Sidebar-Integration
- Kein Emerald Green außerhalb von Erfolgs-/Finanz-Kontext
- Keine Platzhalter-Daten im finalen Code — entweder echte Seed-Daten oder leere States
