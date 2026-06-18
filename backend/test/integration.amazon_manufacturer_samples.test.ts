import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import type Database from 'better-sqlite3';
import { createTestDb } from './setup';

vi.mock('../src/db/connection', () => { const mod: { default: Database.Database | null } = { default: null }; return mod; });

async function makeApp(db: Database.Database) {
  const conn = await import('../src/db/connection');
  // @ts-expect-error test injection
  conn.default = db;
  const routes = (await import('../src/routes/amazon.manufacturers.routes')).default;
  const app = express(); app.use(express.json()); app.use('/api/amazon', routes);
  return app;
}
function makeProductAndManufacturer(db: Database.Database): { pid: number; mId: number } {
  db.prepare(`INSERT INTO amazon_products (name) VALUES ('P')`).run();
  const pid = Number((db.prepare(`SELECT last_insert_rowid() AS id`).get() as { id: number }).id);
  db.prepare(`INSERT INTO amazon_manufacturers (product_id, name) VALUES (?, 'M')`).run(pid);
  const mId = Number((db.prepare(`SELECT last_insert_rowid() AS id`).get() as { id: number }).id);
  return { pid, mId };
}

describe('Manufacturer Samples API', () => {
  let db: Database.Database; let app: express.Express;
  beforeEach(async () => { db = createTestDb(); app = await makeApp(db); });

  it('legt Sample an, patcht Felder, liest verschachtelt in der Hersteller-Liste', async () => {
    const { pid, mId } = makeProductAndManufacturer(db);
    const c = await request(app).post(`/api/amazon/products/${pid}/manufacturers/${mId}/samples`).send({});
    expect(c.status).toBe(201);
    const sId = c.body.sample.id;
    expect(c.body.sample.photos).toEqual([]);

    await request(app).patch(`/api/amazon/products/${pid}/manufacturers/${mId}/samples/${sId}`)
      .send({ bezeichnung: 'Charge A', rating: 4, status: 'erhalten', is_favorite: 1, kosten: '40,23', currency: 'USD', maengel: 'Stangendicke' }).expect(200);

    const list = await request(app).get(`/api/amazon/products/${pid}/manufacturers`);
    expect(list.status).toBe(200);
    const m = list.body.manufacturers.find((x: { id: number }) => x.id === mId);
    expect(m.samples).toHaveLength(1);
    expect(m.samples[0].bezeichnung).toBe('Charge A');
    expect(m.samples[0].rating).toBe(4);
    expect(m.samples[0].is_favorite).toBe(1);
    expect(m.samples[0].maengel).toBe('Stangendicke');
  });

  it('weist ungueltigen Status/Rating ab', async () => {
    const { pid, mId } = makeProductAndManufacturer(db);
    const sId = (await request(app).post(`/api/amazon/products/${pid}/manufacturers/${mId}/samples`).send({})).body.sample.id;
    await request(app).patch(`/api/amazon/products/${pid}/manufacturers/${mId}/samples/${sId}`).send({ status: 'xxx' }).expect(400);
    await request(app).patch(`/api/amazon/products/${pid}/manufacturers/${mId}/samples/${sId}`).send({ rating: 9 }).expect(400);
  });

  it('reorder setzt die Reihenfolge', async () => {
    const { pid, mId } = makeProductAndManufacturer(db);
    const a = (await request(app).post(`/api/amazon/products/${pid}/manufacturers/${mId}/samples`).send({})).body.sample.id;
    const b = (await request(app).post(`/api/amazon/products/${pid}/manufacturers/${mId}/samples`).send({})).body.sample.id;
    await request(app).patch(`/api/amazon/products/${pid}/manufacturers/${mId}/samples/reorder`).send({ order: [b, a] }).expect(200);
    const list = await request(app).get(`/api/amazon/products/${pid}/manufacturers`);
    const m = list.body.manufacturers.find((x: { id: number }) => x.id === mId);
    expect(m.samples.map((s: { id: number }) => s.id)).toEqual([b, a]);
  });

  it('loescht Sample', async () => {
    const { pid, mId } = makeProductAndManufacturer(db);
    const sId = (await request(app).post(`/api/amazon/products/${pid}/manufacturers/${mId}/samples`).send({})).body.sample.id;
    await request(app).delete(`/api/amazon/products/${pid}/manufacturers/${mId}/samples/${sId}`).expect(204);
    expect((db.prepare(`SELECT COUNT(*) AS c FROM amazon_manufacturer_samples`).get() as { c: number }).c).toBe(0);
  });

  it('laedt ein Foto zu einem Sample hoch und liefert es aus', async () => {
    const { pid, mId } = makeProductAndManufacturer(db);
    const sId = (await request(app).post(`/api/amazon/products/${pid}/manufacturers/${mId}/samples`).send({})).body.sample.id;
    const up = await request(app).post(`/api/amazon/products/${pid}/manufacturers/${mId}/samples/${sId}/photos`)
      .attach('file', Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'foto.png');
    expect(up.status).toBe(201);
    expect(up.body.photo.original_name).toBe('foto.png');
    const get = await request(app).get(`/api/amazon/products/${pid}/manufacturers/${mId}/samples/${sId}/photos/${up.body.photo.id}`);
    expect(get.status).toBe(200);
    const list = await request(app).get(`/api/amazon/products/${pid}/manufacturers`);
    const m = list.body.manufacturers.find((x: { id: number }) => x.id === mId);
    expect(m.samples[0].photos).toHaveLength(1);
  });
});
