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
  const routes = (await import('../src/routes/amazon.usp.routes')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/amazon', routes);
  return app;
}

function makeProduct(db: Database.Database, name = 'P'): number {
  db.prepare(`INSERT INTO amazon_products (name) VALUES (?)`).run(name);
  return Number((db.prepare(`SELECT last_insert_rowid() AS id`).get() as { id: number }).id);
}

describe('USP API — Meta + Punkte', () => {
  let db: Database.Database;
  let app: express.Express;
  beforeEach(async () => { db = createTestDb(); app = await makeApp(db); });

  it('GET legt Meta + Default-Hersteller lazy an', async () => {
    const pid = makeProduct(db);
    const r = await request(app).get(`/api/amazon/products/${pid}/usp`);
    expect(r.status).toBe(200);
    expect(r.body.meta).toMatchObject({ product_id: pid });
    expect(r.body.points).toEqual([]);
    expect(r.body.manufacturers).toHaveLength(1);
    expect(r.body.feasibility).toEqual([]);
  });

  it('GET zweimal dupliziert weder Meta noch Hersteller', async () => {
    const pid = makeProduct(db);
    await request(app).get(`/api/amazon/products/${pid}/usp`);
    await request(app).get(`/api/amazon/products/${pid}/usp`);
    expect((db.prepare(`SELECT COUNT(*) AS c FROM amazon_usp WHERE product_id=?`).get(pid) as { c: number }).c).toBe(1);
    expect((db.prepare(`SELECT COUNT(*) AS c FROM amazon_usp_manufacturers WHERE product_id=?`).get(pid) as { c: number }).c).toBe(1);
  });

  it('GET 404 unbekanntes Produkt', async () => {
    expect((await request(app).get('/api/amazon/products/9999/usp')).status).toBe(404);
  });

  it('PATCH Meta setzt marke/hauptfokus (Trim, Leer->null); hauptfokus>2000 -> 400', async () => {
    const pid = makeProduct(db);
    await request(app).get(`/api/amazon/products/${pid}/usp`);
    const ok = await request(app).patch(`/api/amazon/products/${pid}/usp`).send({ marke: '  Ruhekind ', hauptfokus: 'Boxspring' });
    expect(ok.status).toBe(200);
    expect(ok.body.meta).toMatchObject({ marke: 'Ruhekind', hauptfokus: 'Boxspring' });
    const bad = await request(app).patch(`/api/amazon/products/${pid}/usp`).send({ hauptfokus: 'x'.repeat(2001) });
    expect(bad.status).toBe(400);
  });

  it('POST/PATCH/DELETE Punkt + Reorder', async () => {
    const pid = makeProduct(db);
    await request(app).get(`/api/amazon/products/${pid}/usp`);
    const a = await request(app).post(`/api/amazon/products/${pid}/usp/points`).send({ title: 'A' });
    expect(a.status).toBe(201);
    expect(a.body.point).toMatchObject({ title: 'A', sort_order: 1, product_id: pid });
    expect(a.body.point.images).toEqual([]);
    const b = await request(app).post(`/api/amazon/products/${pid}/usp/points`).send({ title: 'B' });
    expect(b.body.point.sort_order).toBe(2);
    const patch = await request(app).patch(`/api/amazon/products/${pid}/usp/points/${a.body.point.id}`).send({ body: 'X' });
    expect(patch.body.point.body).toBe('X');
    const bad = await request(app).patch(`/api/amazon/products/${pid}/usp/points/${a.body.point.id}`).send({ body: 'x'.repeat(5001) });
    expect(bad.status).toBe(400);
    const ro = await request(app).patch(`/api/amazon/products/${pid}/usp/points/reorder`).send({ order: [b.body.point.id, a.body.point.id] });
    expect(ro.status).toBe(200);
    const list = await request(app).get(`/api/amazon/products/${pid}/usp`);
    expect(list.body.points.map((p: { title: string }) => p.title)).toEqual(['B', 'A']);
    const del = await request(app).delete(`/api/amazon/products/${pid}/usp/points/${a.body.point.id}`);
    expect(del.status).toBe(204);
  });

  it('Punkt Cross-Produkt -> 404; fremde Reorder-ID -> 400', async () => {
    const pA = makeProduct(db, 'A'); const pB = makeProduct(db, 'B');
    await request(app).get(`/api/amazon/products/${pA}/usp`);
    await request(app).get(`/api/amazon/products/${pB}/usp`);
    const a = await request(app).post(`/api/amazon/products/${pA}/usp/points`).send({});
    expect((await request(app).delete(`/api/amazon/products/${pB}/usp/points/${a.body.point.id}`)).status).toBe(404);
    expect((await request(app).patch(`/api/amazon/products/${pA}/usp/points/reorder`).send({ order: [99999] })).status).toBe(400);
  });

  it('Cascade: Produkt loeschen entfernt Meta + Punkte', async () => {
    const pid = makeProduct(db);
    await request(app).get(`/api/amazon/products/${pid}/usp`);
    await request(app).post(`/api/amazon/products/${pid}/usp/points`).send({});
    db.prepare(`DELETE FROM amazon_products WHERE id=?`).run(pid);
    expect((db.prepare(`SELECT COUNT(*) AS c FROM amazon_usp WHERE product_id=?`).get(pid) as { c: number }).c).toBe(0);
    expect((db.prepare(`SELECT COUNT(*) AS c FROM amazon_usp_points WHERE product_id=?`).get(pid) as { c: number }).c).toBe(0);
  });
});

describe('USP API — Punkt-Bilder', () => {
  let db: Database.Database; let app: express.Express;
  beforeEach(async () => { db = createTestDb(); app = await makeApp(db); });
  const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  async function makePoint(pid: number): Promise<number> {
    const a = await request(app).post(`/api/amazon/products/${pid}/usp/points`).send({});
    return a.body.point.id;
  }
  it('Upload + GET Datei', async () => {
    const pid = makeProduct(db); await request(app).get(`/api/amazon/products/${pid}/usp`);
    const point = await makePoint(pid);
    const up = await request(app).post(`/api/amazon/products/${pid}/usp/points/${point}/images`).attach('file', PNG, { filename: 'a.png', contentType: 'image/png' });
    expect(up.status).toBe(201);
    expect(up.body.image).toMatchObject({ point_id: point, sort_order: 1 });
    const get = await request(app).get(`/api/amazon/products/${pid}/usp/images/${up.body.image.id}`);
    expect(get.status).toBe(200);
    expect(get.headers['content-type']).toContain('image/png');
  });
  it('Reorder + Delete + Cascade', async () => {
    const pid = makeProduct(db); await request(app).get(`/api/amazon/products/${pid}/usp`);
    const point = await makePoint(pid);
    const a = await request(app).post(`/api/amazon/products/${pid}/usp/points/${point}/images`).attach('file', PNG, { filename: 'a.png', contentType: 'image/png' });
    const b = await request(app).post(`/api/amazon/products/${pid}/usp/points/${point}/images`).attach('file', PNG, { filename: 'b.png', contentType: 'image/png' });
    const ro = await request(app).patch(`/api/amazon/products/${pid}/usp/points/${point}/images/reorder`).send({ order: [b.body.image.id, a.body.image.id] });
    expect(ro.status).toBe(200);
    const list = await request(app).get(`/api/amazon/products/${pid}/usp`);
    expect(list.body.points[0].images.map((i: { id: number }) => i.id)).toEqual([b.body.image.id, a.body.image.id]);
    const del = await request(app).delete(`/api/amazon/products/${pid}/usp/points/${point}/images/${a.body.image.id}`);
    expect(del.status).toBe(204);
    await request(app).delete(`/api/amazon/products/${pid}/usp/points/${point}`);
    expect((db.prepare(`SELECT COUNT(*) AS c FROM amazon_usp_point_images WHERE id=?`).get(b.body.image.id) as { c: number }).c).toBe(0);
  });
});
