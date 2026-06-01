import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type Database from 'better-sqlite3';
import { createTestDb } from './setup';
import fs from 'fs';
import path from 'path';
import os from 'os';

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

describe('Amazon Products API — Bilder', () => {
  let db: Database.Database;
  let app: express.Express;
  const UPLOAD_DIR = path.join(os.homedir(), '.local', 'share', 'benny-dashboard', 'amazon-products');

  beforeEach(async () => {
    db = createTestDb();
    app = await makeApp(db);
    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  });

  function makePngBuffer(): Buffer {
    // 1x1 PNG (kleinster gueltiger PNG-Header)
    return Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a4944415478da6300010000000500010d0a2db40000000049454e44ae426082',
      'hex'
    );
  }

  it('POST /:id/image speichert Datei und setzt image_path', async () => {
    const ins = db.prepare(`INSERT INTO amazon_products (name) VALUES ('X')`).run();
    const id = Number(ins.lastInsertRowid);

    const r = await request(app)
      .post(`/api/amazon/products/${id}/image`)
      .attach('file', makePngBuffer(), { filename: 'test.png', contentType: 'image/png' });

    expect(r.status).toBe(200);
    expect(r.body.image_path).toMatch(/\.png$/);

    const row = db.prepare(`SELECT image_path FROM amazon_products WHERE id=?`).get(id) as { image_path: string };
    expect(row.image_path).toBe(r.body.image_path);
    expect(fs.existsSync(path.join(UPLOAD_DIR, row.image_path))).toBe(true);

    fs.unlinkSync(path.join(UPLOAD_DIR, row.image_path));
  });

  it('POST /:id/image entfernt vorheriges Bild', async () => {
    const ins = db.prepare(`INSERT INTO amazon_products (name) VALUES ('X')`).run();
    const id = Number(ins.lastInsertRowid);

    const r1 = await request(app).post(`/api/amazon/products/${id}/image`)
      .attach('file', makePngBuffer(), { filename: 'a.png', contentType: 'image/png' });
    const oldPath = path.join(UPLOAD_DIR, r1.body.image_path);

    const r2 = await request(app).post(`/api/amazon/products/${id}/image`)
      .attach('file', makePngBuffer(), { filename: 'b.png', contentType: 'image/png' });

    expect(fs.existsSync(oldPath)).toBe(false);
    expect(fs.existsSync(path.join(UPLOAD_DIR, r2.body.image_path))).toBe(true);

    fs.unlinkSync(path.join(UPLOAD_DIR, r2.body.image_path));
  });

  it('POST /:id/image weist falschen MIME-Type ab', async () => {
    const ins = db.prepare(`INSERT INTO amazon_products (name) VALUES ('X')`).run();
    const id = Number(ins.lastInsertRowid);

    const r = await request(app).post(`/api/amazon/products/${id}/image`)
      .attach('file', Buffer.from('nope'), { filename: 'evil.txt', contentType: 'text/plain' });

    expect(r.status).toBe(400);
  });

  it('GET /:id/image streamt Bild mit Content-Type', async () => {
    const ins = db.prepare(`INSERT INTO amazon_products (name) VALUES ('X')`).run();
    const id = Number(ins.lastInsertRowid);

    const up = await request(app).post(`/api/amazon/products/${id}/image`)
      .attach('file', makePngBuffer(), { filename: 'x.png', contentType: 'image/png' });

    const r = await request(app).get(`/api/amazon/products/${id}/image`);
    expect(r.status).toBe(200);
    expect(r.headers['content-type']).toBe('image/png');
    expect(r.body.length).toBeGreaterThan(0);

    fs.unlinkSync(path.join(UPLOAD_DIR, up.body.image_path));
  });

  it('GET /:id/image gibt 404 ohne Bild', async () => {
    const ins = db.prepare(`INSERT INTO amazon_products (name) VALUES ('X')`).run();
    const id = Number(ins.lastInsertRowid);

    const r = await request(app).get(`/api/amazon/products/${id}/image`);
    expect(r.status).toBe(404);
  });

  it('DELETE /:id/image entfernt Datei und setzt image_path null', async () => {
    const ins = db.prepare(`INSERT INTO amazon_products (name) VALUES ('X')`).run();
    const id = Number(ins.lastInsertRowid);

    const up = await request(app).post(`/api/amazon/products/${id}/image`)
      .attach('file', makePngBuffer(), { filename: 'x.png', contentType: 'image/png' });
    const filePath = path.join(UPLOAD_DIR, up.body.image_path);

    const r = await request(app).delete(`/api/amazon/products/${id}/image`);
    expect(r.status).toBe(204);
    expect(fs.existsSync(filePath)).toBe(false);

    const row = db.prepare(`SELECT image_path FROM amazon_products WHERE id=?`).get(id) as { image_path: string | null };
    expect(row.image_path).toBeNull();
  });

  it('DELETE /:id loescht auch zugehoeriges Bild', async () => {
    const ins = db.prepare(`INSERT INTO amazon_products (name) VALUES ('X')`).run();
    const id = Number(ins.lastInsertRowid);

    const up = await request(app).post(`/api/amazon/products/${id}/image`)
      .attach('file', makePngBuffer(), { filename: 'x.png', contentType: 'image/png' });
    const filePath = path.join(UPLOAD_DIR, up.body.image_path);

    await request(app).delete(`/api/amazon/products/${id}`);
    expect(fs.existsSync(filePath)).toBe(false);
  });
});
