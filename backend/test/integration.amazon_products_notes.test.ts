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
  // @ts-expect-error — we override the test-only connection
  conn.default = db;
  const routes = (await import('../src/routes/amazon.products.routes')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/amazon', routes);
  return app;
}

describe('amazon_products — notes via PATCH', () => {
  let db: Database.Database;
  let app: express.Express;

  beforeEach(async () => {
    db = createTestDb();
    app = await makeApp(db);
    db.prepare(`INSERT INTO amazon_products (name) VALUES ('Test')`).run();
  });

  it('PATCH notes string setzt Feld', async () => {
    const r = await request(app)
      .patch('/api/amazon/products/1')
      .send({ notes: 'Meine Notiz' });
    expect(r.status).toBe(200);
    expect(r.body.notes).toBe('Meine Notiz');
  });

  it('PATCH notes leerer string -> NULL', async () => {
    await request(app).patch('/api/amazon/products/1').send({ notes: 'X' });
    const r = await request(app).patch('/api/amazon/products/1').send({ notes: '' });
    expect(r.status).toBe(200);
    expect(r.body.notes).toBeNull();
  });

  it('PATCH notes null setzt NULL', async () => {
    await request(app).patch('/api/amazon/products/1').send({ notes: 'X' });
    const r = await request(app).patch('/api/amazon/products/1').send({ notes: null });
    expect(r.status).toBe(200);
    expect(r.body.notes).toBeNull();
  });

  it('PATCH notes nicht-string -> 400', async () => {
    const r = await request(app).patch('/api/amazon/products/1').send({ notes: 42 });
    expect(r.status).toBe(400);
  });

  it('PATCH notes > 5000 Zeichen -> 400', async () => {
    const r = await request(app)
      .patch('/api/amazon/products/1')
      .send({ notes: 'x'.repeat(5001) });
    expect(r.status).toBe(400);
  });
});
