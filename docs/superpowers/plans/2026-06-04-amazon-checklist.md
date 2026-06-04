# Amazon Checkliste — Master + Produkt-Kopie Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine zentrale Master-Checkliste unter `/amazon/entwicklung/checkliste` mit 66 Seed-Items in 5 Sections, plus pro-Produkt-Kopie als Akkordeon-Sektion auf der Detail-Seite. Beim ersten Detail-Aufruf wird die Master in das Produkt kopiert; ab dann unabhängig.

**Architecture:** Vier neue SQLite-Tabellen (Master-Sections, Master-Items, Produkt-Sections, Produkt-Items) mit Cascade-Delete am Produkt bzw. an der Section. Neue Backend-Route-Datei `amazon.checklist.routes.ts` mit getrennten Master- und Produkt-Endpoints; Lazy-Init kopiert Master in Produkt-Tabellen beim ersten GET. Frontend: neue Master-Page + wiederverwendbare Section/Item-Komponenten (gleicher Code für Master- und Produkt-Modus, Switch per Mode-Prop), Akkordeon-Wrapper auf der Detail-Seite, Sidebar-Unterpunkt unter Amazon.

**Tech Stack:** better-sqlite3, Express 5, vitest + supertest (Backend) — React 19, TanStack Query 5, axios, Tailwind v4 (Frontend).

**Spec:** `docs/superpowers/specs/2026-06-04-amazon-checklist-design.md`

---

## Datei-Übersicht

| Pfad | Zweck |
|------|-------|
| `backend/src/db/migrations/062_amazon_checklist.sql` | 4 Tabellen + Seed-Daten |
| `backend/test/schema.amazon_checklist.test.ts` | Schema-Test inkl. Seed-Counts |
| `backend/src/routes/amazon.checklist.routes.ts` | Master + Produkt-CRUD + Lazy-Init |
| `backend/test/integration.amazon_checklist.test.ts` | Integration-Tests |
| `backend/src/app.ts` | Mount neue Route |
| `frontend/src/api/amazon.api.ts` | Types + Wrappers (Master + Produkt) |
| `frontend/src/hooks/amazon/useChecklistMaster.ts` | Master Query-Hooks |
| `frontend/src/hooks/amazon/useChecklistProduct.ts` | Produkt Query-Hooks |
| `frontend/src/components/amazon/checklist/ChecklistItemRow.tsx` | Eine Item-Zeile |
| `frontend/src/components/amazon/checklist/AddItemForm.tsx` | Inline-Form fuer neues Item |
| `frontend/src/components/amazon/checklist/EditItemDialog.tsx` | Modal fuer Bemerkung + Link |
| `frontend/src/components/amazon/checklist/AddSectionForm.tsx` | Inline-Form fuer neue Section |
| `frontend/src/components/amazon/checklist/ChecklistSectionBlock.tsx` | Section-Header + Items + AddForm |
| `frontend/src/components/amazon/checklist/ChecklistSection.tsx` | Akkordeon-Wrapper fuer Detail-Seite |
| `frontend/src/pages/amazon/AmazonChecklistMasterPage.tsx` | Master-Seite |
| `frontend/src/routes/routes.tsx` | Route fuer Master-Page |
| `frontend/src/components/layout/navConfig.ts` | Sidebar-Unterpunkt + pageNames |
| `frontend/src/pages/amazon/AmazonProductDetailPage.tsx` | `<ChecklistSection>` einbinden |

---

## Task 1: Migration 062 + Schema-Test + Seed-Daten

**Files:**
- Create: `backend/src/db/migrations/062_amazon_checklist.sql`
- Create: `backend/test/schema.amazon_checklist.test.ts`

- [ ] **Step 1: Schema-Test schreiben (RED)**

Datei `backend/test/schema.amazon_checklist.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import type Database from 'better-sqlite3';
import { createTestDb } from './setup';

interface SqliteMaster { name: string; type: string; }
interface ColumnInfo { name: string; type: string; notnull: number; dflt_value: string | null; pk: number; }

describe('Migration 062 — amazon_checklist (Master + Product)', () => {
  let db: Database.Database;
  beforeEach(() => { db = createTestDb(); });

  it('erstellt alle 4 Tabellen', () => {
    for (const name of [
      'amazon_checklist_master_sections',
      'amazon_checklist_master_items',
      'amazon_checklist_product_sections',
      'amazon_checklist_product_items',
    ]) {
      const row = db.prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
      ).get(name) as SqliteMaster | undefined;
      expect(row, `Tabelle ${name} fehlt`).toBeDefined();
    }
  });

  it('hat Indizes', () => {
    for (const name of [
      'amazon_checklist_master_items_section_idx',
      'amazon_checklist_product_sections_product_idx',
      'amazon_checklist_product_items_section_idx',
    ]) {
      const row = db.prepare(
        `SELECT name FROM sqlite_master WHERE type='index' AND name=?`
      ).get(name);
      expect(row, `Index ${name} fehlt`).toBeDefined();
    }
  });

  it('master_items hat is_done mit CHECK', () => {
    const cols = db.prepare(`PRAGMA table_info(amazon_checklist_master_items)`).all() as ColumnInfo[];
    const isDone = cols.find(c => c.name === 'is_done');
    expect(isDone).toBeDefined();
    expect(() => db.prepare(
      `INSERT INTO amazon_checklist_master_sections (title) VALUES ('S1')`
    ).run()).not.toThrow();
    const sid = (db.prepare(`SELECT last_insert_rowid() AS id`).get() as { id: number }).id;
    expect(() => db.prepare(
      `INSERT INTO amazon_checklist_master_items (section_id, description, is_done) VALUES (?, 'X', ?)`
    ).run(sid, 2)).toThrow();
  });

  it('Seed: 5 Master-Sections mit erwarteten Titeln und Item-Counts', () => {
    const sections = db.prepare(
      `SELECT id, title FROM amazon_checklist_master_sections ORDER BY sort_order, id`
    ).all() as Array<{ id: number; title: string }>;
    const titles = sections.map(s => s.title);
    expect(titles).toEqual([
      'Gründung und einmalige Aufgaben',
      'Produktsuche',
      'Produkteinkauf',
      'Amazon Listing erstellen',
      'Bei Verkäufen außerhalb der EU',
    ]);

    function count(title: string): number {
      const s = sections.find(s => s.title === title);
      if (!s) return -1;
      return (db.prepare(
        `SELECT COUNT(*) AS c FROM amazon_checklist_master_items WHERE section_id = ?`
      ).get(s.id) as { c: number }).c;
    }
    expect(count('Gründung und einmalige Aufgaben')).toBe(14);
    expect(count('Produktsuche')).toBe(13);
    expect(count('Produkteinkauf')).toBe(19);
    expect(count('Amazon Listing erstellen')).toBe(19);
    expect(count('Bei Verkäufen außerhalb der EU')).toBe(1);
  });

  it('Section "Produktsuche" hat ein Item mit Link auf EZT Online', () => {
    const sec = db.prepare(
      `SELECT id FROM amazon_checklist_master_sections WHERE title = 'Produktsuche'`
    ).get() as { id: number };
    const item = db.prepare(
      `SELECT description, link_url FROM amazon_checklist_master_items
       WHERE section_id = ? AND description LIKE 'Zolltarifnummer%'`
    ).get(sec.id) as { description: string; link_url: string | null } | undefined;
    expect(item).toBeDefined();
    expect(item!.link_url).toContain('ezt-online.de');
  });

  it('Cascade: Produkt löschen entfernt product_sections + items', () => {
    db.prepare(`INSERT INTO amazon_products (name) VALUES ('P')`).run();
    const pid = (db.prepare(`SELECT last_insert_rowid() AS id`).get() as { id: number }).id;
    db.prepare(`INSERT INTO amazon_checklist_product_sections (product_id, title) VALUES (?, 'S')`).run(pid);
    const sid = (db.prepare(`SELECT last_insert_rowid() AS id`).get() as { id: number }).id;
    db.prepare(`INSERT INTO amazon_checklist_product_items (section_id, description) VALUES (?, 'I')`).run(sid);

    db.prepare(`DELETE FROM amazon_products WHERE id=?`).run(pid);

    expect(db.prepare(`SELECT * FROM amazon_checklist_product_sections WHERE product_id=?`).all(pid)).toEqual([]);
    expect(db.prepare(`SELECT * FROM amazon_checklist_product_items WHERE section_id=?`).all(sid)).toEqual([]);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fail bestaetigen**

```bash
cd backend && npm test -- schema.amazon_checklist
```
Erwartet: alle 6 Tests **FAIL**.

- [ ] **Step 3: Migration schreiben (GREEN)**

Datei `backend/src/db/migrations/062_amazon_checklist.sql`:

```sql
-- Migration 062: Amazon Checkliste — Master + Produkt-Kopien (2026-06-04)
-- WICHTIG: Kein FK-Pragma setzen
-- WICHTIG: Auto-Backup laeuft via migrate.ts

CREATE TABLE amazon_checklist_master_sections (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  title       TEXT    NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE amazon_checklist_master_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id  INTEGER NOT NULL
              REFERENCES amazon_checklist_master_sections(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  description TEXT    NOT NULL,
  remark      TEXT,
  link_url    TEXT,
  link_label  TEXT,
  is_done     INTEGER NOT NULL DEFAULT 0 CHECK (is_done IN (0,1)),
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX amazon_checklist_master_items_section_idx
  ON amazon_checklist_master_items (section_id, sort_order, id);

CREATE TABLE amazon_checklist_product_sections (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL
              REFERENCES amazon_products(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  title       TEXT    NOT NULL,
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX amazon_checklist_product_sections_product_idx
  ON amazon_checklist_product_sections (product_id, sort_order, id);

CREATE TABLE amazon_checklist_product_items (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  section_id  INTEGER NOT NULL
              REFERENCES amazon_checklist_product_sections(id) ON DELETE CASCADE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  description TEXT    NOT NULL,
  remark      TEXT,
  link_url    TEXT,
  link_label  TEXT,
  is_done     INTEGER NOT NULL DEFAULT 0 CHECK (is_done IN (0,1)),
  created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX amazon_checklist_product_items_section_idx
  ON amazon_checklist_product_items (section_id, sort_order, id);

-- ── Seed-Daten: 5 Master-Sections + 66 Items ─────────────────────────────────

INSERT INTO amazon_checklist_master_sections (id, sort_order, title) VALUES
  (1, 1, 'Gründung und einmalige Aufgaben'),
  (2, 2, 'Produktsuche'),
  (3, 3, 'Produkteinkauf'),
  (4, 4, 'Amazon Listing erstellen'),
  (5, 5, 'Bei Verkäufen außerhalb der EU');

INSERT INTO amazon_checklist_master_items (section_id, sort_order, description, remark) VALUES
  (1,  1, 'Erlaubnis Arbeitgeber', 'Kann ein Kündigungsgrund sein'),
  (1,  2, 'Elster Registrierung', 'Mit ElsterSecureApp'),
  (1,  3, 'Gewerbeanmeldung durchführen', 'Bei der Stadt'),
  (1,  4, 'Steuerlichen Erfassungsbogen einreichen (nach Gewerbebescheinigung)', 'Innerhalb von 4 Wochen mit Elster'),
  (1,  5, 'Steuernummer und Umsatzsteuer-ID beantragen', 'Mit Steuerlichem Erfassungsbogen'),
  (1,  6, 'Sozialversicherung anmelden/informieren', 'Über Arbeitgeber/Selbstständigkeit'),
  (1,  7, 'Anmeldung bei der Berufsgenossenschaft', 'Innerhalb einer Woche'),
  (1,  8, 'EORI Nummer beantragen', 'Beim Zoll'),
  (1,  9, 'Geschäftskonto eröffnen mit Kreditkarte', 'Online (N26 Bank/gebührenfrei.com)'),
  (1, 10, 'Registrierung Buchhaltungssoftware', 'Lexware Office (Innerhalb von DE empfohlen)'),
  (1, 11, 'Steuerberater finden (mit E-Commerce Expertise)', 'DHW in Oberhausen'),
  (1, 12, 'Im Amazon Seller Center registrieren', 'Keine Kosten ohne Umsatz'),
  (1, 13, 'Alle Unternehmensangaben bei Amazon hinterlegen (UID, Adresse…)', 'Markenregistrierung geht auch später noch'),
  (1, 14, 'Kreditkarte bei Amazon hinterlegen', 'Kreditkarten und Bankkonto registrieren');

INSERT INTO amazon_checklist_master_items (section_id, sort_order, description, remark) VALUES
  (2,  1, 'Profitables Produkt mit USP suchen (Helium 10)', 'Siehe Produktcheckliste'),
  (2,  2, 'Marge grob berechnen', 'Profitabilitätsrechner Helium10'),
  (2,  3, 'Patent & Designschutz abklären', 'EUIPO eSearch Plus'),
  (2,  4, 'Zertifikate abklären', 'TÜV, QIMA, Travado Compliance'),
  (2,  5, 'Logo designen und Markennamen ausdenken', 'Canva, namelix, TMView, DPMA'),
  (2,  6, 'Samples bestellen', '2-3 Samples bestellen'),
  (2,  7, 'Transportkosten anfragen', 'asia-logistics.de, sam-logistik.de, AGL');

INSERT INTO amazon_checklist_master_items (section_id, sort_order, description, remark, link_url, link_label) VALUES
  (2,  8, 'Zolltarifnummer herausfinden', 'erfrage bei info.gewerblich@zoll.de', 'https://auskunft.ezt-online.de/', 'EZT Online');

INSERT INTO amazon_checklist_master_items (section_id, sort_order, description, remark) VALUES
  (2,  9, 'Marge nochmals kalkulieren', 'Chance/Risiko Rechner'),
  (2, 10, 'Markennamen erstellen & Marke anmelden', 'Beim DPMA oder EUIPO mit Rabatt'),
  (2, 11, 'Domain registrieren', 'checkdomain.de (gluecksberg.com)'),
  (2, 12, 'Mitbewerber Produkte bestellen und vergleichen', 'Danach wieder zurückschicken'),
  (2, 13, 'Für einen Hersteller entscheiden', 'Vorteilhaft über Jingsourcing');

INSERT INTO amazon_checklist_master_items (section_id, sort_order, description, remark) VALUES
  (3,  1, 'PO Agreement erstellen und unterzeichnen lassen', 'Mit ChatGPT'),
  (3,  2, 'Bei GS1 registrieren und EANs kaufen', 'SmartStarter 10 GS1 mit Zertifikat (empfohlen)'),
  (3,  3, 'Barcodes für jede Variante erstellen', 'GS1 GTIN anlegen'),
  (3,  4, 'Verpackungsdesign erstellen (lassen)', 'Packaging Template bei Lieferanten anfragen'),
  (3,  5, 'Flyer ertellen (lassen)', 'Rahad/ChatGPT/Canva'),
  (3,  6, 'Product Etikett/Label (Care Label) erstellen, wenn nötig', 'ChatGPT/Canva'),
  (3,  7, 'QR Codes (pro Variante) für Bewertungen erstellen', 'In der AMZ Ecosystem App (bei Ressourcen)'),
  (3,  8, 'Bewertungskarten ertellen (lassen)', 'Rahad/ChatGPT/Canva'),
  (3,  9, 'Amazon Listing anlegen', 'Amazon Seller Account'),
  (3, 10, 'QR Code mit Bewertunglink hinterlegen', 'In der AMZ Ecosystem App (bei Ressourcen)'),
  (3, 11, 'TÜV Zertifizierung und Labortests durchführen lassen', 'TÜV Süd, TÜV Rheinland, QIMA'),
  (3, 12, 'Masterbox Label (mit heavy weight label) erstellen', 'Word Template'),
  (3, 13, 'Bestellung aufgeben über Alibaba Trade Assurance', 'Alibaba Trade Assurance oder Jingsourcing (sicher)'),
  (3, 14, 'Import organisieren (Invoice, Packliste & ZTN mitsenden)', 'Amazon AGL oder Asia Logistik'),
  (3, 15, 'Transportversicherung abschließen', 'Direkt über AGL oder Allianz, AXA etc'),
  (3, 16, 'Qualitätskontrolle in China organisieren', 'AsiaInspection, Jingsourcing, GQC (Stephan)'),
  (3, 17, 'Transportversicherung abschließen', 'Über AGL'),
  (3, 18, 'Registrierung Verpackungsregister LUCID', 'verpackungsregister.org'),
  (3, 19, 'Verpackungslizenzierung LUCID', 'Usepac/Prezero/DerGrünePunkt (empfohlen)');

INSERT INTO amazon_checklist_master_items (section_id, sort_order, description, remark) VALUES
  (4,  1, 'Produktbilder erstellen', 'KI (Freepik)'),
  (4,  2, 'Keyword Recherche', 'Helium 10 Cerebro und Keyword Prozessor'),
  (4,  3, 'Titel erstellen', '<200 Bytes am besten sogar <80 Bytes'),
  (4,  4, 'Bullet Points erstellen', '200-249 Bytes nicht >249'),
  (4,  5, 'Produktsuche (Backend) Keywords', '<249 Bytes'),
  (4,  6, 'Produktbeschreibung erstellen', '<2000 Bytes'),
  (4,  7, 'AGB, Impressum etc. bei Amazon hinterlegen', 'IT-Rechts-Kanzlei'),
  (4,  8, 'Betriebs- & Produkthaftpflichtversicherung + Rechtschutz abschließen', 'Surein.de'),
  (4,  9, 'eBook erstellen', NULL),
  (4, 10, 'Rechnungssoftware anbinden an Seller Center', 'Billbee (empfohlen mit Rabattlink)'),
  (4, 11, 'Anlieferplan erstellen', NULL),
  (4, 12, 'Sellerboard anbinden', NULL),
  (4, 13, 'Produkt launchen', NULL),
  (4, 14, 'PPC schalten', 'Digital Roar'),
  (4, 15, 'Bewertungsstrategie aufsetzen', NULL),
  (4, 16, 'Vine Kampagne starten oder 3-5 Bewertungen organisieren', NULL),
  (4, 17, 'Werbung optimieren', NULL),
  (4, 18, 'Weitere Verkaufsstrategien einführen (Blitzangebote, Coupons…)', NULL),
  (4, 19, 'Bewertungen analysieren und Produkt bei Nachbestellung verbessern', NULL);

INSERT INTO amazon_checklist_master_items (section_id, sort_order, description, remark) VALUES
  (5, 1, 'Anmeldung OSS (One-Stop-Shop)', 'Nur mit DHW Steuerberater');
```

- [ ] **Step 4: Tests laufen lassen, alle gruen**

```bash
cd backend && npm test -- schema.amazon_checklist
```
Erwartet: alle 6 Tests **PASS**.

- [ ] **Step 5: Commit**

```bash
git add backend/src/db/migrations/062_amazon_checklist.sql backend/test/schema.amazon_checklist.test.ts
git commit -m "feat(amazon-checklist): Migration 062 — 4 Tabellen + 66 Seed-Items

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Backend Master-Routes + Integration-Tests

**Files:**
- Create: `backend/src/routes/amazon.checklist.routes.ts`
- Create: `backend/test/integration.amazon_checklist.test.ts`

- [ ] **Step 1: Test-File mit Master-CRUD-Tests anlegen (RED)**

Datei `backend/test/integration.amazon_checklist.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type Database from 'better-sqlite3';
import { createTestDb } from './setup';

vi.mock('../src/db/connection', () => {
  const mod: { default: Database.Database | null } = { default: null };
  return mod;
});

async function makeApp(db: Database.Database) {
  const conn = await import('../src/db/connection');
  // @ts-expect-error
  conn.default = db;
  const routes = (await import('../src/routes/amazon.checklist.routes')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/amazon', routes);
  return app;
}

function makeProduct(db: Database.Database, name = 'P'): number {
  db.prepare(`INSERT INTO amazon_products (name) VALUES (?)`).run(name);
  return Number((db.prepare(`SELECT last_insert_rowid() AS id`).get() as { id: number }).id);
}

describe('Checklist API — Master', () => {
  let db: Database.Database;
  let app: express.Express;

  beforeEach(async () => {
    db = createTestDb();
    app = await makeApp(db);
  });

  it('GET /master liefert Seed-Daten (5 Sections, 66 Items total)', async () => {
    const r = await request(app).get('/api/amazon/checklist/master');
    expect(r.status).toBe(200);
    expect(r.body.sections).toHaveLength(5);
    const total = r.body.sections.reduce(
      (sum: number, s: { items: unknown[] }) => sum + s.items.length, 0,
    );
    expect(total).toBe(66);
  });

  it('POST /master/sections legt Section mit sort_order=max+1 an', async () => {
    const r = await request(app)
      .post('/api/amazon/checklist/master/sections')
      .send({ title: 'Neue Section' });
    expect(r.status).toBe(201);
    expect(r.body.section.title).toBe('Neue Section');
    expect(r.body.section.sort_order).toBe(6);
  });

  it('POST /master/sections mit leerem Titel -> 400', async () => {
    const r = await request(app)
      .post('/api/amazon/checklist/master/sections')
      .send({ title: '   ' });
    expect(r.status).toBe(400);
  });

  it('PATCH /master/sections/:id aendert Titel', async () => {
    const r = await request(app)
      .patch('/api/amazon/checklist/master/sections/1')
      .send({ title: 'Gründung NEU' });
    expect(r.status).toBe(200);
    expect(r.body.section.title).toBe('Gründung NEU');
  });

  it('DELETE /master/sections/:id entfernt Section + Items (Cascade)', async () => {
    const r = await request(app).delete('/api/amazon/checklist/master/sections/5');
    expect(r.status).toBe(204);
    const left = db.prepare(
      `SELECT COUNT(*) AS c FROM amazon_checklist_master_items WHERE section_id=5`
    ).get() as { c: number };
    expect(left.c).toBe(0);
  });

  it('POST /master/sections/:id/items legt Item mit sort_order=max+1 an', async () => {
    const r = await request(app)
      .post('/api/amazon/checklist/master/sections/5/items')
      .send({ description: 'Neuer Punkt', remark: 'Bemerkung' });
    expect(r.status).toBe(201);
    expect(r.body.item).toMatchObject({ description: 'Neuer Punkt', remark: 'Bemerkung', sort_order: 2 });
  });

  it('POST /master/items mit description > 500 -> 400', async () => {
    const r = await request(app)
      .post('/api/amazon/checklist/master/sections/5/items')
      .send({ description: 'x'.repeat(501) });
    expect(r.status).toBe(400);
  });

  it('PATCH /master/items/:id setzt link_url + link_label', async () => {
    const created = await request(app)
      .post('/api/amazon/checklist/master/sections/5/items')
      .send({ description: 'X' });
    const iid = created.body.item.id;

    const r = await request(app)
      .patch(`/api/amazon/checklist/master/items/${iid}`)
      .send({ link_url: 'https://example.com', link_label: 'Beispiel' });
    expect(r.status).toBe(200);
    expect(r.body.item.link_url).toBe('https://example.com');
    expect(r.body.item.link_label).toBe('Beispiel');
  });

  it('PATCH /master/items/:id is_done toggelt', async () => {
    const created = await request(app)
      .post('/api/amazon/checklist/master/sections/5/items')
      .send({ description: 'X' });
    const iid = created.body.item.id;

    const r = await request(app)
      .patch(`/api/amazon/checklist/master/items/${iid}`)
      .send({ is_done: 1 });
    expect(r.body.item.is_done).toBe(1);
  });

  it('DELETE /master/items/:id', async () => {
    const created = await request(app)
      .post('/api/amazon/checklist/master/sections/5/items')
      .send({ description: 'X' });
    const iid = created.body.item.id;

    const r = await request(app).delete(`/api/amazon/checklist/master/items/${iid}`);
    expect(r.status).toBe(204);
  });
});
```

- [ ] **Step 2: Tests laufen lassen, Fail bestaetigen**

```bash
cd backend && npm test -- integration.amazon_checklist
```
Erwartet: **alle FAIL** (Route fehlt).

- [ ] **Step 3: Route-Datei schreiben — Master-Endpoints + Helpers (GREEN)**

Datei `backend/src/routes/amazon.checklist.routes.ts`:

```ts
import { Router, type Request, type Response } from 'express';
import db from '../db/connection';

const router = Router();

const MAX_TITLE = 200;
const MAX_DESCRIPTION = 500;
const MAX_REMARK = 1000;
const MAX_URL = 500;
const MAX_LABEL = 100;

interface SectionRow {
  id: number;
  sort_order: number;
  title: string;
  created_at: number;
  updated_at: number;
}
interface ProductSectionRow extends SectionRow {
  product_id: number;
}
interface ItemRow {
  id: number;
  section_id: number;
  sort_order: number;
  description: string;
  remark: string | null;
  link_url: string | null;
  link_label: string | null;
  is_done: number;
  created_at: number;
  updated_at: number;
}

function normalizeText(raw: unknown, max: number): { ok: true; value: string | null } | { ok: false } {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: false };
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: true, value: null };
  if (trimmed.length > max) return { ok: false };
  return { ok: true, value: trimmed };
}

function requireText(raw: unknown, max: number): { ok: true; value: string } | { ok: false } {
  if (typeof raw !== 'string') return { ok: false };
  const trimmed = raw.trim();
  if (trimmed.length < 1 || trimmed.length > max) return { ok: false };
  return { ok: true, value: trimmed };
}

function loadMasterItems(sectionId: number): ItemRow[] {
  return db.prepare(
    `SELECT * FROM amazon_checklist_master_items WHERE section_id = ? ORDER BY sort_order, id`
  ).all(sectionId) as ItemRow[];
}

function loadMasterSectionsWithItems(): Array<SectionRow & { items: ItemRow[] }> {
  const sections = db.prepare(
    `SELECT * FROM amazon_checklist_master_sections ORDER BY sort_order, id`
  ).all() as SectionRow[];
  return sections.map(s => ({ ...s, items: loadMasterItems(s.id) }));
}

// ── Master ───────────────────────────────────────────────────────────────────

router.get('/checklist/master', (_req: Request, res: Response) => {
  res.json({ sections: loadMasterSectionsWithItems() });
});

router.post('/checklist/master/sections', (req: Request, res: Response) => {
  const title = requireText((req.body as { title?: unknown })?.title, MAX_TITLE);
  if (!title.ok) { res.status(400).json({ error: 'invalid title' }); return; }
  const maxOrder = (db.prepare(
    `SELECT COALESCE(MAX(sort_order), 0) AS m FROM amazon_checklist_master_sections`
  ).get() as { m: number }).m;
  const result = db.prepare(
    `INSERT INTO amazon_checklist_master_sections (sort_order, title) VALUES (?, ?)`
  ).run(maxOrder + 1, title.value);
  const row = db.prepare(`SELECT * FROM amazon_checklist_master_sections WHERE id = ?`).get(result.lastInsertRowid) as SectionRow;
  res.status(201).json({ section: { ...row, items: [] } });
});

router.patch('/checklist/master/sections/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(404).json({ error: 'not found' }); return; }
  const existing = db.prepare(`SELECT * FROM amazon_checklist_master_sections WHERE id = ?`).get(id);
  if (!existing) { res.status(404).json({ error: 'not found' }); return; }
  const body = (req.body as Record<string, unknown>) ?? {};
  const updates: string[] = []; const params: unknown[] = [];
  if (body.title !== undefined) {
    const t = requireText(body.title, MAX_TITLE);
    if (!t.ok) { res.status(400).json({ error: 'invalid title' }); return; }
    updates.push('title = ?'); params.push(t.value);
  }
  if (body.sort_order !== undefined) {
    if (typeof body.sort_order !== 'number' || !Number.isInteger(body.sort_order)) {
      res.status(400).json({ error: 'invalid sort_order' }); return;
    }
    updates.push('sort_order = ?'); params.push(body.sort_order);
  }
  if (updates.length > 0) {
    updates.push('updated_at = unixepoch()'); params.push(id);
    db.prepare(`UPDATE amazon_checklist_master_sections SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }
  const row = db.prepare(`SELECT * FROM amazon_checklist_master_sections WHERE id = ?`).get(id) as SectionRow;
  res.json({ section: { ...row, items: loadMasterItems(id) } });
});

router.delete('/checklist/master/sections/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(404).json({ error: 'not found' }); return; }
  db.prepare(`DELETE FROM amazon_checklist_master_sections WHERE id = ?`).run(id);
  res.status(204).end();
});

router.post('/checklist/master/sections/:id/items', (req: Request, res: Response) => {
  const sectionId = Number(req.params.id);
  if (!Number.isInteger(sectionId)) { res.status(404).json({ error: 'not found' }); return; }
  const existing = db.prepare(`SELECT 1 FROM amazon_checklist_master_sections WHERE id = ?`).get(sectionId);
  if (!existing) { res.status(404).json({ error: 'section not found' }); return; }

  const body = (req.body as Record<string, unknown>) ?? {};
  const desc = requireText(body.description, MAX_DESCRIPTION);
  if (!desc.ok) { res.status(400).json({ error: 'invalid description' }); return; }
  const remark = normalizeText(body.remark, MAX_REMARK);
  if (!remark.ok) { res.status(400).json({ error: 'invalid remark' }); return; }
  const linkUrl = normalizeText(body.link_url, MAX_URL);
  if (!linkUrl.ok) { res.status(400).json({ error: 'invalid link_url' }); return; }
  const linkLabel = normalizeText(body.link_label, MAX_LABEL);
  if (!linkLabel.ok) { res.status(400).json({ error: 'invalid link_label' }); return; }

  const maxOrder = (db.prepare(
    `SELECT COALESCE(MAX(sort_order), 0) AS m FROM amazon_checklist_master_items WHERE section_id = ?`
  ).get(sectionId) as { m: number }).m;
  const result = db.prepare(
    `INSERT INTO amazon_checklist_master_items
       (section_id, sort_order, description, remark, link_url, link_label)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(sectionId, maxOrder + 1, desc.value, remark.value, linkUrl.value, linkLabel.value);
  const row = db.prepare(`SELECT * FROM amazon_checklist_master_items WHERE id = ?`).get(result.lastInsertRowid) as ItemRow;
  res.status(201).json({ item: row });
});

router.patch('/checklist/master/items/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(404).json({ error: 'not found' }); return; }
  const existing = db.prepare(`SELECT 1 FROM amazon_checklist_master_items WHERE id = ?`).get(id);
  if (!existing) { res.status(404).json({ error: 'not found' }); return; }
  const body = (req.body as Record<string, unknown>) ?? {};
  const updates: string[] = []; const params: unknown[] = [];

  if (body.description !== undefined) {
    const v = requireText(body.description, MAX_DESCRIPTION);
    if (!v.ok) { res.status(400).json({ error: 'invalid description' }); return; }
    updates.push('description = ?'); params.push(v.value);
  }
  for (const [col, max] of [['remark', MAX_REMARK], ['link_url', MAX_URL], ['link_label', MAX_LABEL]] as const) {
    if (body[col] !== undefined) {
      const v = normalizeText(body[col], max);
      if (!v.ok) { res.status(400).json({ error: `invalid ${col}` }); return; }
      updates.push(`${col} = ?`); params.push(v.value);
    }
  }
  if (body.sort_order !== undefined) {
    if (typeof body.sort_order !== 'number' || !Number.isInteger(body.sort_order)) {
      res.status(400).json({ error: 'invalid sort_order' }); return;
    }
    updates.push('sort_order = ?'); params.push(body.sort_order);
  }
  if (body.is_done !== undefined) {
    if (body.is_done !== 0 && body.is_done !== 1) {
      res.status(400).json({ error: 'invalid is_done' }); return;
    }
    updates.push('is_done = ?'); params.push(body.is_done);
  }
  if (updates.length > 0) {
    updates.push('updated_at = unixepoch()'); params.push(id);
    db.prepare(`UPDATE amazon_checklist_master_items SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }
  const row = db.prepare(`SELECT * FROM amazon_checklist_master_items WHERE id = ?`).get(id) as ItemRow;
  res.json({ item: row });
});

router.delete('/checklist/master/items/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(404).json({ error: 'not found' }); return; }
  db.prepare(`DELETE FROM amazon_checklist_master_items WHERE id = ?`).run(id);
  res.status(204).end();
});

export default router;
```

- [ ] **Step 4: Tests laufen lassen, alle Master-Tests gruen**

```bash
cd backend && npm test -- integration.amazon_checklist
```
Erwartet: alle 10 Master-Tests **PASS**.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/amazon.checklist.routes.ts backend/test/integration.amazon_checklist.test.ts
git commit -m "feat(amazon-checklist): Backend Master-Routes (GET/POST/PATCH/DELETE)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Backend Produkt-Routes + Lazy-Init + Mount

**Files:**
- Modify: `backend/src/routes/amazon.checklist.routes.ts`
- Modify: `backend/test/integration.amazon_checklist.test.ts` (Produkt-Tests anhängen)
- Modify: `backend/src/app.ts`

- [ ] **Step 1: Produkt-Tests anhaengen (RED)**

Im File `backend/test/integration.amazon_checklist.test.ts` am Ende, nach dem Master-`describe`-Block, einen neuen `describe`-Block anhängen:

```ts
describe('Checklist API — Produkt', () => {
  let db: Database.Database;
  let app: express.Express;

  beforeEach(async () => {
    db = createTestDb();
    app = await makeApp(db);
  });

  it('GET /products/:id/checklist initialisiert lazy aus Master', async () => {
    const pid = makeProduct(db);
    const r = await request(app).get(`/api/amazon/products/${pid}/checklist`);
    expect(r.status).toBe(200);
    expect(r.body.sections).toHaveLength(5);
    const total = r.body.sections.reduce(
      (sum: number, s: { items: unknown[] }) => sum + s.items.length, 0,
    );
    expect(total).toBe(66);
    // is_done = 0 fuer alle
    const allDone = r.body.sections.flatMap((s: { items: { is_done: number }[] }) => s.items.map(i => i.is_done));
    expect(allDone.every((d: number) => d === 0)).toBe(true);
  });

  it('GET zweimal hintereinander dupliziert nichts', async () => {
    const pid = makeProduct(db);
    await request(app).get(`/api/amazon/products/${pid}/checklist`);
    await request(app).get(`/api/amazon/products/${pid}/checklist`);
    const sec = (db.prepare(
      `SELECT COUNT(*) AS c FROM amazon_checklist_product_sections WHERE product_id=?`
    ).get(pid) as { c: number }).c;
    expect(sec).toBe(5);
  });

  it('GET 404 fuer unbekanntes Produkt', async () => {
    const r = await request(app).get('/api/amazon/products/9999/checklist');
    expect(r.status).toBe(404);
  });

  it('Produkt-Item PATCH is_done aendert nur Produkt, Master bleibt unveraendert', async () => {
    const pid = makeProduct(db);
    const initial = await request(app).get(`/api/amazon/products/${pid}/checklist`);
    const firstItem = initial.body.sections[0].items[0];

    const r = await request(app)
      .patch(`/api/amazon/products/${pid}/checklist/items/${firstItem.id}`)
      .send({ is_done: 1 });
    expect(r.body.item.is_done).toBe(1);

    // Master unveraendert (Item-IDs sind anders, aber inhaltlich erstes Master-Item bleibt is_done=0)
    const masterFirst = db.prepare(
      `SELECT is_done FROM amazon_checklist_master_items ORDER BY section_id, sort_order LIMIT 1`
    ).get() as { is_done: number };
    expect(masterFirst.is_done).toBe(0);
  });

  it('Produkt POST /sections legt neue Section nur fuer das Produkt an', async () => {
    const pid = makeProduct(db);
    await request(app).get(`/api/amazon/products/${pid}/checklist`); // lazy-init
    const r = await request(app)
      .post(`/api/amazon/products/${pid}/checklist/sections`)
      .send({ title: 'Eigene Section' });
    expect(r.status).toBe(201);
    expect(r.body.section.title).toBe('Eigene Section');
  });

  it('Produkt POST /sections/:sid/items legt Item an', async () => {
    const pid = makeProduct(db);
    const init = await request(app).get(`/api/amazon/products/${pid}/checklist`);
    const firstSectionId = init.body.sections[0].id;

    const r = await request(app)
      .post(`/api/amazon/products/${pid}/checklist/sections/${firstSectionId}/items`)
      .send({ description: 'Mein eigener Eintrag', remark: 'B' });
    expect(r.status).toBe(201);
    expect(r.body.item).toMatchObject({ description: 'Mein eigener Eintrag', remark: 'B', is_done: 0 });
  });

  it('Produkt DELETE Cross-Produkt -> 404', async () => {
    const pA = makeProduct(db, 'A');
    const pB = makeProduct(db, 'B');
    const initA = await request(app).get(`/api/amazon/products/${pA}/checklist`);
    const itemId = initA.body.sections[0].items[0].id;

    const r = await request(app).delete(`/api/amazon/products/${pB}/checklist/items/${itemId}`);
    expect(r.status).toBe(404);
  });

  it('Produkt-Section DELETE entfernt Items (Cascade)', async () => {
    const pid = makeProduct(db);
    const init = await request(app).get(`/api/amazon/products/${pid}/checklist`);
    const secId = init.body.sections[4].id; // OSS-Section mit 1 Item

    const r = await request(app).delete(`/api/amazon/products/${pid}/checklist/sections/${secId}`);
    expect(r.status).toBe(204);
    const items = db.prepare(
      `SELECT COUNT(*) AS c FROM amazon_checklist_product_items WHERE section_id=?`
    ).get(secId) as { c: number };
    expect(items.c).toBe(0);
  });

  it('Master-Aenderung wirkt nicht auf bestehende Produkt-Checklist', async () => {
    const pid = makeProduct(db);
    await request(app).get(`/api/amazon/products/${pid}/checklist`);

    // Neue Master-Section
    await request(app)
      .post('/api/amazon/checklist/master/sections')
      .send({ title: 'Brand-New-Master' });

    // Produkt-Checkliste laden — soll alte (5) haben, nicht 6
    const r = await request(app).get(`/api/amazon/products/${pid}/checklist`);
    expect(r.body.sections).toHaveLength(5);
  });
});
```

- [ ] **Step 2: Tests laufen lassen, Produkt-Tests rot**

```bash
cd backend && npm test -- integration.amazon_checklist
```
Erwartet: 10 Master-Tests **PASS**, 9 Produkt-Tests **FAIL**.

- [ ] **Step 3: Produkt-Routes + Lazy-Init in `amazon.checklist.routes.ts` ergaenzen (GREEN)**

In `backend/src/routes/amazon.checklist.routes.ts`, **vor** `export default router;`, einfügen:

```ts
// ── Helpers fuer Produkt ─────────────────────────────────────────────────────

function ensureProduct(id: number): boolean {
  return db.prepare(`SELECT 1 FROM amazon_products WHERE id = ?`).get(id) !== undefined;
}

function loadProductItems(sectionId: number): ItemRow[] {
  return db.prepare(
    `SELECT * FROM amazon_checklist_product_items WHERE section_id = ? ORDER BY sort_order, id`
  ).all(sectionId) as ItemRow[];
}

function loadProductSectionsWithItems(productId: number): Array<ProductSectionRow & { items: ItemRow[] }> {
  const sections = db.prepare(
    `SELECT * FROM amazon_checklist_product_sections WHERE product_id = ? ORDER BY sort_order, id`
  ).all(productId) as ProductSectionRow[];
  return sections.map(s => ({ ...s, items: loadProductItems(s.id) }));
}

function initProductFromMaster(productId: number): void {
  const masterSections = db.prepare(
    `SELECT * FROM amazon_checklist_master_sections ORDER BY sort_order, id`
  ).all() as SectionRow[];
  const insSec = db.prepare(
    `INSERT INTO amazon_checklist_product_sections (product_id, sort_order, title) VALUES (?, ?, ?)`
  );
  const insItem = db.prepare(
    `INSERT INTO amazon_checklist_product_items
       (section_id, sort_order, description, remark, link_url, link_label, is_done)
     VALUES (?, ?, ?, ?, ?, ?, 0)`
  );
  const trx = db.transaction(() => {
    for (const sec of masterSections) {
      const r = insSec.run(productId, sec.sort_order, sec.title);
      const newSectionId = Number(r.lastInsertRowid);
      const items = db.prepare(
        `SELECT * FROM amazon_checklist_master_items WHERE section_id = ? ORDER BY sort_order, id`
      ).all(sec.id) as ItemRow[];
      for (const it of items) {
        insItem.run(newSectionId, it.sort_order, it.description, it.remark, it.link_url, it.link_label);
      }
    }
  });
  trx();
}

function loadProductSection(productId: number, sectionId: number): ProductSectionRow | undefined {
  return db.prepare(
    `SELECT * FROM amazon_checklist_product_sections WHERE id = ? AND product_id = ?`
  ).get(sectionId, productId) as ProductSectionRow | undefined;
}

function loadProductItem(productId: number, itemId: number): (ItemRow & { product_id: number }) | undefined {
  return db.prepare(
    `SELECT i.*, s.product_id
     FROM amazon_checklist_product_items i
     JOIN amazon_checklist_product_sections s ON s.id = i.section_id
     WHERE i.id = ? AND s.product_id = ?`
  ).get(itemId, productId) as (ItemRow & { product_id: number }) | undefined;
}

// ── Produkt-Endpoints ────────────────────────────────────────────────────────

router.get('/products/:id/checklist', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) {
    res.status(404).json({ error: 'product not found' }); return;
  }
  const count = (db.prepare(
    `SELECT COUNT(*) AS c FROM amazon_checklist_product_sections WHERE product_id = ?`
  ).get(id) as { c: number }).c;
  if (count === 0) initProductFromMaster(id);
  res.json({ sections: loadProductSectionsWithItems(id) });
});

router.post('/products/:id/checklist/sections', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) {
    res.status(404).json({ error: 'product not found' }); return;
  }
  const title = requireText((req.body as { title?: unknown })?.title, MAX_TITLE);
  if (!title.ok) { res.status(400).json({ error: 'invalid title' }); return; }
  const maxOrder = (db.prepare(
    `SELECT COALESCE(MAX(sort_order), 0) AS m FROM amazon_checklist_product_sections WHERE product_id = ?`
  ).get(id) as { m: number }).m;
  const result = db.prepare(
    `INSERT INTO amazon_checklist_product_sections (product_id, sort_order, title) VALUES (?, ?, ?)`
  ).run(id, maxOrder + 1, title.value);
  const row = db.prepare(`SELECT * FROM amazon_checklist_product_sections WHERE id = ?`).get(result.lastInsertRowid) as ProductSectionRow;
  res.status(201).json({ section: { ...row, items: [] } });
});

router.patch('/products/:id/checklist/sections/:sid', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const sid = Number(req.params.sid);
  if (!Number.isInteger(id) || !Number.isInteger(sid)) {
    res.status(404).json({ error: 'not found' }); return;
  }
  if (!ensureProduct(id) || !loadProductSection(id, sid)) {
    res.status(404).json({ error: 'not found' }); return;
  }
  const body = (req.body as Record<string, unknown>) ?? {};
  const updates: string[] = []; const params: unknown[] = [];
  if (body.title !== undefined) {
    const t = requireText(body.title, MAX_TITLE);
    if (!t.ok) { res.status(400).json({ error: 'invalid title' }); return; }
    updates.push('title = ?'); params.push(t.value);
  }
  if (body.sort_order !== undefined) {
    if (typeof body.sort_order !== 'number' || !Number.isInteger(body.sort_order)) {
      res.status(400).json({ error: 'invalid sort_order' }); return;
    }
    updates.push('sort_order = ?'); params.push(body.sort_order);
  }
  if (updates.length > 0) {
    updates.push('updated_at = unixepoch()'); params.push(sid);
    db.prepare(`UPDATE amazon_checklist_product_sections SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }
  const row = db.prepare(`SELECT * FROM amazon_checklist_product_sections WHERE id = ?`).get(sid) as ProductSectionRow;
  res.json({ section: { ...row, items: loadProductItems(sid) } });
});

router.delete('/products/:id/checklist/sections/:sid', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const sid = Number(req.params.sid);
  if (!Number.isInteger(id) || !Number.isInteger(sid)) {
    res.status(404).json({ error: 'not found' }); return;
  }
  if (!ensureProduct(id) || !loadProductSection(id, sid)) {
    res.status(404).json({ error: 'not found' }); return;
  }
  db.prepare(`DELETE FROM amazon_checklist_product_sections WHERE id = ?`).run(sid);
  res.status(204).end();
});

router.post('/products/:id/checklist/sections/:sid/items', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const sid = Number(req.params.sid);
  if (!Number.isInteger(id) || !Number.isInteger(sid)) {
    res.status(404).json({ error: 'not found' }); return;
  }
  if (!ensureProduct(id) || !loadProductSection(id, sid)) {
    res.status(404).json({ error: 'not found' }); return;
  }
  const body = (req.body as Record<string, unknown>) ?? {};
  const desc = requireText(body.description, MAX_DESCRIPTION);
  if (!desc.ok) { res.status(400).json({ error: 'invalid description' }); return; }
  const remark = normalizeText(body.remark, MAX_REMARK);
  if (!remark.ok) { res.status(400).json({ error: 'invalid remark' }); return; }
  const linkUrl = normalizeText(body.link_url, MAX_URL);
  if (!linkUrl.ok) { res.status(400).json({ error: 'invalid link_url' }); return; }
  const linkLabel = normalizeText(body.link_label, MAX_LABEL);
  if (!linkLabel.ok) { res.status(400).json({ error: 'invalid link_label' }); return; }

  const maxOrder = (db.prepare(
    `SELECT COALESCE(MAX(sort_order), 0) AS m FROM amazon_checklist_product_items WHERE section_id = ?`
  ).get(sid) as { m: number }).m;
  const result = db.prepare(
    `INSERT INTO amazon_checklist_product_items
       (section_id, sort_order, description, remark, link_url, link_label)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(sid, maxOrder + 1, desc.value, remark.value, linkUrl.value, linkLabel.value);
  const row = db.prepare(`SELECT * FROM amazon_checklist_product_items WHERE id = ?`).get(result.lastInsertRowid) as ItemRow;
  res.status(201).json({ item: row });
});

router.patch('/products/:id/checklist/items/:iid', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const iid = Number(req.params.iid);
  if (!Number.isInteger(id) || !Number.isInteger(iid)) {
    res.status(404).json({ error: 'not found' }); return;
  }
  if (!ensureProduct(id) || !loadProductItem(id, iid)) {
    res.status(404).json({ error: 'not found' }); return;
  }
  const body = (req.body as Record<string, unknown>) ?? {};
  const updates: string[] = []; const params: unknown[] = [];

  if (body.description !== undefined) {
    const v = requireText(body.description, MAX_DESCRIPTION);
    if (!v.ok) { res.status(400).json({ error: 'invalid description' }); return; }
    updates.push('description = ?'); params.push(v.value);
  }
  for (const [col, max] of [['remark', MAX_REMARK], ['link_url', MAX_URL], ['link_label', MAX_LABEL]] as const) {
    if (body[col] !== undefined) {
      const v = normalizeText(body[col], max);
      if (!v.ok) { res.status(400).json({ error: `invalid ${col}` }); return; }
      updates.push(`${col} = ?`); params.push(v.value);
    }
  }
  if (body.sort_order !== undefined) {
    if (typeof body.sort_order !== 'number' || !Number.isInteger(body.sort_order)) {
      res.status(400).json({ error: 'invalid sort_order' }); return;
    }
    updates.push('sort_order = ?'); params.push(body.sort_order);
  }
  if (body.is_done !== undefined) {
    if (body.is_done !== 0 && body.is_done !== 1) {
      res.status(400).json({ error: 'invalid is_done' }); return;
    }
    updates.push('is_done = ?'); params.push(body.is_done);
  }
  if (updates.length > 0) {
    updates.push('updated_at = unixepoch()'); params.push(iid);
    db.prepare(`UPDATE amazon_checklist_product_items SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }
  const row = db.prepare(`SELECT * FROM amazon_checklist_product_items WHERE id = ?`).get(iid) as ItemRow;
  res.json({ item: row });
});

router.delete('/products/:id/checklist/items/:iid', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const iid = Number(req.params.iid);
  if (!Number.isInteger(id) || !Number.isInteger(iid)) {
    res.status(404).json({ error: 'not found' }); return;
  }
  if (!ensureProduct(id) || !loadProductItem(id, iid)) {
    res.status(404).json({ error: 'not found' }); return;
  }
  db.prepare(`DELETE FROM amazon_checklist_product_items WHERE id = ?`).run(iid);
  res.status(204).end();
});
```

- [ ] **Step 4: Tests laufen lassen, alle gruen**

```bash
cd backend && npm test -- integration.amazon_checklist
```
Erwartet: alle 19 Tests (10 Master + 9 Produkt) **PASS**.

- [ ] **Step 5: Mount in app.ts**

In `backend/src/app.ts`:

(a) Import nach `amazonBrandRoutes` ergänzen:
```ts
import amazonChecklistRoutes from './routes/amazon.checklist.routes';
```

(b) Mount nach `app.use('/api/amazon', amazonBrandRoutes);` ergänzen:
```ts
app.use('/api/amazon', amazonChecklistRoutes);
```

- [ ] **Step 6: Backend starten + Health pruefen**

```bash
cd backend && pkill -f "tsx watch" 2>/dev/null; sleep 1; npm run dev &
sleep 4
curl -s http://localhost:3001/api/health
```
Erwartet: `{"status":"ok"}`. Dann `pkill -f "tsx watch"`.

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/amazon.checklist.routes.ts backend/test/integration.amazon_checklist.test.ts backend/src/app.ts
git commit -m "feat(amazon-checklist): Backend Produkt-Routes mit Lazy-Init + Mount

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Frontend API-Types + Wrappers + Hooks

**Files:**
- Modify: `frontend/src/api/amazon.api.ts` (anhängen)
- Create: `frontend/src/hooks/amazon/useChecklistMaster.ts`
- Create: `frontend/src/hooks/amazon/useChecklistProduct.ts`

- [ ] **Step 1: Types + Wrappers anhaengen**

Am Ende von `frontend/src/api/amazon.api.ts`:

```ts
// ── Checkliste ────────────────────────────────────────────────────────────────

export interface ChecklistItem {
  id: number;
  section_id: number;
  sort_order: number;
  description: string;
  remark: string | null;
  link_url: string | null;
  link_label: string | null;
  is_done: 0 | 1;
  created_at: number;
  updated_at: number;
}

export interface ChecklistSection {
  id: number;
  sort_order: number;
  title: string;
  items: ChecklistItem[];
  created_at: number;
  updated_at: number;
}

export interface ChecklistPayload {
  sections: ChecklistSection[];
}

export type ChecklistSectionPatch = Partial<{ title: string; sort_order: number }>;
export type ChecklistItemPatch = Partial<{
  description: string;
  remark: string | null;
  link_url: string | null;
  link_label: string | null;
  sort_order: number;
  is_done: 0 | 1;
}>;
export interface ChecklistItemCreate {
  description: string;
  remark?: string | null;
  link_url?: string | null;
  link_label?: string | null;
}

// Master
export async function fetchChecklistMaster(): Promise<ChecklistPayload> {
  const r = await apiClient.get<ChecklistPayload>('/amazon/checklist/master');
  return r.data;
}
export async function createMasterSection(title: string): Promise<ChecklistSection> {
  const r = await apiClient.post<{ section: ChecklistSection }>('/amazon/checklist/master/sections', { title });
  return r.data.section;
}
export async function updateMasterSection(id: number, patch: ChecklistSectionPatch): Promise<ChecklistSection> {
  const r = await apiClient.patch<{ section: ChecklistSection }>(`/amazon/checklist/master/sections/${id}`, patch);
  return r.data.section;
}
export async function deleteMasterSection(id: number): Promise<void> {
  await apiClient.delete(`/amazon/checklist/master/sections/${id}`);
}
export async function createMasterItem(sectionId: number, input: ChecklistItemCreate): Promise<ChecklistItem> {
  const r = await apiClient.post<{ item: ChecklistItem }>(`/amazon/checklist/master/sections/${sectionId}/items`, input);
  return r.data.item;
}
export async function updateMasterItem(id: number, patch: ChecklistItemPatch): Promise<ChecklistItem> {
  const r = await apiClient.patch<{ item: ChecklistItem }>(`/amazon/checklist/master/items/${id}`, patch);
  return r.data.item;
}
export async function deleteMasterItem(id: number): Promise<void> {
  await apiClient.delete(`/amazon/checklist/master/items/${id}`);
}

// Produkt
export async function fetchChecklistProduct(productId: number): Promise<ChecklistPayload> {
  const r = await apiClient.get<ChecklistPayload>(`/amazon/products/${productId}/checklist`);
  return r.data;
}
export async function createProductSection(productId: number, title: string): Promise<ChecklistSection> {
  const r = await apiClient.post<{ section: ChecklistSection }>(`/amazon/products/${productId}/checklist/sections`, { title });
  return r.data.section;
}
export async function updateProductSection(productId: number, sectionId: number, patch: ChecklistSectionPatch): Promise<ChecklistSection> {
  const r = await apiClient.patch<{ section: ChecklistSection }>(`/amazon/products/${productId}/checklist/sections/${sectionId}`, patch);
  return r.data.section;
}
export async function deleteProductSection(productId: number, sectionId: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${productId}/checklist/sections/${sectionId}`);
}
export async function createProductItem(productId: number, sectionId: number, input: ChecklistItemCreate): Promise<ChecklistItem> {
  const r = await apiClient.post<{ item: ChecklistItem }>(`/amazon/products/${productId}/checklist/sections/${sectionId}/items`, input);
  return r.data.item;
}
export async function updateProductItem(productId: number, itemId: number, patch: ChecklistItemPatch): Promise<ChecklistItem> {
  const r = await apiClient.patch<{ item: ChecklistItem }>(`/amazon/products/${productId}/checklist/items/${itemId}`, patch);
  return r.data.item;
}
export async function deleteProductItem(productId: number, itemId: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${productId}/checklist/items/${itemId}`);
}
```

- [ ] **Step 2: useChecklistMaster.ts**

Datei `frontend/src/hooks/amazon/useChecklistMaster.ts`:

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  type ChecklistPayload, type ChecklistSectionPatch, type ChecklistItemPatch, type ChecklistItemCreate,
  type ChecklistItem, type ChecklistSection,
  fetchChecklistMaster,
  createMasterSection as apiCreateSection,
  updateMasterSection as apiUpdateSection,
  deleteMasterSection as apiDeleteSection,
  createMasterItem as apiCreateItem,
  updateMasterItem as apiUpdateItem,
  deleteMasterItem as apiDeleteItem,
} from '../../api/amazon.api';

export const masterKey = ['amazon', 'checklist', 'master'] as const;

export function useChecklistMaster() {
  return useQuery({
    queryKey: masterKey,
    queryFn: fetchChecklistMaster,
  });
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: masterKey });
}

export function useCreateMasterSection() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (title: string) => apiCreateSection(title),
    onSuccess: invalidate,
  });
}

export function useUpdateMasterSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: ChecklistSectionPatch }) => apiUpdateSection(id, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: masterKey });
      const prev = qc.getQueryData<ChecklistPayload>(masterKey);
      if (prev) {
        qc.setQueryData<ChecklistPayload>(masterKey, {
          sections: prev.sections.map(s => s.id === id ? ({ ...s, ...patch } as ChecklistSection) : s),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(masterKey, ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: masterKey }),
  });
}

export function useDeleteMasterSection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiDeleteSection(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: masterKey });
      const prev = qc.getQueryData<ChecklistPayload>(masterKey);
      if (prev) {
        qc.setQueryData<ChecklistPayload>(masterKey, {
          sections: prev.sections.filter(s => s.id !== id),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(masterKey, ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: masterKey }),
  });
}

export function useCreateMasterItem() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ sectionId, input }: { sectionId: number; input: ChecklistItemCreate }) =>
      apiCreateItem(sectionId, input),
    onSuccess: invalidate,
  });
}

export function useUpdateMasterItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: ChecklistItemPatch }) => apiUpdateItem(id, patch),
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: masterKey });
      const prev = qc.getQueryData<ChecklistPayload>(masterKey);
      if (prev) {
        qc.setQueryData<ChecklistPayload>(masterKey, {
          sections: prev.sections.map(s => ({
            ...s,
            items: s.items.map(i => i.id === id ? ({ ...i, ...patch } as ChecklistItem) : i),
          })),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(masterKey, ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: masterKey }),
  });
}

export function useDeleteMasterItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiDeleteItem(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: masterKey });
      const prev = qc.getQueryData<ChecklistPayload>(masterKey);
      if (prev) {
        qc.setQueryData<ChecklistPayload>(masterKey, {
          sections: prev.sections.map(s => ({
            ...s,
            items: s.items.filter(i => i.id !== id),
          })),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(masterKey, ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: masterKey }),
  });
}
```

- [ ] **Step 3: useChecklistProduct.ts**

Datei `frontend/src/hooks/amazon/useChecklistProduct.ts`:

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  type ChecklistPayload, type ChecklistSectionPatch, type ChecklistItemPatch, type ChecklistItemCreate,
  type ChecklistItem, type ChecklistSection,
  fetchChecklistProduct,
  createProductSection as apiCreateSection,
  updateProductSection as apiUpdateSection,
  deleteProductSection as apiDeleteSection,
  createProductItem as apiCreateItem,
  updateProductItem as apiUpdateItem,
  deleteProductItem as apiDeleteItem,
} from '../../api/amazon.api';

export const productChecklistKey = (productId: number) =>
  ['amazon', 'products', productId, 'checklist'] as const;

export function useChecklistProduct(productId: number) {
  return useQuery({
    queryKey: productChecklistKey(productId),
    queryFn: () => fetchChecklistProduct(productId),
    enabled: Number.isInteger(productId) && productId > 0,
  });
}

export function useCreateProductSection(productId: number) {
  const qc = useQueryClient();
  const key = productChecklistKey(productId);
  return useMutation({
    mutationFn: (title: string) => apiCreateSection(productId, title),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export function useUpdateProductSection(productId: number) {
  const qc = useQueryClient();
  const key = productChecklistKey(productId);
  return useMutation({
    mutationFn: ({ sectionId, patch }: { sectionId: number; patch: ChecklistSectionPatch }) =>
      apiUpdateSection(productId, sectionId, patch),
    onMutate: async ({ sectionId, patch }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<ChecklistPayload>(key);
      if (prev) {
        qc.setQueryData<ChecklistPayload>(key, {
          sections: prev.sections.map(s => s.id === sectionId ? ({ ...s, ...patch } as ChecklistSection) : s),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(key, ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export function useDeleteProductSection(productId: number) {
  const qc = useQueryClient();
  const key = productChecklistKey(productId);
  return useMutation({
    mutationFn: (sectionId: number) => apiDeleteSection(productId, sectionId),
    onMutate: async (sectionId) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<ChecklistPayload>(key);
      if (prev) {
        qc.setQueryData<ChecklistPayload>(key, {
          sections: prev.sections.filter(s => s.id !== sectionId),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(key, ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export function useCreateProductItem(productId: number) {
  const qc = useQueryClient();
  const key = productChecklistKey(productId);
  return useMutation({
    mutationFn: ({ sectionId, input }: { sectionId: number; input: ChecklistItemCreate }) =>
      apiCreateItem(productId, sectionId, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export function useUpdateProductItem(productId: number) {
  const qc = useQueryClient();
  const key = productChecklistKey(productId);
  return useMutation({
    mutationFn: ({ itemId, patch }: { itemId: number; patch: ChecklistItemPatch }) =>
      apiUpdateItem(productId, itemId, patch),
    onMutate: async ({ itemId, patch }) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<ChecklistPayload>(key);
      if (prev) {
        qc.setQueryData<ChecklistPayload>(key, {
          sections: prev.sections.map(s => ({
            ...s,
            items: s.items.map(i => i.id === itemId ? ({ ...i, ...patch } as ChecklistItem) : i),
          })),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(key, ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export function useDeleteProductItem(productId: number) {
  const qc = useQueryClient();
  const key = productChecklistKey(productId);
  return useMutation({
    mutationFn: (itemId: number) => apiDeleteItem(productId, itemId),
    onMutate: async (itemId) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<ChecklistPayload>(key);
      if (prev) {
        qc.setQueryData<ChecklistPayload>(key, {
          sections: prev.sections.map(s => ({
            ...s,
            items: s.items.filter(i => i.id !== itemId),
          })),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(key, ctx.prev); },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}
```

- [ ] **Step 4: Typecheck**

```bash
cd frontend && npm run typecheck
```
Erwartet: 0 Fehler.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/amazon.api.ts frontend/src/hooks/amazon/useChecklistMaster.ts frontend/src/hooks/amazon/useChecklistProduct.ts
git commit -m "feat(amazon-checklist): Frontend API + Hooks (Master + Produkt)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: EditItemDialog + AddSectionForm + AddItemForm

Drei kleine wiederverwendbare Komponenten ohne Mode-Switch (sie kennen weder Master noch Produkt — der aufrufende Code übergibt Callback-Funktionen für Save/Delete).

**Files:**
- Create: `frontend/src/components/amazon/checklist/EditItemDialog.tsx`
- Create: `frontend/src/components/amazon/checklist/AddSectionForm.tsx`
- Create: `frontend/src/components/amazon/checklist/AddItemForm.tsx`

- [ ] **Step 1: EditItemDialog**

Datei `frontend/src/components/amazon/checklist/EditItemDialog.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { type ChecklistItem, type ChecklistItemPatch } from '../../../api/amazon.api';

interface Props {
  item: ChecklistItem | null;
  onClose: () => void;
  onSave: (patch: ChecklistItemPatch) => Promise<void> | void;
}

const INPUT_STYLE: React.CSSProperties = {
  background: 'var(--color-surface-container-low)',
  color: 'var(--color-on-surface)',
  border: '1px solid rgba(255,255,255,0.08)',
};

export function EditItemDialog({ item, onClose, onSave }: Props) {
  const [remark, setRemark] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkLabel, setLinkLabel] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setRemark(item?.remark ?? '');
    setLinkUrl(item?.link_url ?? '');
    setLinkLabel(item?.link_label ?? '');
  }, [item]);

  if (!item) return null;

  function normalize(s: string): string | null {
    const t = s.trim();
    return t.length === 0 ? null : t;
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave({
        remark: normalize(remark),
        link_url: normalize(linkUrl),
        link_label: normalize(linkLabel),
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
      onClick={onClose}
    >
      <div
        className="w-[480px] max-w-[92vw] rounded-xl p-5"
        style={{ background: 'var(--color-surface-container)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="font-semibold mb-3" style={{ color: 'var(--color-on-surface)' }}>
          „{item.description}"
        </h2>

        <label className="block mb-3">
          <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>Bemerkung</span>
          <textarea
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            maxLength={1000}
            rows={3}
            autoComplete="off"
            spellCheck={false}
            className="mt-1 w-full px-2 py-1 rounded text-sm resize-y"
            style={INPUT_STYLE}
          />
        </label>

        <label className="block mb-3">
          <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>Link-URL</span>
          <input
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            maxLength={500}
            placeholder="https://…"
            autoComplete="off"
            spellCheck={false}
            className="mt-1 w-full px-2 py-1 rounded text-sm"
            style={INPUT_STYLE}
          />
        </label>

        <label className="block mb-4">
          <span className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>Link-Label</span>
          <input
            type="text"
            value={linkLabel}
            onChange={(e) => setLinkLabel(e.target.value)}
            maxLength={100}
            placeholder="Anzeigetext (leer = URL wird gezeigt)"
            autoComplete="off"
            spellCheck={false}
            className="mt-1 w-full px-2 py-1 rounded text-sm"
            style={INPUT_STYLE}
          />
        </label>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 rounded-md text-sm"
            style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-md text-sm"
            style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)' }}
          >
            {saving ? 'Speichern …' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: AddSectionForm**

Datei `frontend/src/components/amazon/checklist/AddSectionForm.tsx`:

```tsx
import { useState } from 'react';

interface Props {
  onAdd: (title: string) => void | Promise<void>;
}

export function AddSectionForm({ onAdd }: Props) {
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const trimmed = title.trim();

  async function submit() {
    if (trimmed.length === 0 || busy) return;
    setBusy(true);
    try {
      await onAdd(trimmed);
      setTitle('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2 mt-3">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        placeholder="Neue Section …"
        autoComplete="off"
        spellCheck={false}
        maxLength={200}
        className="flex-1 px-3 py-2 rounded-md text-sm"
        style={{
          background: 'var(--color-surface-container-low)',
          color: 'var(--color-on-surface)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      />
      <button
        type="button"
        onClick={submit}
        disabled={trimmed.length === 0 || busy}
        className="px-3 py-2 rounded-md text-sm flex items-center gap-2 disabled:opacity-50"
        style={{
          background: 'var(--color-surface-container-high)',
          color: 'var(--color-on-surface)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <span className="material-symbols-outlined text-base">add</span>
        Section
      </button>
    </div>
  );
}
```

- [ ] **Step 3: AddItemForm**

Datei `frontend/src/components/amazon/checklist/AddItemForm.tsx`:

```tsx
import { useState } from 'react';

interface Props {
  onAdd: (description: string) => void | Promise<void>;
}

export function AddItemForm({ onAdd }: Props) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const trimmed = text.trim();

  async function submit() {
    if (trimmed.length === 0 || busy) return;
    setBusy(true);
    try {
      await onAdd(trimmed);
      setText('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2 mt-2">
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        placeholder="Neuer Punkt …"
        autoComplete="off"
        spellCheck={false}
        maxLength={500}
        className="flex-1 px-3 py-1.5 rounded-md text-sm"
        style={{
          background: 'var(--color-surface-container-low)',
          color: 'var(--color-on-surface)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      />
      <button
        type="button"
        onClick={submit}
        disabled={trimmed.length === 0 || busy}
        className="px-3 py-1.5 rounded-md text-sm flex items-center gap-2 disabled:opacity-50"
        style={{
          background: 'var(--color-surface-container-high)',
          color: 'var(--color-on-surface)',
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        <span className="material-symbols-outlined text-base">add</span>
        Punkt
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck**

```bash
cd frontend && npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/amazon/checklist/EditItemDialog.tsx frontend/src/components/amazon/checklist/AddSectionForm.tsx frontend/src/components/amazon/checklist/AddItemForm.tsx
git commit -m "feat(amazon-checklist): EditItemDialog + AddSectionForm + AddItemForm

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: ChecklistItemRow + ChecklistSectionBlock

Beide Komponenten arbeiten via Callback-Props mit Master oder Produkt.

**Files:**
- Create: `frontend/src/components/amazon/checklist/ChecklistItemRow.tsx`
- Create: `frontend/src/components/amazon/checklist/ChecklistSectionBlock.tsx`

- [ ] **Step 1: ChecklistItemRow**

Datei `frontend/src/components/amazon/checklist/ChecklistItemRow.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { type ChecklistItem, type ChecklistItemPatch } from '../../../api/amazon.api';

interface Props {
  rowNumber: number;
  item: ChecklistItem;
  onUpdate: (patch: ChecklistItemPatch) => void;
  onRequestEdit: (item: ChecklistItem) => void;
  onRequestDelete: (item: ChecklistItem) => void;
}

const INPUT_STYLE: React.CSSProperties = {
  background: 'var(--color-surface-container-low)',
  color: 'var(--color-on-surface)',
  border: '1px solid rgba(255,255,255,0.08)',
};

export function ChecklistItemRow({ rowNumber, item, onUpdate, onRequestEdit, onRequestDelete }: Props) {
  const [description, setDescription] = useState(item.description);
  useEffect(() => { setDescription(item.description); }, [item.description]);

  function saveDescription() {
    const trimmed = description.trim();
    if (trimmed.length === 0 || trimmed === item.description) {
      setDescription(item.description);
      return;
    }
    onUpdate({ description: trimmed });
  }

  function toggleDone() {
    onUpdate({ is_done: item.is_done === 1 ? 0 : 1 });
  }

  const linkText = item.link_label || item.link_url;

  return (
    <tr
      className="group"
      style={{
        borderBottom: '1px solid rgba(255,255,255,0.04)',
        opacity: item.is_done === 1 ? 0.7 : 1,
      }}
    >
      <td className="p-2 text-right text-xs tabular-nums" style={{ color: 'var(--color-on-surface-variant)' }}>
        {rowNumber}
      </td>
      <td className="p-2">
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={saveDescription}
          maxLength={500}
          autoComplete="off"
          spellCheck={false}
          className="w-full px-2 py-1 rounded text-sm"
          style={{
            ...INPUT_STYLE,
            textDecoration: item.is_done === 1 ? 'line-through' : 'none',
          }}
        />
      </td>
      <td className="p-2 text-center">
        <input
          type="checkbox"
          checked={item.is_done === 1}
          onChange={toggleDone}
          className="w-4 h-4"
          style={{ accentColor: 'var(--color-primary)' }}
          aria-label="Erledigt"
        />
      </td>
      <td className="p-2 text-sm" style={{ color: 'var(--color-on-surface-variant)' }}>
        {item.remark ?? ''}
      </td>
      <td className="p-2 text-sm">
        {item.link_url && linkText ? (
          <a
            href={item.link_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'var(--color-primary)', textDecoration: 'underline' }}
          >
            {linkText}
          </a>
        ) : null}
      </td>
      <td className="p-2 text-right whitespace-nowrap">
        <button
          type="button"
          onClick={() => onRequestEdit(item)}
          aria-label="Bemerkung / Link bearbeiten"
          className="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/5"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px', color: 'var(--color-on-surface-variant)' }}>edit</span>
        </button>
        <button
          type="button"
          onClick={() => onRequestDelete(item)}
          aria-label="Punkt löschen"
          className="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/5"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#fca5a5' }}>delete</span>
        </button>
      </td>
    </tr>
  );
}
```

- [ ] **Step 2: ChecklistSectionBlock**

Datei `frontend/src/components/amazon/checklist/ChecklistSectionBlock.tsx`:

```tsx
import { useEffect, useState } from 'react';
import {
  type ChecklistItem, type ChecklistItemCreate, type ChecklistItemPatch,
  type ChecklistSection, type ChecklistSectionPatch,
} from '../../../api/amazon.api';
import { ChecklistItemRow } from './ChecklistItemRow';
import { AddItemForm } from './AddItemForm';

interface Props {
  section: ChecklistSection;
  onUpdateSection: (patch: ChecklistSectionPatch) => void;
  onDeleteSection: () => void;
  onCreateItem: (input: ChecklistItemCreate) => void;
  onUpdateItem: (itemId: number, patch: ChecklistItemPatch) => void;
  onRequestEditItem: (item: ChecklistItem) => void;
  onRequestDeleteItem: (item: ChecklistItem) => void;
}

const TH_STYLE: React.CSSProperties = {
  textAlign: 'left',
  fontSize: '12px',
  fontWeight: 500,
  color: 'var(--color-on-surface-variant)',
  padding: '8px',
  whiteSpace: 'nowrap',
};

export function ChecklistSectionBlock({
  section, onUpdateSection, onDeleteSection,
  onCreateItem, onUpdateItem, onRequestEditItem, onRequestDeleteItem,
}: Props) {
  const [title, setTitle] = useState(section.title);
  useEffect(() => { setTitle(section.title); }, [section.title]);

  function saveTitle() {
    const trimmed = title.trim();
    if (trimmed.length === 0 || trimmed === section.title) {
      setTitle(section.title);
      return;
    }
    onUpdateSection({ title: trimmed });
  }

  const doneCount = section.items.filter(i => i.is_done === 1).length;

  return (
    <section
      className="rounded-xl overflow-hidden mb-4"
      style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      {/* Header */}
      <header
        className="flex items-center gap-2 px-5 py-3"
        style={{ background: 'rgba(101,163,13,0.18)' }}
      >
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={saveTitle}
          maxLength={200}
          autoComplete="off"
          spellCheck={false}
          className="flex-1 bg-transparent border-0 outline-none font-semibold text-base"
          style={{ color: '#bef264' }}
        />
        <span
          className="text-xs px-2 py-0.5 rounded-full"
          style={{ background: 'rgba(255,255,255,0.08)', color: '#bef264' }}
        >
          {doneCount} / {section.items.length}
        </span>
        <button
          type="button"
          onClick={onDeleteSection}
          aria-label="Section löschen"
          className="p-1 rounded hover:bg-white/10"
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px', color: '#fca5a5' }}>delete</span>
        </button>
      </header>

      {/* Tabelle */}
      <div className="px-3 pb-3">
        {section.items.length === 0 ? (
          <p
            className="text-sm text-center py-4"
            style={{ color: 'var(--color-on-surface-variant)' }}
          >
            Noch keine Punkte in dieser Section.
          </p>
        ) : (
          <table className="w-full">
            <thead>
              <tr>
                <th style={{ ...TH_STYLE, textAlign: 'right', width: 36 }}>#</th>
                <th style={TH_STYLE}>Beschreibung</th>
                <th style={{ ...TH_STYLE, textAlign: 'center' }}>Erledigt</th>
                <th style={TH_STYLE}>Bemerkung</th>
                <th style={TH_STYLE}>Link</th>
                <th style={{ ...TH_STYLE, textAlign: 'right' }}></th>
              </tr>
            </thead>
            <tbody>
              {section.items.map((item, idx) => (
                <ChecklistItemRow
                  key={item.id}
                  rowNumber={idx + 1}
                  item={item}
                  onUpdate={(patch) => onUpdateItem(item.id, patch)}
                  onRequestEdit={onRequestEditItem}
                  onRequestDelete={onRequestDeleteItem}
                />
              ))}
            </tbody>
          </table>
        )}
        <div className="px-2">
          <AddItemForm onAdd={(description) => onCreateItem({ description })} />
        </div>
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
cd frontend && npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/amazon/checklist/ChecklistItemRow.tsx frontend/src/components/amazon/checklist/ChecklistSectionBlock.tsx
git commit -m "feat(amazon-checklist): ChecklistItemRow + ChecklistSectionBlock

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: AmazonChecklistMasterPage + Sidebar + Route

**Files:**
- Create: `frontend/src/pages/amazon/AmazonChecklistMasterPage.tsx`
- Modify: `frontend/src/routes/routes.tsx`
- Modify: `frontend/src/components/layout/navConfig.ts`

- [ ] **Step 1: AmazonChecklistMasterPage**

Datei `frontend/src/pages/amazon/AmazonChecklistMasterPage.tsx`:

```tsx
import { useState } from 'react';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { type ChecklistItem } from '../../api/amazon.api';
import {
  useChecklistMaster,
  useCreateMasterSection,
  useUpdateMasterSection,
  useDeleteMasterSection,
  useCreateMasterItem,
  useUpdateMasterItem,
  useDeleteMasterItem,
} from '../../hooks/amazon/useChecklistMaster';
import { ChecklistSectionBlock } from '../../components/amazon/checklist/ChecklistSectionBlock';
import { AddSectionForm } from '../../components/amazon/checklist/AddSectionForm';
import { EditItemDialog } from '../../components/amazon/checklist/EditItemDialog';

export function AmazonChecklistMasterPage() {
  const { data, isLoading, isError, refetch } = useChecklistMaster();
  const createSection = useCreateMasterSection();
  const updateSection = useUpdateMasterSection();
  const deleteSection = useDeleteMasterSection();
  const createItem = useCreateMasterItem();
  const updateItem = useUpdateMasterItem();
  const deleteItem = useDeleteMasterItem();
  const [editingItem, setEditingItem] = useState<ChecklistItem | null>(null);

  return (
    <PageWrapper>
      <header className="flex items-center gap-3 mb-2">
        <div
          className="w-12 h-12 rounded-lg flex items-center justify-center"
          style={{ background: 'var(--color-surface-container)' }}
        >
          <span className="material-symbols-outlined" style={{ color: '#bef264' }}>checklist</span>
        </div>
        <div>
          <h1
            className="text-2xl font-bold leading-tight"
            style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}
          >
            Checkliste — Master
          </h1>
          <p style={{ color: 'var(--color-on-surface-variant)' }}>
            Diese Vorlage wird beim Anlegen eines neuen Produkts ins Produkt kopiert. Spätere Änderungen wirken nicht auf bereits angelegte Produkte zurück.
          </p>
        </div>
      </header>

      <div className="mt-6">
        {isLoading && <p style={{ color: 'var(--color-on-surface-variant)' }}>Lade Checkliste …</p>}
        {isError && (
          <div className="rounded-lg p-4" style={{ background: 'var(--color-surface-container-low)' }}>
            <p style={{ color: 'var(--color-on-surface)' }}>Master-Checkliste konnte nicht geladen werden.</p>
            <button
              type="button"
              onClick={() => refetch()}
              className="mt-2 px-3 py-1.5 rounded-md text-sm"
              style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)' }}
            >
              Erneut laden
            </button>
          </div>
        )}
        {!isLoading && !isError && data && (
          <>
            {data.sections.map(section => (
              <ChecklistSectionBlock
                key={section.id}
                section={section}
                onUpdateSection={(patch) => updateSection.mutate({ id: section.id, patch })}
                onDeleteSection={() => {
                  if (confirm(`Section „${section.title}" inklusive aller Punkte löschen?`)) {
                    deleteSection.mutate(section.id);
                  }
                }}
                onCreateItem={(input) => createItem.mutate({ sectionId: section.id, input })}
                onUpdateItem={(itemId, patch) => updateItem.mutate({ id: itemId, patch })}
                onRequestEditItem={setEditingItem}
                onRequestDeleteItem={(item) => {
                  if (confirm(`Punkt „${item.description}" löschen?`)) {
                    deleteItem.mutate(item.id);
                  }
                }}
              />
            ))}
            <AddSectionForm onAdd={(title) => createSection.mutateAsync(title)} />
          </>
        )}
      </div>

      <EditItemDialog
        item={editingItem}
        onClose={() => setEditingItem(null)}
        onSave={async (patch) => {
          if (!editingItem) return;
          await updateItem.mutateAsync({ id: editingItem.id, patch });
        }}
      />
    </PageWrapper>
  );
}
```

- [ ] **Step 2: Route eintragen**

In `frontend/src/routes/routes.tsx`:

(a) Import nach `AmazonProductDetailPage` ergänzen:
```tsx
import { AmazonChecklistMasterPage } from '../pages/amazon/AmazonChecklistMasterPage';
```

(b) Route nach `/amazon/entwicklung/products/:id` einfügen:
```tsx
{ path: '/amazon/entwicklung/checkliste', element: <AmazonChecklistMasterPage /> },
```

- [ ] **Step 3: Sidebar-Eintrag + pageName**

In `frontend/src/components/layout/navConfig.ts`:

(a) Den Amazon-Block:
```ts
{ path: '/amazon', label: 'Amazon', icon: 'shopping_cart', subItems: [
  { path: '/amazon/entwicklung',  label: 'Entwicklung',  icon: 'settings' },
]},
```

ersetzen durch:
```ts
{ path: '/amazon', label: 'Amazon', icon: 'shopping_cart', subItems: [
  { path: '/amazon/entwicklung',             label: 'Entwicklung',  icon: 'settings' },
  { path: '/amazon/entwicklung/checkliste',  label: 'Checkliste',   icon: 'checklist' },
]},
```

(b) Im `pageNames`-Block die Zeile `'/amazon/entwicklung':    'Entwicklung',` zu:
```ts
  '/amazon/entwicklung':            'Entwicklung',
  '/amazon/entwicklung/checkliste': 'Checkliste',
```

- [ ] **Step 4: Typecheck**

```bash
cd frontend && npm run typecheck
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/amazon/AmazonChecklistMasterPage.tsx frontend/src/routes/routes.tsx frontend/src/components/layout/navConfig.ts
git commit -m "feat(amazon-checklist): Master-Page + Sidebar-Unterpunkt + Route

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: ChecklistSection (Akkordeon) + Detail-Page-Einbindung

**Files:**
- Create: `frontend/src/components/amazon/checklist/ChecklistSection.tsx`
- Modify: `frontend/src/pages/amazon/AmazonProductDetailPage.tsx`

- [ ] **Step 1: ChecklistSection**

Datei `frontend/src/components/amazon/checklist/ChecklistSection.tsx`:

```tsx
import { useState } from 'react';
import { type ChecklistItem } from '../../../api/amazon.api';
import {
  useChecklistProduct,
  useCreateProductSection,
  useUpdateProductSection,
  useDeleteProductSection,
  useCreateProductItem,
  useUpdateProductItem,
  useDeleteProductItem,
} from '../../../hooks/amazon/useChecklistProduct';
import { SectionHeader } from '../SectionHeader';
import { ChecklistSectionBlock } from './ChecklistSectionBlock';
import { AddSectionForm } from './AddSectionForm';
import { EditItemDialog } from './EditItemDialog';

const ACCENT = '#a3e635';
const STORAGE_KEY = (productId: number) => `amazon.checklist.expanded.${productId}`;

interface Props {
  productId: number;
}

export function ChecklistSection({ productId }: Props) {
  const { data, isLoading, isError, refetch } = useChecklistProduct(productId);
  const createSection = useCreateProductSection(productId);
  const updateSection = useUpdateProductSection(productId);
  const deleteSection = useDeleteProductSection(productId);
  const createItem = useCreateProductItem(productId);
  const updateItem = useUpdateProductItem(productId);
  const deleteItem = useDeleteProductItem(productId);
  const [editingItem, setEditingItem] = useState<ChecklistItem | null>(null);

  const [expanded, setExpanded] = useState<boolean>(() => {
    const v = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY(productId)) : null;
    return v === null ? true : v === '1';
  });

  function toggle() {
    setExpanded(prev => {
      const next = !prev;
      try { window.localStorage.setItem(STORAGE_KEY(productId), next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  }

  const totalItems = data?.sections.reduce((s, sec) => s + sec.items.length, 0) ?? 0;
  const doneItems = data?.sections.reduce(
    (s, sec) => s + sec.items.filter(i => i.is_done === 1).length, 0,
  ) ?? 0;

  return (
    <section
      className="rounded-xl overflow-hidden"
      style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <SectionHeader
        icon="checklist"
        title="Checkliste"
        accent={ACCENT}
        expanded={expanded}
        onToggleExpand={toggle}
        rightSlot={
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{ background: `${ACCENT}33`, color: ACCENT }}
          >
            {doneItems} / {totalItems}
          </span>
        }
      />
      {expanded && (
        <div className="px-2 pb-4">
          {isLoading && <p className="px-5 py-3" style={{ color: 'var(--color-on-surface-variant)' }}>Lade Checkliste …</p>}
          {isError && (
            <div className="px-5 py-3">
              <p className="mb-2" style={{ color: 'var(--color-on-surface)' }}>Checkliste konnte nicht geladen werden.</p>
              <button
                type="button"
                onClick={() => refetch()}
                className="px-3 py-1.5 rounded-md text-sm"
                style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)' }}
              >
                Erneut laden
              </button>
            </div>
          )}
          {!isLoading && !isError && data && (
            <>
              {data.sections.map(section => (
                <ChecklistSectionBlock
                  key={section.id}
                  section={section}
                  onUpdateSection={(patch) => updateSection.mutate({ sectionId: section.id, patch })}
                  onDeleteSection={() => {
                    if (confirm(`Section „${section.title}" inklusive aller Punkte löschen?`)) {
                      deleteSection.mutate(section.id);
                    }
                  }}
                  onCreateItem={(input) => createItem.mutate({ sectionId: section.id, input })}
                  onUpdateItem={(itemId, patch) => updateItem.mutate({ itemId, patch })}
                  onRequestEditItem={setEditingItem}
                  onRequestDeleteItem={(item) => {
                    if (confirm(`Punkt „${item.description}" löschen?`)) {
                      deleteItem.mutate(item.id);
                    }
                  }}
                />
              ))}
              <div className="px-3">
                <AddSectionForm onAdd={(title) => createSection.mutateAsync(title)} />
              </div>
            </>
          )}
        </div>
      )}

      <EditItemDialog
        item={editingItem}
        onClose={() => setEditingItem(null)}
        onSave={async (patch) => {
          if (!editingItem) return;
          await updateItem.mutateAsync({ itemId: editingItem.id, patch });
        }}
      />
    </section>
  );
}
```

- [ ] **Step 2: Detail-Page-Einbindung**

In `frontend/src/pages/amazon/AmazonProductDetailPage.tsx`:

(a) Import nach `BrandNameSection` ergänzen:
```tsx
import { ChecklistSection } from '../../components/amazon/checklist/ChecklistSection';
```

(b) Im Sektionen-Container nach `<BrandNameSection>` einfügen:
```tsx
<ChecklistSection productId={product.id} />
```

So sieht der Block dann aus:
```tsx
<div className="flex flex-col gap-4">
  <SourcingSection productId={product.id} />
  <BrandNameSection productId={product.id} productName={product.name} />
  <ChecklistSection productId={product.id} />
</div>
```

- [ ] **Step 3: Typecheck**

```bash
cd frontend && npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/amazon/checklist/ChecklistSection.tsx frontend/src/pages/amazon/AmazonProductDetailPage.tsx
git commit -m "feat(amazon-checklist): Akkordeon auf Detail-Seite + Lazy-Init-UX

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Tests, Typecheck, UAT

- [ ] **Step 1: Backend-Tests komplett**

```bash
cd backend && npm test
```
Erwartet: alle Tests grün, inkl. `schema.amazon_checklist` (6) und `integration.amazon_checklist` (19).

- [ ] **Step 2: Frontend-Typecheck**

```bash
cd frontend && npm run typecheck
```
Erwartet: 0 Fehler.

- [ ] **Step 3: Backend frisch starten**

```bash
cd backend && pkill -f "tsx watch" 2>/dev/null; sleep 1; npm run dev &
sleep 4
curl -s http://localhost:3001/api/health
```
Erwartet: `{"status":"ok"}`.

- [ ] **Step 4: Manuelles UAT**

Browser auf `/amazon/entwicklung/checkliste`:

- [ ] 5 Sections mit allen Items sichtbar; "Produkteinkauf" hat 19 Items.
- [ ] Item-Beschreibung ändern + Tab → Autosave.
- [ ] Erledigt-Häkchen setzen → bleibt nach Reload.
- [ ] Neues Item in "Bei Verkäufen außerhalb der EU" anlegen → erscheint unten.
- [ ] Edit-Button auf Item → Modal mit Bemerkung + URL + Label → speichern → Link erscheint klickbar in der Zeile.
- [ ] Delete-Button auf Item → Confirm → Item weg.
- [ ] Neue Section "Test" über Add-Form ganz unten anlegen → erscheint.
- [ ] Section-Titel im Header inline ändern + Tab → Autosave.
- [ ] Section "Test" löschen → Confirm → weg.

Browser auf `/amazon/entwicklung/products/1` (Rausfallschutz Boxspringbett):

- [ ] Neue Sektion "Checkliste" erscheint unter Sourcing und Markenname.
- [ ] Beim ersten Aufruf: 5 Sections + 66 Items sichtbar, alle Erledigt-Häkchen leer.
- [ ] Erledigt-Häkchen setzen → Master bleibt unverändert (auf `/amazon/entwicklung/checkliste` prüfen).
- [ ] Produkt-Item-Beschreibung ändern → Master bleibt unverändert.
- [ ] Section zuklappen (Klick auf Header) → bleibt nach Reload zugeklappt.
- [ ] Fortschritts-Pille im Section-Header zeigt `X / 66`.

Neues Produkt anlegen:
- [ ] `/amazon/entwicklung` → "+ Produkt direkt entwickeln" → Name "Testprodukt".
- [ ] Auf "Testprodukt" klicken → Checkliste-Sektion zeigt 5 Sections + 66 Items (frische Kopie).
- [ ] Im neuen Produkt eine Erledigt setzen → wirkt nur dort.

Fehler-Pfad:
- [ ] Backend stoppen (`pkill -f "tsx watch"`), Item-Beschreibung ändern → AutosaveIndicator zeigt rotes "Speichern fehlgeschlagen". Backend wieder starten.

- [ ] **Step 5: Push**

```bash
git push origin main
```

---

## Selbstreview-Notizen

- **Spec-Coverage:**
  - Datenmodell (4 Tabellen + Seed) → T1
  - Backend Master-CRUD → T2
  - Backend Produkt-CRUD + Lazy-Init + Mount → T3
  - Frontend API + Hooks → T4
  - Edit-Dialog + Add-Forms → T5
  - ItemRow + SectionBlock → T6
  - Master-Page + Sidebar + Route → T7
  - Akkordeon-Section auf Detail-Seite → T8
  - Tests + UAT → T9
- **Wiederverwendung:** `SectionHeader` aus Sourcing/Brand wird auf der Detail-Seite weiter genutzt (T8). `ChecklistSectionBlock` ist sowohl im Master als auch in der Produkt-Sektion identisch.
- **Type-Konsistenz:** `ChecklistItem`, `ChecklistSection`, `ChecklistPayload`, `ChecklistItemPatch`, `ChecklistSectionPatch`, `ChecklistItemCreate` überall identisch.
- **Bekannte Falle:** Backend nach Routen-Änderung neu starten — T3 enthält explizit den Restart.
- **Out-of-Scope:** Drag&Drop, Fortschritts-Statistik in Sub-Pages, PDF-Export, "Master neu importieren"-Button.
