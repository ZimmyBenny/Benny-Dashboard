# Checkliste — Gründungs-Sektion nicht in Produkte — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Master-Sektion „Gründung und einmalige Aufgaben" wird nicht mehr in Produkt-Checklisten kopiert (und aus bereits kopierten Produkten entfernt), während sie in der Master-Checkliste erhalten bleibt.

**Architecture:** Daten-getriebenes Flag `copy_to_products` auf `amazon_checklist_master_sections` (Migration 064), das `initProductFromMaster` beim Kopieren filtert. Dieselbe Migration setzt das Flag für die Gründungs-Sektion auf 0 und bereinigt bereits in Produkte kopierte Gründungs-Sektionen (Items explizit vor Sektionen, da `migrate.ts` mit `foreign_keys = OFF` läuft). Backend-Logik-Änderung ist eine Zeile; Tests werden an die reduzierte Produkt-Kopie angepasst.

**Tech Stack:** Node.js, Express 5, better-sqlite3, SQLite Migrations (`.sql`), Vitest + supertest.

---

## Datensicherheit

Die Bereinigung (DELETE) läuft als Migration → `migrate.ts` erstellt automatisch ein `pre-migration`-Backup. `PRAGMA foreign_keys` wird in der Migration **nicht** gesetzt. Master-Daten bleiben unverändert.

## Vorbedingung — Branch

Diese Arbeit gehört auf einen **eigenen Branch von `main`** (unabhängig von der Markenname-Arbeit). Vor Task 1:

```bash
cd "/Users/benny/Library/Mobile Documents/com~apple~CloudDocs/B E N N Y 👨🏽‍💻/09 - Benny Dashboard"
git checkout main
git checkout -b feat/checkliste-gruendung-nicht-in-produkte
```

Diese Branch-Erstellung übernimmt der Orchestrator vor dem ersten Subagent (nicht der Subagent selbst).

## File Structure

- **Create:** `backend/src/db/migrations/064_checklist_gruendung_not_in_products.sql` — Flag-Spalte + Flag setzen + Bereinigung.
- **Modify:** `backend/src/routes/amazon.checklist.routes.ts` — `initProductFromMaster` filtert `WHERE copy_to_products = 1`.
- **Modify:** `backend/test/integration.amazon_checklist.test.ts` — Erwartungen anpassen + neue Tests.

Alle Test-Befehle laufen aus dem `backend/`-Verzeichnis. Absoluter Pfad:
`/Users/benny/Library/Mobile Documents/com~apple~CloudDocs/B E N N Y 👨🏽‍💻/09 - Benny Dashboard/backend`

---

### Task 1: Migration 064 — Flag-Spalte + Gründung markieren + Bereinigung

**Files:**
- Create: `backend/src/db/migrations/064_checklist_gruendung_not_in_products.sql`

- [ ] **Step 1: Migration schreiben**

Erzeuge `backend/src/db/migrations/064_checklist_gruendung_not_in_products.sql` mit exakt diesem Inhalt:

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

- [ ] **Step 2: Migration greift in der Test-DB (Smoke über bestehende Suite)**

Die Test-DB (`createTestDb`) wendet alle `.sql`-Migrationen an. Prüfe, dass die neue Migration syntaktisch sauber lädt, indem du die Checklist-Suite startest (sie wird in Task 3 grün gemacht — hier zählt nur, dass KEIN SQL-Fehler beim DB-Aufbau auftritt):

Run: `cd "/Users/benny/Library/Mobile Documents/com~apple~CloudDocs/B E N N Y 👨🏽‍💻/09 - Benny Dashboard/backend" && npx vitest run test/integration.amazon_checklist.test.ts 2>&1 | head -40`
Expected: Tests LAUFEN (keine „SQLITE_ERROR"/„no such column"-Meldung beim Setup). Einige Assertions schlagen jetzt erwartungsgemäß fehl (5 vs. 4 Sektionen) — das ist OK und wird in Task 3 behoben. Wenn das Setup selbst crasht (Migration kaputt), STOPP und beheben.

- [ ] **Step 3: Commit**

```bash
git add "backend/src/db/migrations/064_checklist_gruendung_not_in_products.sql"
git commit -m "feat(amazon-checklist): Migration 064 — copy_to_products-Flag + Gruendung aus Produkten" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `initProductFromMaster` filtert nach `copy_to_products`

**Files:**
- Modify: `backend/src/routes/amazon.checklist.routes.ts`

- [ ] **Step 1: Filter ergänzen**

In `backend/src/routes/amazon.checklist.routes.ts`, Funktion `initProductFromMaster` (beginnt bei `function initProductFromMaster(productId: number): void {`), die erste Query ersetzen.

Ersetze:

```ts
  const masterSections = db.prepare(
    `SELECT * FROM amazon_checklist_master_sections ORDER BY sort_order, id`
  ).all() as SectionRow[];
```

durch:

```ts
  const masterSections = db.prepare(
    `SELECT * FROM amazon_checklist_master_sections WHERE copy_to_products = 1 ORDER BY sort_order, id`
  ).all() as SectionRow[];
```

Nur diese eine Stelle ändern. `loadMasterSectionsWithItems` (Master-GET) NICHT anfassen — die liefert weiter alle Sektionen.

- [ ] **Step 2: Typecheck**

Run: `cd "/Users/benny/Library/Mobile Documents/com~apple~CloudDocs/B E N N Y 👨🏽‍💻/09 - Benny Dashboard/backend" && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add "backend/src/routes/amazon.checklist.routes.ts"
git commit -m "feat(amazon-checklist): Produkt-Kopie ueberspringt Sektionen mit copy_to_products=0" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Tests anpassen + neue Tests

**Files:**
- Modify: `backend/test/integration.amazon_checklist.test.ts`

Hintergrund: Produkt-Init liefert jetzt **4 Sektionen / 52 Items** (Gründung = 14 Items entfällt). Erwartete verbleibende Sektions-Titel: `Produktsuche`, `Produkteinkauf`, `Amazon Listing erstellen`, `Bei Verkäufen außerhalb der EU`.

- [ ] **Step 1: Bestehende Produkt-Erwartungen anpassen**

In `backend/test/integration.amazon_checklist.test.ts`:

(a) Im Test `GET /products/:id/checklist initialisiert lazy aus Master` ersetze
```ts
    expect(r.body.sections).toHaveLength(5);
```
durch
```ts
    expect(r.body.sections).toHaveLength(4);
```
und ersetze
```ts
    expect(total).toBe(66);
```
durch
```ts
    expect(total).toBe(52);
```

(b) Im Test `GET zweimal hintereinander dupliziert nichts` ersetze
```ts
    expect(sec).toBe(5);
```
durch
```ts
    expect(sec).toBe(4);
```

(c) Im Test `Master-Aenderung wirkt nicht auf bestehende Produkt-Checklist` ersetze
```ts
    expect(r.body.sections).toHaveLength(5);
```
durch
```ts
    expect(r.body.sections).toHaveLength(4);
```

(d) Im Test `Produkt-Section DELETE entfernt Items (Cascade)` ersetze
```ts
    const secId = init.body.sections[4].id; // OSS-Section mit 1 Item
```
durch
```ts
    const secId = init.body.sections[init.body.sections.length - 1].id; // OSS-Section mit 1 Item
```

- [ ] **Step 2: Neue Tests am Ende der `describe('Checklist API — Produkt', …)`-Suite einfügen**

Füge in `backend/test/integration.amazon_checklist.test.ts` direkt VOR der schließenden `});` der `describe('Checklist API — Produkt', …)`-Suite (die Zeile unmittelbar nach dem Test `Master-Aenderung wirkt nicht auf bestehende Produkt-Checklist`) diese Tests ein:

```ts
  it('Produkt-Init ueberspringt die Gruendungs-Sektion', async () => {
    const pid = makeProduct(db);
    const r = await request(app).get(`/api/amazon/products/${pid}/checklist`);
    expect(r.status).toBe(200);
    const titles = r.body.sections.map((s: { title: string }) => s.title);
    expect(titles).not.toContain('Gründung und einmalige Aufgaben');
    expect(titles).toEqual([
      'Produktsuche',
      'Produkteinkauf',
      'Amazon Listing erstellen',
      'Bei Verkäufen außerhalb der EU',
    ]);
  });

  it('Master behaelt die Gruendungs-Sektion', async () => {
    const r = await request(app).get('/api/amazon/checklist/master');
    expect(r.status).toBe(200);
    const titles = r.body.sections.map((s: { title: string }) => s.title);
    expect(titles).toContain('Gründung und einmalige Aufgaben');
    expect(r.body.sections).toHaveLength(5);
  });

  it('copy_to_products-Flag: Gruendung=0, uebrige=1', async () => {
    const gruendung = db.prepare(
      `SELECT copy_to_products AS c FROM amazon_checklist_master_sections WHERE title = 'Gründung und einmalige Aufgaben'`
    ).get() as { c: number };
    expect(gruendung.c).toBe(0);
    const others = db.prepare(
      `SELECT COUNT(*) AS c FROM amazon_checklist_master_sections WHERE title != 'Gründung und einmalige Aufgaben' AND copy_to_products != 1`
    ).get() as { c: number };
    expect(others.c).toBe(0);
  });

  it('Bereinigung entfernt bereits kopierte Gruendungs-Sektion (Items zuerst)', async () => {
    const pid = makeProduct(db);
    // Alt-Zustand simulieren: Gruendungs-Sektion + Item direkt als Produkt-Kopie einfuegen
    const secRes = db.prepare(
      `INSERT INTO amazon_checklist_product_sections (product_id, sort_order, title) VALUES (?, 1, 'Gründung und einmalige Aufgaben')`
    ).run(pid);
    const sid = Number(secRes.lastInsertRowid);
    db.prepare(
      `INSERT INTO amazon_checklist_product_items (section_id, sort_order, description) VALUES (?, 1, 'Alt-Eintrag')`
    ).run(sid);

    // Bereinigungs-Statements der Migration 064 (Items VOR Sektionen)
    db.prepare(
      `DELETE FROM amazon_checklist_product_items
         WHERE section_id IN (
           SELECT id FROM amazon_checklist_product_sections
           WHERE title = 'Gründung und einmalige Aufgaben'
         )`
    ).run();
    db.prepare(
      `DELETE FROM amazon_checklist_product_sections
         WHERE title = 'Gründung und einmalige Aufgaben'`
    ).run();

    const secLeft = (db.prepare(
      `SELECT COUNT(*) AS c FROM amazon_checklist_product_sections WHERE id = ?`
    ).get(sid) as { c: number }).c;
    const itemsLeft = (db.prepare(
      `SELECT COUNT(*) AS c FROM amazon_checklist_product_items WHERE section_id = ?`
    ).get(sid) as { c: number }).c;
    expect(secLeft).toBe(0);
    expect(itemsLeft).toBe(0);
  });
```

- [ ] **Step 3: Volle Checklist-Suite grün**

Run: `cd "/Users/benny/Library/Mobile Documents/com~apple~CloudDocs/B E N N Y 👨🏽‍💻/09 - Benny Dashboard/backend" && npx vitest run test/integration.amazon_checklist.test.ts`
Expected: ALLE Tests PASS (angepasste + 4 neue).

- [ ] **Step 4: Gesamte Backend-Test-Suite (Regressions-Check)**

Run: `cd "/Users/benny/Library/Mobile Documents/com~apple~CloudDocs/B E N N Y 👨🏽‍💻/09 - Benny Dashboard/backend" && npx vitest run`
Expected: Keine NEUEN Fehlschläge durch diese Änderung. Falls ein anderer Test unabhängig von Checkliste bereits vorher rot war, notieren (nicht in diesem Task fixen). Insbesondere darf kein Test brechen, der Produkt-Checklisten mit 5 Sektionen/66 Items annimmt — solche (falls außerhalb der Checklist-Suite vorhanden) ebenfalls anpassen und im Bericht nennen.

- [ ] **Step 5: Commit**

```bash
git add "backend/test/integration.amazon_checklist.test.ts"
git commit -m "test(amazon-checklist): Produkt-Kopie ohne Gruendung + Bereinigung abgedeckt" -m "Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Manuelle Verifikation (UAT)

**Files:** keine — Verifikation.

- [ ] **Step 1: Backend neu starten / Migration anwenden**

Backend neu starten (Dev). Im Log erscheint `createBackup('pre-migration')` und `[migrate] Applied 064_checklist_gruendung_not_in_products.sql`. Bei stale Backend: `lsof -i :3001`, ggf. `pkill -f "tsx watch"` + neu starten.

- [ ] **Step 2: Bestehendes Produkt prüfen**

Produkt mit bereits initialisierter Checkliste öffnen (z. B. „Rausfallschutz Boxspringbett"). Erwartung: **keine** Sektion „Gründung und einmalige Aufgaben" mehr; die übrigen Sektionen vollständig vorhanden.

- [ ] **Step 3: Neues Produkt prüfen**

Neues Produkt anlegen, Checkliste öffnen. Erwartung: 4 Sektionen, keine Gründung.

- [ ] **Step 4: Master prüfen (Datenerhalt)**

`/amazon/entwicklung/checkliste` öffnen. Erwartung: „Gründung und einmalige Aufgaben" ist **weiterhin vorhanden**, inkl. bisherigem Häkchen-Stand. Master unverändert.

- [ ] **Step 5: Abschluss**

Alle Schritte grün → fertig. Bei Abweichung → systematic-debugging.

---

## Self-Review

**Spec coverage:**
- Flag-Spalte + Gründung=0 → Task 1 ✅
- Bereinigung bereits kopierter Sektionen (Items zuerst, FK-OFF-sicher) → Task 1 + Test Task 3 ✅
- `initProductFromMaster` filtert `copy_to_products = 1` → Task 2 ✅
- Master bleibt unverändert → durch Design (nur Produkt-Init gefiltert); Test „Master behaelt…" Task 3 ✅
- Auto-Backup via Migration → migrate.ts (kein Code nötig); UAT Step 1 verifiziert ✅
- Test-Anpassungen (5→4 / 66→52 / sections[last]) + neue Tests → Task 3 ✅
- Kein Frontend-Change → keine Frontend-Tasks ✅

**Placeholder scan:** keine TBD/TODO; alle Schritte mit konkretem Code/SQL/Commands.

**Type consistency:** Spalten-/Titelnamen konsistent (`copy_to_products`, `'Gründung und einmalige Aufgaben'`); echte Umlaute in allen Strings (kein Ae/Oe/ss); erwartete Zahlen konsistent (4 Sektionen, 52 Items, 14 entfernte Items). Test-Helfer `makeProduct`/`request(app)` existieren bereits in der Datei.
