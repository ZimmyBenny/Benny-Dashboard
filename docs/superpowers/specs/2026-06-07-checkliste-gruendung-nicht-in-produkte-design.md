# Checkliste — Sektion „Gründung und einmalige Aufgaben" nicht in Produkte kopieren

**Status:** Entwurf — bereit zur Review
**Datum:** 2026-06-07
**Modul:** Amazon Checkliste (Master → Produkt-Kopie)

---

## Ziel

Wenn die Master-Checkliste in ein Produkt kopiert wird (`initProductFromMaster`, lazy beim
ersten Öffnen der Produkt-Checkliste), soll die Sektion **„Gründung und einmalige Aufgaben"**
**nicht** mitkopiert werden. Alle anderen Sektionen weiterhin schon.

In der **Master-Checkliste bleibt die Sektion vollständig erhalten** (inkl. des dort gesetzten
Häkchen-Stands) — die Änderung betrifft ausschließlich das Kopieren auf Produktebene.

Zusätzlich: Produkte, die die Sektion **bereits** kopiert bekommen haben, sollen sie verlieren
(Bereinigung), damit die Sektion nirgends mehr auf Produktebene auftaucht.

## Hintergrund (aktueller Stand)

- `amazon_checklist_master_sections` (Seed: 5 Sektionen, id 1 = „Gründung und einmalige Aufgaben").
- `initProductFromMaster(productId)` in `backend/src/routes/amazon.checklist.routes.ts` kopiert
  **alle** Master-Sektionen + Items in `amazon_checklist_product_sections` /
  `amazon_checklist_product_items`. Auslöser: `GET /products/:id/checklist`, wenn das Produkt
  noch keine Sektionen hat.
- `migrate.ts` setzt während Migrationen `foreign_keys = OFF` → **ON DELETE CASCADE greift in
  Migrationen NICHT**. `test/setup.ts` läuft dagegen mit `foreign_keys = ON`.

## Datenmodell-Entscheidung

Steuerung über ein **Flag auf der Master-Sektion** statt Titel-Vergleich im Code:

- Neue Spalte `copy_to_products INTEGER NOT NULL DEFAULT 1 CHECK (copy_to_products IN (0,1))`
  auf `amazon_checklist_master_sections`.
- Für „Gründung und einmalige Aufgaben" auf `0` gesetzt.
- `initProductFromMaster` filtert `WHERE copy_to_products = 1`.

Vorteile: übersteht Umbenennungen der Sektion, datengetrieben, künftig erweiterbar (weitere
Sektionen könnten per Flag aus dem Produkt-Copy genommen werden — kein Code-Change nötig).

Gleiches Muster wie das bestehende `sample_ordered`-Flag (Migration 059):
`ADD COLUMN … INTEGER NOT NULL DEFAULT … CHECK (… IN (0,1))`.

## Scope

### In Scope
- Migration `064_checklist_gruendung_not_in_products.sql`:
  1. Spalte `copy_to_products` ergänzen (Default 1).
  2. `copy_to_products = 0` für die Gründungs-Sektion setzen.
  3. Bereits kopierte Gründungs-Sektionen aus allen Produkten entfernen (Items **explizit
     zuerst**, dann Sektionen — wegen FK OFF in `migrate.ts`).
- Backend: `initProductFromMaster` filtert `WHERE copy_to_products = 1`.
- Tests: bestehende Produkt-Tests an die neue Sektions-/Item-Anzahl anpassen + neue Tests
  (Filter-Verhalten, Flag-Zustand, Bereinigungs-Logik).

### Explizit out of Scope
- UI-Toggle „in Produkte übernehmen" pro Master-Sektion (mögliche spätere Erweiterung).
- Frontend-Änderungen (Master-GET liefert die Extra-Spalte mit; Frontend ignoriert sie).
- Änderungen an der Master-Checkliste selbst (Sektion + Häkchen bleiben).

## Datensicherheit

- Punkt 3 (Bereinigung) ist eine destruktive Bulk-Operation. Sie läuft als **Migration** →
  `migrate.ts` erstellt automatisch das `pre-migration`-Backup, bevor die Migration ausgeführt
  wird. Kein manueller `createBackup`-Aufruf nötig.
- `PRAGMA foreign_keys` wird in der Migration **nicht** gesetzt (zentral in `migrate.ts`).
- Master-Daten werden nicht verändert.

## Migration 064 (SQL)

Datei: `backend/src/db/migrations/064_checklist_gruendung_not_in_products.sql`

```sql
-- Migration 064: Sektion "Gründung und einmalige Aufgaben" nicht in Produkte kopieren (2026-06-07)
-- WICHTIG: Kein FK-Pragma setzen — migrate.ts steuert foreign_keys zentral (OFF während Migration)
-- WICHTIG: Auto-Backup läuft via migrate.ts
-- Da foreign_keys während der Migration OFF ist, greift ON DELETE CASCADE NICHT —
-- daher Produkt-Items explizit VOR den Produkt-Sektionen löschen.

ALTER TABLE amazon_checklist_master_sections
  ADD COLUMN copy_to_products INTEGER NOT NULL DEFAULT 1
  CHECK (copy_to_products IN (0,1));

UPDATE amazon_checklist_master_sections
  SET copy_to_products = 0
  WHERE title = 'Gründung und einmalige Aufgaben';

DELETE FROM amazon_checklist_product_items
  WHERE section_id IN (
    SELECT id FROM amazon_checklist_product_sections
    WHERE title = 'Gründung und einmalige Aufgaben'
  );

DELETE FROM amazon_checklist_product_sections
  WHERE title = 'Gründung und einmalige Aufgaben';
```

Hinweis: Die Bereinigung matcht Produkt-Sektionen über den kopierten Titel
`'Gründung und einmalige Aufgaben'`. Das ist der Titel, der beim Kopieren aus dem Master
übernommen wurde.

## Backend-Änderung

In `backend/src/routes/amazon.checklist.routes.ts`, Funktion `initProductFromMaster`, die
Master-Sektions-Abfrage filtern:

```ts
const masterSections = db.prepare(
  `SELECT * FROM amazon_checklist_master_sections WHERE copy_to_products = 1 ORDER BY sort_order, id`
).all() as SectionRow[];
```

(einzige Logik-Änderung; `SELECT *` liefert die neue Spalte mit, sie wird beim Kopieren nicht
verwendet.) `loadMasterSectionsWithItems` (Master-GET) bleibt unverändert und liefert weiter
alle 5 Sektionen.

## Test-Anpassungen

Datei: `backend/test/integration.amazon_checklist.test.ts`. Test-DB (`createTestDb`) wendet alle
Migrationen inkl. 064 an → Produkt-Init liefert künftig **4 Sektionen / 52 Items** (5 Sektionen /
66 Items minus Gründung mit 14 Items).

**Bestehende Tests anpassen:**
- „GET /products/:id/checklist initialisiert lazy aus Master": `toHaveLength(5)` → `4`;
  `toBe(66)` → `52`.
- „GET zweimal hintereinander dupliziert nichts": erwartete Sektions-Anzahl `5` → `4`.
- „Master-Aenderung wirkt nicht auf bestehende Produkt-Checklist": `toHaveLength(5)` → `4`.
- „Produkt-Section DELETE entfernt Items (Cascade)": Zugriff `init.body.sections[4]` ist nach der
  Reduktion ungültig → robust auf die **letzte** Sektion umstellen:
  `init.body.sections[init.body.sections.length - 1]` (das ist weiterhin die OSS-Sektion mit 1 Item).

Master-Suite-Tests (5 Sektionen / 66 Items auf `/master`) bleiben unverändert korrekt.

**Neue Tests:**
- „Produkt-Init überspringt Gründungs-Sektion": nach Init enthält kein Sektions-Titel
  `'Gründung und einmalige Aufgaben'`; die 4 erwarteten Titel sind vorhanden.
- „Master behält Gründungs-Sektion": `/master` liefert weiter 5 Sektionen inkl. Gründung.
- „copy_to_products-Flag korrekt gesetzt": Gründungs-Sektion `copy_to_products = 0`, die übrigen
  `= 1`.
- „Bereinigung entfernt bereits kopierte Gründungs-Sektion": eine manuell als Produkt-Sektion
  `'Gründung und einmalige Aufgaben'` + Item eingefügte Alt-Kopie wird durch die beiden
  DELETE-Statements der Migration (Items zuerst) restlos entfernt (Sektion weg, Items weg).

## Manuelles UAT
1. Backend neu starten → Migration 064 läuft, `pre-migration`-Backup wird erstellt (Log prüfen).
2. Bestehendes Produkt mit bereits initialisierter Checkliste öffnen → **keine** Sektion
   „Gründung und einmalige Aufgaben" mehr; übrige Sektionen vollständig.
3. **Neues** Produkt anlegen, Checkliste öffnen → 4 Sektionen, keine Gründung.
4. Master-Checkliste (`/amazon/entwicklung/checkliste`) öffnen → „Gründung und einmalige
   Aufgaben" ist **weiterhin da**, inkl. bisherigem Häkchen-Stand.
5. Datenkontrolle: Master-Items/Häkchen unverändert.

## Offene Punkte / später
- Optionaler UI-Toggle pro Master-Sektion „in neue Produkte übernehmen" (nutzt dasselbe Flag).
