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
  const routes = (await import('../src/routes/steuer.routes')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/steuer', routes);
  return app;
}

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

describe('Steuer-Checkliste API', () => {
  let db: Database.Database; let app: express.Express;
  beforeEach(async () => { db = createTestDb(); app = await makeApp(db); });

  it('Jahre: leer -> aktuelles Jahr; nach Kategorie 2025 erscheint 2025', async () => {
    const cur = new Date().getFullYear();
    const j0 = await request(app).get('/api/steuer/jahre');
    expect(j0.status).toBe(200);
    expect(j0.body.jahre).toContain(cur);
    await request(app).post('/api/steuer/2025/categories').send({ name: 'Privat' });
    const j1 = await request(app).get('/api/steuer/jahre');
    expect(j1.body.jahre).toContain(2025);
  });

  it('Kategorie + Punkt CRUD, is_done, GET eingebettet', async () => {
    const c = await request(app).post('/api/steuer/2025/categories').send({ name: 'DJ' });
    expect(c.status).toBe(201);
    expect(c.body.category).toMatchObject({ jahr: 2025, name: 'DJ', sort_order: 1 });
    const catId = c.body.category.id;
    const it = await request(app).post(`/api/steuer/categories/${catId}/items`).send({ title: 'Rechnungen' });
    expect(it.status).toBe(201);
    const itemId = it.body.item.id;
    const upd = await request(app).patch(`/api/steuer/items/${itemId}`).send({ is_done: 1, note: '  wichtig ' });
    expect(upd.body.item).toMatchObject({ is_done: 1, note: 'wichtig' });
    expect((await request(app).patch(`/api/steuer/items/${itemId}`).send({ is_done: 2 })).status).toBe(400);
    const get = await request(app).get('/api/steuer/2025');
    expect(get.body.categories[0].items[0]).toMatchObject({ id: itemId, is_done: 1 });
  });

  it('Datei: Upload + im GET eingebettet + Loeschen; fremder Punkt 404', async () => {
    const catId = (await request(app).post('/api/steuer/2025/categories').send({ name: 'Privat' })).body.category.id;
    const itemId = (await request(app).post(`/api/steuer/categories/${catId}/items`).send({ title: 'X' })).body.item.id;
    const up = await request(app).post(`/api/steuer/items/${itemId}/files`).attach('file', PNG, { filename: 'beleg.png', contentType: 'image/png' });
    expect(up.status).toBe(201);
    const fId = up.body.file.id;
    const get = await request(app).get('/api/steuer/2025');
    expect(get.body.categories[0].items[0].files.map((f: { id: number }) => f.id)).toEqual([fId]);
    expect((await request(app).get(`/api/steuer/items/${itemId}/files/${fId}`)).status).toBe(200);
    expect((await request(app).delete(`/api/steuer/items/${itemId}/files/${fId}`)).status).toBe(204);
    expect((await request(app).post(`/api/steuer/items/999999/files`).attach('file', PNG, { filename: 'x.png', contentType: 'image/png' })).status).toBe(404);
  });

  it('Kaskaden: Kategorie loeschen entfernt Punkte + Dateien', async () => {
    const catId = (await request(app).post('/api/steuer/2025/categories').send({ name: 'Privat' })).body.category.id;
    const itemId = (await request(app).post(`/api/steuer/categories/${catId}/items`).send({ title: 'X' })).body.item.id;
    await request(app).post(`/api/steuer/items/${itemId}/files`).attach('file', PNG, { filename: 'a.png', contentType: 'image/png' });
    expect((await request(app).delete(`/api/steuer/categories/${catId}`)).status).toBe(204);
    expect((db.prepare(`SELECT COUNT(*) AS c FROM steuer_items WHERE category_id=?`).get(catId) as { c: number }).c).toBe(0);
    expect((db.prepare(`SELECT COUNT(*) AS c FROM steuer_item_files WHERE item_id=?`).get(itemId) as { c: number }).c).toBe(0);
  });

  it('Reorder Kategorien + Punkte; fremde IDs -> 400', async () => {
    const a = (await request(app).post('/api/steuer/2025/categories').send({ name: 'A' })).body.category.id;
    const b = (await request(app).post('/api/steuer/2025/categories').send({ name: 'B' })).body.category.id;
    const ro = await request(app).patch('/api/steuer/2025/categories/reorder').send({ order: [b, a] });
    expect(ro.status).toBe(200);
    expect(ro.body.categories.map((c: { id: number }) => c.id)).toEqual([b, a]);
    expect((await request(app).patch('/api/steuer/2025/categories/reorder').send({ order: [99999] })).status).toBe(400);
  });

  it('copy-year kopiert Struktur ohne Dateien; Zieljahr nicht leer -> 400', async () => {
    const catId = (await request(app).post('/api/steuer/2025/categories').send({ name: 'Privat' })).body.category.id;
    const itemId = (await request(app).post(`/api/steuer/categories/${catId}/items`).send({ title: 'Beleg' })).body.item.id;
    await request(app).patch(`/api/steuer/items/${itemId}`).send({ is_done: 1 });
    const cp = await request(app).post('/api/steuer/copy-year').send({ from_jahr: 2025, to_jahr: 2026 });
    expect(cp.status).toBe(201);
    expect(cp.body.categories).toHaveLength(1);
    expect(cp.body.categories[0].items[0]).toMatchObject({ title: 'Beleg', is_done: 0 });
    expect((await request(app).post('/api/steuer/copy-year').send({ from_jahr: 2025, to_jahr: 2026 })).status).toBe(400);
  });

  it('Export: liefert PDF fuer Punkte mit Dokumenten; leere Auswahl -> 400', async () => {
    const catId = (await request(app).post('/api/steuer/2025/categories').send({ name: 'Privat' })).body.category.id;
    const itemId = (await request(app).post(`/api/steuer/categories/${catId}/items`).send({ title: 'Beleg' })).body.item.id;
    // ohne Dokumente: 400
    const empty = await request(app).post('/api/steuer/2025/export').send({ item_ids: 'all' });
    expect(empty.status).toBe(400);
    // mit Dokument: 200 + PDF
    await request(app).post(`/api/steuer/items/${itemId}/files`).attach('file', PNG, { filename: 'beleg.png', contentType: 'image/png' });
    const all = await request(app).post('/api/steuer/2025/export').send({ item_ids: 'all' });
    expect(all.status).toBe(200);
    expect(all.headers['content-type']).toContain('application/pdf');
    const sel = await request(app).post('/api/steuer/2025/export').send({ item_ids: [itemId] });
    expect(sel.status).toBe(200);
    expect(sel.headers['content-type']).toContain('application/pdf');
    // Auswahl ohne Treffer (fremde id) -> 400
    const none = await request(app).post('/api/steuer/2025/export').send({ item_ids: [999999] });
    expect(none.status).toBe(400);
  });
});
