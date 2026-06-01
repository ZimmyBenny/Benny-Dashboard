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
  // @ts-expect-error — wir setzen das default-Export der gemockten DB-Datei
  conn.default = db;
  const routes = (await import('../src/routes/amazon.sourcing.routes')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/amazon', routes);
  return app;
}

function makeProduct(db: Database.Database, name = 'P'): number {
  db.prepare(`INSERT INTO amazon_products (name) VALUES (?)`).run(name);
  return Number((db.prepare(`SELECT last_insert_rowid() AS id`).get() as { id: number }).id);
}

describe('Sourcing API — GET + PATCH', () => {
  let db: Database.Database;
  let app: express.Express;

  beforeEach(async () => {
    db = createTestDb();
    app = await makeApp(db);
  });

  it('GET legt sourcing-Eintrag bei Bedarf an', async () => {
    const productId = makeProduct(db);
    const r = await request(app).get(`/api/amazon/products/${productId}/sourcing`);
    expect(r.status).toBe(200);
    expect(r.body.sourcing).toMatchObject({
      product_id: productId,
      status: 'offen',
      is_expanded: 1,
      cp_hersteller_gefiltert: 0,
      cp_zahlungsziel: 0,
    });
    expect(r.body.samples).toEqual([]);

    const row = db.prepare(`SELECT * FROM amazon_sourcing WHERE product_id=?`).get(productId);
    expect(row).toBeDefined();
  });

  it('GET zweimal liefert denselben Eintrag (kein Duplikat)', async () => {
    const productId = makeProduct(db);
    await request(app).get(`/api/amazon/products/${productId}/sourcing`);
    await request(app).get(`/api/amazon/products/${productId}/sourcing`);
    const count = (db.prepare(
      `SELECT COUNT(*) AS c FROM amazon_sourcing WHERE product_id=?`
    ).get(productId) as { c: number }).c;
    expect(count).toBe(1);
  });

  it('GET 404 wenn Produkt nicht existiert', async () => {
    const r = await request(app).get(`/api/amazon/products/9999/sourcing`);
    expect(r.status).toBe(404);
  });

  it('PATCH aktualisiert cp_-Felder', async () => {
    const productId = makeProduct(db);
    await request(app).get(`/api/amazon/products/${productId}/sourcing`);

    const r = await request(app)
      .patch(`/api/amazon/products/${productId}/sourcing`)
      .send({ cp_samples_angefragt: 1, cp_sample_analyse: 1 });

    expect(r.status).toBe(200);
    expect(r.body.sourcing.cp_samples_angefragt).toBe(1);
    expect(r.body.sourcing.cp_sample_analyse).toBe(1);
  });

  it('PATCH weist ungueltigen Status ab', async () => {
    const productId = makeProduct(db);
    const r = await request(app)
      .patch(`/api/amazon/products/${productId}/sourcing`)
      .send({ status: 'kaputt' });
    expect(r.status).toBe(400);
  });

  it('PATCH weist ungueltigen cp-Wert ab', async () => {
    const productId = makeProduct(db);
    const r = await request(app)
      .patch(`/api/amazon/products/${productId}/sourcing`)
      .send({ cp_samples_angefragt: 2 });
    expect(r.status).toBe(400);
  });

  it('PATCH is_expanded togglet', async () => {
    const productId = makeProduct(db);
    await request(app).get(`/api/amazon/products/${productId}/sourcing`);

    const r1 = await request(app)
      .patch(`/api/amazon/products/${productId}/sourcing`)
      .send({ is_expanded: 0 });
    expect(r1.body.sourcing.is_expanded).toBe(0);
  });
});

describe('Sourcing API — Samples', () => {
  let db: Database.Database;
  let app: express.Express;

  beforeEach(async () => {
    db = createTestDb();
    app = await makeApp(db);
  });

  it('POST legt leere Sample-Zeile an, sort_order = max+1', async () => {
    const productId = makeProduct(db);

    const r1 = await request(app).post(`/api/amazon/products/${productId}/sourcing/samples`).send({});
    expect(r1.status).toBe(201);
    expect(r1.body.sample).toMatchObject({
      product_id: productId,
      sort_order: 1,
      is_winner: 0,
      hersteller: null,
      bewertung: null,
    });

    const r2 = await request(app).post(`/api/amazon/products/${productId}/sourcing/samples`).send({});
    expect(r2.body.sample.sort_order).toBe(2);

    const r3 = await request(app).post(`/api/amazon/products/${productId}/sourcing/samples`).send({});
    expect(r3.body.sample.sort_order).toBe(3);
  });

  it('POST gibt 404 fuer unbekanntes Produkt', async () => {
    const r = await request(app).post(`/api/amazon/products/9999/sourcing/samples`).send({});
    expect(r.status).toBe(404);
  });

  it('PATCH aktualisiert Felder mit Trim', async () => {
    const productId = makeProduct(db);
    const created = await request(app).post(`/api/amazon/products/${productId}/sourcing/samples`).send({});
    const sid = created.body.sample.id;

    const r = await request(app)
      .patch(`/api/amazon/products/${productId}/sourcing/samples/${sid}`)
      .send({ hersteller: '  Lieferant A  ', bewertung: 4, qualitaet: 'gut', status: 'bestellt' });

    expect(r.status).toBe(200);
    expect(r.body.sample.hersteller).toBe('Lieferant A');
    expect(r.body.sample.bewertung).toBe(4);
    expect(r.body.sample.qualitaet).toBe('gut');
    expect(r.body.sample.status).toBe('bestellt');
  });

  it('PATCH leerer String wird zu null', async () => {
    const productId = makeProduct(db);
    const created = await request(app).post(`/api/amazon/products/${productId}/sourcing/samples`).send({});
    const sid = created.body.sample.id;
    await request(app).patch(`/api/amazon/products/${productId}/sourcing/samples/${sid}`)
      .send({ hersteller: 'X' });
    const r = await request(app).patch(`/api/amazon/products/${productId}/sourcing/samples/${sid}`)
      .send({ hersteller: '' });
    expect(r.body.sample.hersteller).toBeNull();
  });

  it('PATCH ungueltige bewertung -> 400', async () => {
    const productId = makeProduct(db);
    const created = await request(app).post(`/api/amazon/products/${productId}/sourcing/samples`).send({});
    const sid = created.body.sample.id;

    const r1 = await request(app).patch(`/api/amazon/products/${productId}/sourcing/samples/${sid}`)
      .send({ bewertung: 7 });
    expect(r1.status).toBe(400);

    const r2 = await request(app).patch(`/api/amazon/products/${productId}/sourcing/samples/${sid}`)
      .send({ bewertung: -1 });
    expect(r2.status).toBe(400);
  });

  it('PATCH ungueltige qualitaet/status -> 400', async () => {
    const productId = makeProduct(db);
    const created = await request(app).post(`/api/amazon/products/${productId}/sourcing/samples`).send({});
    const sid = created.body.sample.id;

    const r1 = await request(app).patch(`/api/amazon/products/${productId}/sourcing/samples/${sid}`)
      .send({ qualitaet: 'super_gut' });
    expect(r1.status).toBe(400);

    const r2 = await request(app).patch(`/api/amazon/products/${productId}/sourcing/samples/${sid}`)
      .send({ status: 'kaputt' });
    expect(r2.status).toBe(400);
  });

  it('PATCH is_winner = 1 setzt alle anderen auf 0 (Transaktion)', async () => {
    const productId = makeProduct(db);
    const s1 = (await request(app).post(`/api/amazon/products/${productId}/sourcing/samples`).send({})).body.sample.id;
    const s2 = (await request(app).post(`/api/amazon/products/${productId}/sourcing/samples`).send({})).body.sample.id;
    const s3 = (await request(app).post(`/api/amazon/products/${productId}/sourcing/samples`).send({})).body.sample.id;

    await request(app).patch(`/api/amazon/products/${productId}/sourcing/samples/${s1}`).send({ is_winner: 1 });
    let rows = db.prepare(`SELECT id, is_winner FROM amazon_sourcing_samples WHERE product_id=?`).all(productId) as Array<{ id: number; is_winner: number }>;
    expect(rows.find(r => r.id === s1)!.is_winner).toBe(1);
    expect(rows.find(r => r.id === s2)!.is_winner).toBe(0);
    expect(rows.find(r => r.id === s3)!.is_winner).toBe(0);

    await request(app).patch(`/api/amazon/products/${productId}/sourcing/samples/${s2}`).send({ is_winner: 1 });
    rows = db.prepare(`SELECT id, is_winner FROM amazon_sourcing_samples WHERE product_id=?`).all(productId) as Array<{ id: number; is_winner: number }>;
    expect(rows.find(r => r.id === s1)!.is_winner).toBe(0);
    expect(rows.find(r => r.id === s2)!.is_winner).toBe(1);
  });

  it('PATCH text-Feld > 500 -> 400', async () => {
    const productId = makeProduct(db);
    const sid = (await request(app).post(`/api/amazon/products/${productId}/sourcing/samples`).send({})).body.sample.id;
    const r = await request(app).patch(`/api/amazon/products/${productId}/sourcing/samples/${sid}`)
      .send({ notizen: 'x'.repeat(501) });
    expect(r.status).toBe(400);
  });

  it('DELETE entfernt Sample', async () => {
    const productId = makeProduct(db);
    const sid = (await request(app).post(`/api/amazon/products/${productId}/sourcing/samples`).send({})).body.sample.id;

    const r = await request(app).delete(`/api/amazon/products/${productId}/sourcing/samples/${sid}`);
    expect(r.status).toBe(204);

    const row = db.prepare(`SELECT * FROM amazon_sourcing_samples WHERE id=?`).get(sid);
    expect(row).toBeUndefined();
  });

  it('DELETE eines fremden Sample -> 404', async () => {
    const productA = makeProduct(db, 'A');
    const productB = makeProduct(db, 'B');
    const sid = (await request(app).post(`/api/amazon/products/${productA}/sourcing/samples`).send({})).body.sample.id;

    const r = await request(app).delete(`/api/amazon/products/${productB}/sourcing/samples/${sid}`);
    expect(r.status).toBe(404);
  });

  it('Sample-Limit 50: 51. POST -> 400', async () => {
    const productId = makeProduct(db);
    const insert = db.prepare(`INSERT INTO amazon_sourcing_samples (product_id, sort_order) VALUES (?, ?)`);
    for (let i = 1; i <= 50; i++) insert.run(productId, i);

    const r = await request(app).post(`/api/amazon/products/${productId}/sourcing/samples`).send({});
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/limit/i);
  });
});
