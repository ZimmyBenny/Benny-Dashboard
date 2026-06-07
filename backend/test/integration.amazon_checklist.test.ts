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
    expect(r.body.sections).toHaveLength(4);
    const total = r.body.sections.reduce(
      (sum: number, s: { items: unknown[] }) => sum + s.items.length, 0,
    );
    expect(total).toBe(52);
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
    expect(sec).toBe(4);
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
    const secId = init.body.sections[init.body.sections.length - 1].id; // OSS-Section mit 1 Item

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

    await request(app)
      .post('/api/amazon/checklist/master/sections')
      .send({ title: 'Brand-New-Master' });

    const r = await request(app).get(`/api/amazon/products/${pid}/checklist`);
    expect(r.body.sections).toHaveLength(4);
  });

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
    const secRes = db.prepare(
      `INSERT INTO amazon_checklist_product_sections (product_id, sort_order, title) VALUES (?, 1, 'Gründung und einmalige Aufgaben')`
    ).run(pid);
    const sid = Number(secRes.lastInsertRowid);
    db.prepare(
      `INSERT INTO amazon_checklist_product_items (section_id, sort_order, description) VALUES (?, 1, 'Alt-Eintrag')`
    ).run(sid);

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
});
