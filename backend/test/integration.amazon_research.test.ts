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
  const routes = (await import('../src/routes/amazon.research.routes')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/amazon', routes);
  return app;
}

function makeProduct(db: Database.Database, name = 'P'): number {
  db.prepare(`INSERT INTO amazon_products (name) VALUES (?)`).run(name);
  return Number((db.prepare(`SELECT last_insert_rowid() AS id`).get() as { id: number }).id);
}

describe('Research API — Themen/Karten/Links', () => {
  let db: Database.Database;
  let app: express.Express;
  beforeEach(async () => { db = createTestDb(); app = await makeApp(db); });

  it('legt Thema, Karte und Link an und liest sie verschachtelt', async () => {
    const pid = makeProduct(db);

    const t = await request(app).post(`/api/amazon/products/${pid}/research/topics`).send({ title: 'Patente' });
    expect(t.status).toBe(201);
    const topicId = t.body.topic.id;
    expect(t.body.topic.cards).toEqual([]);

    const c = await request(app).post(`/api/amazon/products/${pid}/research/topics/${topicId}/cards`).send({});
    expect(c.status).toBe(201);
    const cardId = c.body.card.id;

    await request(app).patch(`/api/amazon/products/${pid}/research/cards/${cardId}`)
      .send({ title: 'Konkurrent X', body: 'Designschutz seit 2022' }).expect(200);

    const l = await request(app).post(`/api/amazon/products/${pid}/research/cards/${cardId}/links`)
      .send({ url: 'https://dpma.de/12345', label: 'DPMA' });
    expect(l.status).toBe(201);

    const list = await request(app).get(`/api/amazon/products/${pid}/research/topics`);
    expect(list.status).toBe(200);
    expect(list.body.topics).toHaveLength(1);
    expect(list.body.topics[0].title).toBe('Patente');
    expect(list.body.topics[0].cards[0].title).toBe('Konkurrent X');
    expect(list.body.topics[0].cards[0].body).toBe('Designschutz seit 2022');
    expect(list.body.topics[0].cards[0].links[0].label).toBe('DPMA');
  });

  it('GET 404 bei unbekanntem Produkt', async () => {
    expect((await request(app).get('/api/amazon/products/9999/research/topics')).status).toBe(404);
  });

  it('Titel optional: Karte ohne Titel speichert null', async () => {
    const pid = makeProduct(db);
    const t = await request(app).post(`/api/amazon/products/${pid}/research/topics`).send({ title: 'Notizen' });
    const cardId = (await request(app).post(`/api/amazon/products/${pid}/research/topics/${t.body.topic.id}/cards`).send({})).body.card.id;
    await request(app).patch(`/api/amazon/products/${pid}/research/cards/${cardId}`).send({ title: null, body: '• Keyword A\n• Keyword B' }).expect(200);
    const list = await request(app).get(`/api/amazon/products/${pid}/research/topics`);
    expect(list.body.topics[0].cards[0].title).toBeNull();
  });

  it('löscht ein Thema samt Karten und Links', async () => {
    const pid = makeProduct(db);
    const topicId = (await request(app).post(`/api/amazon/products/${pid}/research/topics`).send({ title: 'X' })).body.topic.id;
    const cardId = (await request(app).post(`/api/amazon/products/${pid}/research/topics/${topicId}/cards`).send({})).body.card.id;
    await request(app).post(`/api/amazon/products/${pid}/research/cards/${cardId}/links`).send({ url: 'https://a.b' });
    await request(app).delete(`/api/amazon/products/${pid}/research/topics/${topicId}`).expect(204);
    const list = await request(app).get(`/api/amazon/products/${pid}/research/topics`);
    expect(list.body.topics).toEqual([]);
    expect((db.prepare(`SELECT COUNT(*) AS c FROM amazon_research_cards`).get() as { c: number }).c).toBe(0);
    expect((db.prepare(`SELECT COUNT(*) AS c FROM amazon_research_card_links`).get() as { c: number }).c).toBe(0);
  });

  it('lädt ein Bild zu einer Karte hoch und liefert es aus', async () => {
    const pid = makeProduct(db);
    const topicId = (await request(app).post(`/api/amazon/products/${pid}/research/topics`).send({ title: 'Zertifikate' })).body.topic.id;
    const cardId = (await request(app).post(`/api/amazon/products/${pid}/research/topics/${topicId}/cards`).send({})).body.card.id;
    const up = await request(app).post(`/api/amazon/products/${pid}/research/cards/${cardId}/images`)
      .attach('file', Buffer.from([0x89, 0x50, 0x4e, 0x47]), 'test.png');
    expect(up.status).toBe(201);
    expect(up.body.image.original_name).toBe('test.png');
    const get = await request(app).get(`/api/amazon/products/${pid}/research/images/${up.body.image.id}`);
    expect(get.status).toBe(200);
  });

  it('Themen-Reorder setzt sort_order', async () => {
    const pid = makeProduct(db);
    const a = (await request(app).post(`/api/amazon/products/${pid}/research/topics`).send({ title: 'A' })).body.topic.id;
    const b = (await request(app).post(`/api/amazon/products/${pid}/research/topics`).send({ title: 'B' })).body.topic.id;
    await request(app).post(`/api/amazon/products/${pid}/research/topics/reorder`).send({ order: [b, a] }).expect(204);
    const list = await request(app).get(`/api/amazon/products/${pid}/research/topics`);
    expect(list.body.topics.map((t: { title: string }) => t.title)).toEqual(['B', 'A']);
  });
});
