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
  const routes = (await import('../src/routes/amazon.brand.routes')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/amazon', routes);
  return app;
}

function makeProduct(db: Database.Database, name = 'P'): number {
  db.prepare(`INSERT INTO amazon_products (name) VALUES (?)`).run(name);
  return Number((db.prepare(`SELECT last_insert_rowid() AS id`).get() as { id: number }).id);
}

describe('Brand API — GET + PATCH', () => {
  let db: Database.Database;
  let app: express.Express;

  beforeEach(async () => {
    db = createTestDb();
    app = await makeApp(db);
  });

  it('GET legt brand-Eintrag bei Bedarf an', async () => {
    const pid = makeProduct(db);
    const r = await request(app).get(`/api/amazon/products/${pid}/brand`);
    expect(r.status).toBe(200);
    expect(r.body.brand).toMatchObject({
      product_id: pid,
      status: 'offen',
      is_expanded: 1,
      notes: null,
    });
    expect(r.body.names).toEqual([]);
  });

  it('GET 404 wenn Produkt fehlt', async () => {
    const r = await request(app).get(`/api/amazon/products/9999/brand`);
    expect(r.status).toBe(404);
  });

  it('PATCH aendert status + notes mit Trim', async () => {
    const pid = makeProduct(db);
    await request(app).get(`/api/amazon/products/${pid}/brand`);

    const r = await request(app)
      .patch(`/api/amazon/products/${pid}/brand`)
      .send({ status: 'in_bearbeitung', notes: '  Hello  ' });

    expect(r.status).toBe(200);
    expect(r.body.brand.status).toBe('in_bearbeitung');
    expect(r.body.brand.notes).toBe('Hello');
  });

  it('PATCH ungueltiger Status -> 400', async () => {
    const pid = makeProduct(db);
    const r = await request(app).patch(`/api/amazon/products/${pid}/brand`).send({ status: 'x' });
    expect(r.status).toBe(400);
  });

  it('PATCH notes leer -> null', async () => {
    const pid = makeProduct(db);
    await request(app).patch(`/api/amazon/products/${pid}/brand`).send({ notes: 'X' });
    const r = await request(app).patch(`/api/amazon/products/${pid}/brand`).send({ notes: '' });
    expect(r.body.brand.notes).toBeNull();
  });

  it('PATCH notes > 2000 -> 400', async () => {
    const pid = makeProduct(db);
    const r = await request(app)
      .patch(`/api/amazon/products/${pid}/brand`)
      .send({ notes: 'x'.repeat(2001) });
    expect(r.status).toBe(400);
  });
});

describe('Brand API — Candidates', () => {
  let db: Database.Database;
  let app: express.Express;

  beforeEach(async () => {
    db = createTestDb();
    app = await makeApp(db);
  });

  it('POST legt Eintrag mit sort_order = max+1 an', async () => {
    const pid = makeProduct(db);

    const r1 = await request(app).post(`/api/amazon/products/${pid}/brand/names`).send({ name: 'Acme' });
    expect(r1.status).toBe(201);
    expect(r1.body.name).toMatchObject({ name: 'Acme', sort_order: 1, is_favorite: 0 });

    const r2 = await request(app).post(`/api/amazon/products/${pid}/brand/names`).send({ name: 'Beta' });
    expect(r2.body.name.sort_order).toBe(2);
  });

  it('POST mit leerem Namen -> 400', async () => {
    const pid = makeProduct(db);
    const r = await request(app).post(`/api/amazon/products/${pid}/brand/names`).send({ name: '   ' });
    expect(r.status).toBe(400);
  });

  it('POST mit 201-Zeichen-Namen -> 400', async () => {
    const pid = makeProduct(db);
    const r = await request(app).post(`/api/amazon/products/${pid}/brand/names`).send({ name: 'x'.repeat(201) });
    expect(r.status).toBe(400);
  });

  it('POST hat kein Hard-Limit (100+ Namen sind moeglich)', async () => {
    const pid = makeProduct(db);
    const insert = db.prepare(`INSERT INTO amazon_brand_name_candidates (product_id, name, sort_order) VALUES (?, ?, ?)`);
    for (let i = 1; i <= 100; i++) insert.run(pid, `N${i}`, i);

    const r = await request(app).post(`/api/amazon/products/${pid}/brand/names`).send({ name: 'Beyond' });
    expect(r.status).toBe(201);
    expect(r.body.name.sort_order).toBe(101);
  });

  it('PATCH Bool-Felder + remarks mit Trim', async () => {
    const pid = makeProduct(db);
    const cid = (await request(app).post(`/api/amazon/products/${pid}/brand/names`).send({ name: 'Acme' })).body.name.id;

    const r = await request(app)
      .patch(`/api/amazon/products/${pid}/brand/names/${cid}`)
      .send({ is_interesting: 1, is_favorite: 1, remarks: '  hi  ' });

    expect(r.status).toBe(200);
    expect(r.body.name.is_interesting).toBe(1);
    expect(r.body.name.is_favorite).toBe(1);
    expect(r.body.name.remarks).toBe('hi');
  });

  it('PATCH research_status-Felder mit Enum + null', async () => {
    const pid = makeProduct(db);
    const cid = (await request(app).post(`/api/amazon/products/${pid}/brand/names`).send({ name: 'Acme' })).body.name.id;

    const r1 = await request(app).patch(`/api/amazon/products/${pid}/brand/names/${cid}`)
      .send({ trademark_status: 'frei', domain_com_status: 'belegt', domain_de_status: 'unklar', social_status: 'frei' });
    expect(r1.status).toBe(200);
    expect(r1.body.name.trademark_status).toBe('frei');

    const r2 = await request(app).patch(`/api/amazon/products/${pid}/brand/names/${cid}`)
      .send({ trademark_status: 'kaputt' });
    expect(r2.status).toBe(400);

    const r3 = await request(app).patch(`/api/amazon/products/${pid}/brand/names/${cid}`)
      .send({ trademark_status: null });
    expect(r3.body.name.trademark_status).toBeNull();
  });

  it('PATCH research_url > 500 -> 400', async () => {
    const pid = makeProduct(db);
    const cid = (await request(app).post(`/api/amazon/products/${pid}/brand/names`).send({ name: 'Acme' })).body.name.id;
    const r = await request(app).patch(`/api/amazon/products/${pid}/brand/names/${cid}`)
      .send({ research_url: 'x'.repeat(501) });
    expect(r.status).toBe(400);
  });

  it('PATCH research_notes > 2000 -> 400', async () => {
    const pid = makeProduct(db);
    const cid = (await request(app).post(`/api/amazon/products/${pid}/brand/names`).send({ name: 'Acme' })).body.name.id;
    const r = await request(app).patch(`/api/amazon/products/${pid}/brand/names/${cid}`)
      .send({ research_notes: 'x'.repeat(2001) });
    expect(r.status).toBe(400);
  });

  it('PATCH remarks > 300 -> 400', async () => {
    const pid = makeProduct(db);
    const cid = (await request(app).post(`/api/amazon/products/${pid}/brand/names`).send({ name: 'Acme' })).body.name.id;
    const r = await request(app).patch(`/api/amazon/products/${pid}/brand/names/${cid}`)
      .send({ remarks: 'x'.repeat(301) });
    expect(r.status).toBe(400);
  });

  it('PATCH name aendert Wert', async () => {
    const pid = makeProduct(db);
    const cid = (await request(app).post(`/api/amazon/products/${pid}/brand/names`).send({ name: 'Acme' })).body.name.id;
    const r = await request(app).patch(`/api/amazon/products/${pid}/brand/names/${cid}`)
      .send({ name: 'Acmeo' });
    expect(r.body.name.name).toBe('Acmeo');
  });

  it('DELETE entfernt Candidate', async () => {
    const pid = makeProduct(db);
    const cid = (await request(app).post(`/api/amazon/products/${pid}/brand/names`).send({ name: 'Acme' })).body.name.id;
    const r = await request(app).delete(`/api/amazon/products/${pid}/brand/names/${cid}`);
    expect(r.status).toBe(204);
    expect(db.prepare(`SELECT * FROM amazon_brand_name_candidates WHERE id=?`).get(cid)).toBeUndefined();
  });

  it('DELETE fremder Candidate -> 404', async () => {
    const pA = makeProduct(db, 'A');
    const pB = makeProduct(db, 'B');
    const cid = (await request(app).post(`/api/amazon/products/${pA}/brand/names`).send({ name: 'Acme' })).body.name.id;
    const r = await request(app).delete(`/api/amazon/products/${pB}/brand/names/${cid}`);
    expect(r.status).toBe(404);
  });

  it('GET liefert Candidates sortiert', async () => {
    const pid = makeProduct(db);
    await request(app).post(`/api/amazon/products/${pid}/brand/names`).send({ name: 'A' });
    await request(app).post(`/api/amazon/products/${pid}/brand/names`).send({ name: 'B' });
    await request(app).post(`/api/amazon/products/${pid}/brand/names`).send({ name: 'C' });
    const r = await request(app).get(`/api/amazon/products/${pid}/brand`);
    expect(r.body.names.map((n: { name: string }) => n.name)).toEqual(['A', 'B', 'C']);
  });
});

describe('Brand API — finale Marke (is_final, exklusiv)', () => {
  let db: Database.Database; let app: express.Express;
  beforeEach(async () => { db = createTestDb(); app = await makeApp(db); });

  it('is_final exklusiv pro Produkt; ungueltig -> 400', async () => {
    const pid = makeProduct(db);
    await request(app).get(`/api/amazon/products/${pid}/brand`);
    const a = await request(app).post(`/api/amazon/products/${pid}/brand/names`).send({ name: 'Alpha' });
    const b = await request(app).post(`/api/amazon/products/${pid}/brand/names`).send({ name: 'Beta' });
    const aId = a.body.name.id; const bId = b.body.name.id;
    const r1 = await request(app).patch(`/api/amazon/products/${pid}/brand/names/${aId}`).send({ is_final: 1 });
    expect(r1.status).toBe(200);
    expect(r1.body.name.is_final).toBe(1);
    await request(app).patch(`/api/amazon/products/${pid}/brand/names/${bId}`).send({ is_final: 1 });
    const list = await request(app).get(`/api/amazon/products/${pid}/brand`);
    const byId = new Map(list.body.names.map((n: { id: number; is_final: number }) => [n.id, n.is_final]));
    expect(byId.get(aId)).toBe(0);
    expect(byId.get(bId)).toBe(1);
    const bad = await request(app).patch(`/api/amazon/products/${pid}/brand/names/${aId}`).send({ is_final: 2 });
    expect(bad.status).toBe(400);
  });
});
