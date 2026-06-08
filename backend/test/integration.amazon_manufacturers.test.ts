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
  // @ts-expect-error test injection
  conn.default = db;
  const routes = (await import('../src/routes/amazon.manufacturers.routes')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/amazon', routes);
  return app;
}

function makeProduct(db: Database.Database, name = 'P'): number {
  db.prepare(`INSERT INTO amazon_products (name) VALUES (?)`).run(name);
  return Number((db.prepare(`SELECT last_insert_rowid() AS id`).get() as { id: number }).id);
}

describe('Amazon Hersteller — CRUD', () => {
  let db: Database.Database; let app: express.Express;
  beforeEach(async () => { db = createTestDb(); app = await makeApp(db); });

  it('GET leere Liste; 404 unbekanntes Produkt', async () => {
    const pid = makeProduct(db);
    const r = await request(app).get(`/api/amazon/products/${pid}/manufacturers`);
    expect(r.status).toBe(200);
    expect(r.body.manufacturers).toEqual([]);
    expect((await request(app).get('/api/amazon/products/9999/manufacturers')).status).toBe(404);
  });

  it('Hersteller anlegen, patchen (trim, leer->null), Angebote enthalten', async () => {
    const pid = makeProduct(db);
    const c = await request(app).post(`/api/amazon/products/${pid}/manufacturers`).send({ name: 'Acme' });
    expect(c.status).toBe(201);
    expect(c.body.manufacturer).toMatchObject({ name: 'Acme', sort_order: 1 });
    expect(c.body.manufacturer.offers).toEqual([]);
    const mId = c.body.manufacturer.id;
    const p = await request(app).patch(`/api/amazon/products/${pid}/manufacturers/${mId}`)
      .send({ ansprechpartner: '  Herr X ', adresse: '', email: 'a@b.de' });
    expect(p.status).toBe(200);
    expect(p.body.manufacturer).toMatchObject({ ansprechpartner: 'Herr X', adresse: null, email: 'a@b.de' });
  });

  it('Angebot-CRUD + im GET eingebettet', async () => {
    const pid = makeProduct(db);
    const mId = (await request(app).post(`/api/amazon/products/${pid}/manufacturers`).send({ name: 'Acme' })).body.manufacturer.id;
    const o = await request(app).post(`/api/amazon/products/${pid}/manufacturers/${mId}/offers`).send({});
    expect(o.status).toBe(201);
    const oId = o.body.offer.id;
    const up = await request(app).patch(`/api/amazon/products/${pid}/manufacturers/${mId}/offers/${oId}`)
      .send({ preis: '12,50 €', menge_variante: '500 Stk', moq: '300' });
    expect(up.status).toBe(200);
    expect(up.body.offer).toMatchObject({ preis: '12,50 €', menge_variante: '500 Stk', moq: '300' });
    const list = await request(app).get(`/api/amazon/products/${pid}/manufacturers`);
    expect(list.body.manufacturers[0].offers.map((x: { id: number }) => x.id)).toEqual([oId]);
    const del = await request(app).delete(`/api/amazon/products/${pid}/manufacturers/${mId}/offers/${oId}`);
    expect(del.status).toBe(204);
    expect((await request(app).get(`/api/amazon/products/${pid}/manufacturers`)).body.manufacturers[0].offers).toEqual([]);
  });

  it('Hersteller löschen entfernt seine Angebote', async () => {
    const pid = makeProduct(db);
    const mId = (await request(app).post(`/api/amazon/products/${pid}/manufacturers`).send({ name: 'Acme' })).body.manufacturer.id;
    await request(app).post(`/api/amazon/products/${pid}/manufacturers/${mId}/offers`).send({});
    expect((await request(app).delete(`/api/amazon/products/${pid}/manufacturers/${mId}`)).status).toBe(204);
    expect((db.prepare(`SELECT COUNT(*) AS c FROM amazon_manufacturer_offers WHERE manufacturer_id=?`).get(mId) as { c: number }).c).toBe(0);
    expect((await request(app).get(`/api/amazon/products/${pid}/manufacturers`)).body.manufacturers).toEqual([]);
  });

  it('Reorder Hersteller; fremde IDs -> 400', async () => {
    const pid = makeProduct(db);
    const a = (await request(app).post(`/api/amazon/products/${pid}/manufacturers`).send({ name: 'A' })).body.manufacturer.id;
    const b = (await request(app).post(`/api/amazon/products/${pid}/manufacturers`).send({ name: 'B' })).body.manufacturer.id;
    const ro = await request(app).patch(`/api/amazon/products/${pid}/manufacturers/reorder`).send({ order: [b, a] });
    expect(ro.status).toBe(200);
    expect((await request(app).get(`/api/amazon/products/${pid}/manufacturers`)).body.manufacturers.map((m: { id: number }) => m.id)).toEqual([b, a]);
    expect((await request(app).patch(`/api/amazon/products/${pid}/manufacturers/reorder`).send({ order: [99999] })).status).toBe(400);
  });

  it('Ownership: Hersteller/Angebot eines anderen Produkts -> 404', async () => {
    const pA = makeProduct(db, 'A'); const pB = makeProduct(db, 'B');
    const mA = (await request(app).post(`/api/amazon/products/${pA}/manufacturers`).send({ name: 'A' })).body.manufacturer.id;
    expect((await request(app).patch(`/api/amazon/products/${pB}/manufacturers/${mA}`).send({ name: 'X' })).status).toBe(404);
    expect((await request(app).post(`/api/amazon/products/${pB}/manufacturers/${mA}/offers`).send({})).status).toBe(404);
  });

  it('Reorder Angebote; fremde IDs -> 400', async () => {
    const pid = makeProduct(db);
    const mId = (await request(app).post(`/api/amazon/products/${pid}/manufacturers`).send({ name: 'Acme' })).body.manufacturer.id;
    const o1 = (await request(app).post(`/api/amazon/products/${pid}/manufacturers/${mId}/offers`).send({})).body.offer.id;
    const o2 = (await request(app).post(`/api/amazon/products/${pid}/manufacturers/${mId}/offers`).send({})).body.offer.id;
    const ro = await request(app).patch(`/api/amazon/products/${pid}/manufacturers/${mId}/offers/reorder`).send({ order: [o2, o1] });
    expect(ro.status).toBe(200);
    expect((await request(app).get(`/api/amazon/products/${pid}/manufacturers`)).body.manufacturers[0].offers.map((x: { id: number }) => x.id)).toEqual([o2, o1]);
    expect((await request(app).patch(`/api/amazon/products/${pid}/manufacturers/${mId}/offers/reorder`).send({ order: [99999] })).status).toBe(400);
  });

  it('Name per PATCH auf leer -> 400', async () => {
    const pid = makeProduct(db);
    const mId = (await request(app).post(`/api/amazon/products/${pid}/manufacturers`).send({ name: 'Acme' })).body.manufacturer.id;
    expect((await request(app).patch(`/api/amazon/products/${pid}/manufacturers/${mId}`).send({ name: '   ' })).status).toBe(400);
  });
});
