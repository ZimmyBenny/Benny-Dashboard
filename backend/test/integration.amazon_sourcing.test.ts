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
