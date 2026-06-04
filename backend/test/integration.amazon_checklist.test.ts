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
