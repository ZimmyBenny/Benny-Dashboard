import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type Database from 'better-sqlite3';
import { createTestDb } from './setup';

// Wir mocken das echte DB-Modul, damit die Route gegen unsere :memory:-DB laeuft
vi.mock('../src/db/connection', () => {
  const mod: { default: Database.Database | null } = { default: null };
  return mod;
});

// Hilfs-App: nur die Amazon-Route mounten, ohne JWT-Guard (Test-Konvention)
async function makeApp(db: Database.Database) {
  const conn = await import('../src/db/connection');
  // @ts-expect-error — wir setzen das default-Export der gemockten DB-Datei
  conn.default = db;
  const routes = (await import('../src/routes/amazon.products.routes')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/amazon', routes);
  return app;
}

describe('Amazon Products API — CRUD', () => {
  let db: Database.Database;
  let app: express.Express;

  beforeEach(async () => {
    db = createTestDb();
    app = await makeApp(db);
  });

  it('POST /products legt Produkt mit Default-Status an', async () => {
    const r = await request(app).post('/api/amazon/products').send({ name: 'Test-Produkt' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ name: 'Test-Produkt', status: 'interessant', image_path: null });
    expect(typeof r.body.id).toBe('number');
  });

  it('POST /products weist leeren Namen ab', async () => {
    const r = await request(app).post('/api/amazon/products').send({ name: '   ' });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/name/i);
  });

  it('POST /products weist 201-Zeichen-Namen ab', async () => {
    const r = await request(app).post('/api/amazon/products').send({ name: 'x'.repeat(201) });
    expect(r.status).toBe(400);
  });

  it('GET /products listet sortiert created_at DESC, ohne verworfene', async () => {
    db.prepare(`INSERT INTO amazon_products (name, status, created_at) VALUES (?,?,?)`).run('A', 'interessant', 100);
    db.prepare(`INSERT INTO amazon_products (name, status, created_at) VALUES (?,?,?)`).run('B', 'verworfen', 200);
    db.prepare(`INSERT INTO amazon_products (name, status, created_at) VALUES (?,?,?)`).run('C', 'aktiv', 300);

    const r = await request(app).get('/api/amazon/products');
    expect(r.status).toBe(200);
    expect(r.body.map((p: { name: string }) => p.name)).toEqual(['C', 'A']);
  });

  it('GET /products?include_discarded=true liefert verworfene mit', async () => {
    db.prepare(`INSERT INTO amazon_products (name, status, created_at) VALUES (?,?,?)`).run('A', 'interessant', 100);
    db.prepare(`INSERT INTO amazon_products (name, status, created_at) VALUES (?,?,?)`).run('B', 'verworfen', 200);

    const r = await request(app).get('/api/amazon/products?include_discarded=true');
    expect(r.body.map((p: { name: string }) => p.name)).toEqual(['B', 'A']);
  });

  it('PATCH /:id aendert Status', async () => {
    const ins = db.prepare(`INSERT INTO amazon_products (name) VALUES ('X')`).run();
    const id = Number(ins.lastInsertRowid);

    const r = await request(app).patch(`/api/amazon/products/${id}`).send({ status: 'aktiv' });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('aktiv');
  });

  it('PATCH /:id weist ungueltigen Status ab', async () => {
    const ins = db.prepare(`INSERT INTO amazon_products (name) VALUES ('X')`).run();
    const id = Number(ins.lastInsertRowid);

    const r = await request(app).patch(`/api/amazon/products/${id}`).send({ status: 'kaputt' });
    expect(r.status).toBe(400);
  });

  it('DELETE /:id entfernt Produkt', async () => {
    const ins = db.prepare(`INSERT INTO amazon_products (name) VALUES ('X')`).run();
    const id = Number(ins.lastInsertRowid);

    const r = await request(app).delete(`/api/amazon/products/${id}`);
    expect(r.status).toBe(204);

    const row = db.prepare(`SELECT * FROM amazon_products WHERE id=?`).get(id);
    expect(row).toBeUndefined();
  });
});
