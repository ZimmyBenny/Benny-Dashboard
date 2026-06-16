# Amazon „Recherche & Wissen" — Design

**Datum:** 2026-06-15
**Modul:** Amazon → Produkt-Detail („Entwicklung"-Seite)
**Status:** Entwurf abgenommen, bereit für Implementierungs-Plan

## Problem / Ziel

Benny will Recherche-Wissen zu einem Amazon-Produkt an **einem** Ort festhalten:
Patent-/Design-Abklärungen (per Link oder Screenshot), Zertifikate (was brauche ich,
was haben andere), gemerkte Texte, Keywords, Bulletpoints. Wichtig: **strukturiert
genug zum Wiederfinden, aber nicht so überladen, dass es nicht genutzt wird.**

## Entscheidungen (aus dem Brainstorming)

1. **Struktur:** Eigene, frei anlegbare Themen-Blöcke (nicht feste Kategorien, nicht
   freies Karten-Board). Leer = unsichtbar/klein → kein Ballast.
2. **Eintrag = Kombi-Karte:** Jede Karte bündelt Titel + Text + Links + Bilder.
3. **Karte kann:** mehrere Screenshots, mehrere Links (mit Label), Titel optional,
   Karten innerhalb eines Themas per Drag-and-drop umsortierbar.
4. **Keywords / gemerkte Texte:** kein eigenes Konstrukt — eine Karte mit Bullet-Text
   genügt (bewusst gegen Überladung).
5. **Name:** „Recherche & Wissen".
6. **Scope:** pro Produkt.

## Aufbau (3 Ebenen)

```
▾ Recherche & Wissen                 ← einklappbarer Bereich (wie Checkliste/Sourcing/USP)
   ▾ Patente / Designs               ← Thema (anlegbar, umsortierbar)
       ┌─ Konkurrent X ──────────────┐
       │ Designschutz seit 2022       │   ← Karte
       │ • gilt nur DE                │     Titel optional, Bullet-Text im Body
       │ 🔗 DPMA-Register  🔗 Shop     │     mehrere Links (mit Label)
       │ 🖼️ 🖼️                         │     mehrere Screenshots
       └──────────────────────────────┘
       [+ Karte]
   ▸ Zertifikate (3)                 ← eingeklappt: nur Anzahl
   ▸ Keywords (12)
   [+ Thema]
```

- **Bereich:** Standardmäßig eingeklappt. Electric Noir, Auto-Speicherung wie die
  Geschwister-Bereiche („Änderungen werden automatisch gespeichert").
- **Thema:** Titel (inline editierbar), ein-/ausklappbar, umsortierbar, zeigt
  eingeklappt die Karten-Anzahl. Löschen mit Bestätigung.
- **Karte:** optionaler Titel · mehrzeiliges Textfeld (Bulletpoints/Keywords einfach
  tippen) · mehrere Links mit optionalem Label · mehrere Screenshots · per
  Drag-and-drop umsortierbar. Löschen mit Bestätigung.
- **Screenshots:** Upload per Klick, Drag-and-drop **und** Einfügen aus der
  Zwischenablage (Cmd+V — für macOS-Bildschirmfotos). Vorschau-Thumbnails,
  Klick = Vollansicht/Download. Wiederverwendung des bestehenden USP-Datei-Musters
  (multer, FILES_DIR, file_path/original_name/mime).

## Datenmodell (Backend)

Neue Migration `084_amazon_research.sql` (nächste freie Nummer). Vier Tabellen,
gespiegelt an bestehenden Mustern (`amazon_usp_points` + `_point_images`,
`amazon_manufacturer_offers` + `_offer_files`):

```
amazon_research_topics
  id            INTEGER PK
  product_id    INTEGER  → amazon_products(id) ON DELETE CASCADE
  title         TEXT     NOT NULL
  sort_order    INTEGER  NOT NULL DEFAULT 0
  is_expanded   INTEGER  NOT NULL DEFAULT 0
  created_at    TEXT     DEFAULT (datetime('now'))

amazon_research_cards
  id            INTEGER PK
  topic_id      INTEGER  → amazon_research_topics(id) ON DELETE CASCADE
  title         TEXT             -- nullable (Titel optional)
  body          TEXT     NOT NULL DEFAULT ''
  sort_order    INTEGER  NOT NULL DEFAULT 0
  created_at    TEXT     DEFAULT (datetime('now'))
  updated_at    TEXT     DEFAULT (datetime('now'))

amazon_research_card_links
  id            INTEGER PK
  card_id       INTEGER  → amazon_research_cards(id) ON DELETE CASCADE
  url           TEXT     NOT NULL
  label         TEXT             -- nullable
  sort_order    INTEGER  NOT NULL DEFAULT 0

amazon_research_card_images
  id            INTEGER PK
  card_id       INTEGER  → amazon_research_cards(id) ON DELETE CASCADE
  file_path     TEXT     NOT NULL
  original_name TEXT     NOT NULL
  mime          TEXT     NOT NULL
  sort_order    INTEGER  NOT NULL DEFAULT 0
```

- `PRAGMA foreign_keys` **nicht** in der Migration setzen (zentral in `migrate.ts`).
- Keine Bulk-Deletes/-Updates → kein expliziter `createBackup`-Aufruf nötig
  (Backup vor Migrationen läuft automatisch).

## API-Routen

Unter dem bestehenden Amazon-Router, Prefix `/amazon/products/:productId/research`:

- **Themen:** `GET /topics` (inkl. verschachtelter Karten/Links/Bilder),
  `POST /topics`, `PATCH /topics/:topicId` (title / is_expanded / sort_order),
  `DELETE /topics/:topicId`, `POST /topics/reorder`.
- **Karten:** `POST /topics/:topicId/cards`, `PATCH /cards/:cardId`
  (title / body / sort_order), `DELETE /cards/:cardId`, `POST /cards/reorder`.
- **Links:** `POST /cards/:cardId/links`, `PATCH /links/:linkId`,
  `DELETE /links/:linkId`. (Klein gehalten; ggf. als Teil des Karten-Patch, falls
  einfacher.)
- **Bilder:** `POST /cards/:cardId/images` (multipart, multer `single('file')`,
  max. 20 MB), `GET /images/:imageId` (Blob mit korrektem Content-Type),
  `DELETE /images/:imageId`, `POST /cards/:cardId/images/reorder` — exakt nach
  Vorbild `UspPointImages` / USP-Files-Route.

Auth/Owner-Checks wie bei den übrigen Amazon-Routen. Pfad-Traversal-Schutz beim
Datei-Handling übernehmen.

## Frontend

Neuer Ordner `frontend/src/components/amazon/research/`:

- `ResearchSection.tsx` — einklappbarer Top-Bereich, lädt Themen (TanStack Query),
  rendert Themen-Liste + „+ Thema". Eingebunden in die Entwicklungs-/Detailseite
  neben den anderen Sections.
- `ResearchTopicBlock.tsx` — ein Thema: Header (Titel inline editierbar, Anzahl,
  Klapp-/Löschen-Steuerung), Karten-Liste, „+ Karte", Drag-and-drop der Karten.
- `ResearchCard.tsx` — Titel-Input (optional) + Body-Textarea (Autosave on blur,
  Muster wie `ChecklistItemRow`/`BrandNotes`) + Links-Teil + Bilder-Teil.
- `ResearchCardLinks.tsx` — Liste der Links (url + label), hinzufügen/löschen.
- `ResearchCardImages.tsx` — Upload (Klick/Drag-and-drop/Clipboard-Paste),
  Thumbnails, Löschen, Reorder — nach Vorbild `UspPointImages.tsx`.
- API-Funktionen in `frontend/src/api/amazon.api.ts` ergänzen
  (`research*`-Funktionen + Typen) + passende Query-Hooks.

Drag-and-drop nach bestehendem Projekt-Muster (native Pointer-Events +
setPointerCapture, button-Ausnahme, sort_order persistieren; Backend nach
Routen-Änderung neu starten).

## UX-Regeln (Projekt-Konventionen)

- Echte Umlaute im sichtbaren Text (Ä/Ö/Ü/ä/ö/ü/ß).
- Bestätigung vor dem Löschen von Themen, Karten, Bildern.
- Zähler/Anzahl immer anzeigen (auch 0).
- Auto-Speicherung; keine extra „Speichern"-Buttons.

## Testkriterien (UAT)

1. Neues Thema anlegen, umbenennen, ein-/ausklappen, umsortieren, löschen (mit
   Bestätigung). Eingeklappt zeigt korrekte Karten-Anzahl.
2. Karte anlegen (mit/ohne Titel), Body mit Bulletpoints speichern (Autosave),
   Karten innerhalb eines Themas per Drag-and-drop umsortieren, löschen.
3. Mehrere Links mit Label hinzufügen/entfernen; Link öffnet in neuem Tab.
4. Mehrere Screenshots per Klick, Drag-and-drop und Cmd+V (Clipboard) hochladen;
   Thumbnails + Vollansicht; löschen (mit Bestätigung).
5. Alles bleibt pro Produkt getrennt; Reload zeigt gespeicherten Stand.
6. Bereich fügt sich optisch nahtlos in die übrigen Entwicklungs-Bereiche ein.

## Offen / bewusst NICHT enthalten (YAGNI)

- Produktübergreifende/globale Wissens-Sammlung (nur pro Produkt).
- Volltextsuche, Tags, Verknüpfung zu Checklisten-Punkten.
- Rich-Text/Markdown-Rendering im Body (reiner Text mit manuellen Bulletpoints
  reicht vorerst).
