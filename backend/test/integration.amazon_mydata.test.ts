import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import type Database from 'better-sqlite3';
import { createTestDb } from './setup';

process.env.JWT_SECRET = 'test-secret';
vi.mock('../src/db/connection', () => { const mod: { default: Database.Database | null } = { default: null }; return mod; });

async function makeApp(db: Database.Database) {
  const conn = await import('../src/db/connection');
  // @ts-expect-error test injection
  conn.default = db;
  const routes = (await import('../src/routes/amazon.mydata.routes')).default;
  const app = express(); app.use(express.json()); app.use('/api/amazon', routes);
  return app;
}

describe('Meine Daten — PIN', () => {
  let db: Database.Database; let app: express.Express;
  beforeEach(async () => { db = createTestDb(); app = await makeApp(db); });

  it('status -> setzen -> verifizieren', async () => {
    expect((await request(app).get('/api/amazon/my-data/status')).body.pinSet).toBe(false);
    const set = await request(app).post('/api/amazon/my-data/set-pin').send({ pin: '1234' });
    expect(set.status).toBe(200);
    expect(typeof set.body.token).toBe('string');
    expect((await request(app).get('/api/amazon/my-data/status')).body.pinSet).toBe(true);
    expect((await request(app).post('/api/amazon/my-data/verify-pin').send({ pin: '1234' })).status).toBe(200);
    expect((await request(app).post('/api/amazon/my-data/verify-pin').send({ pin: '9999' })).status).toBe(401);
  });

  it('set-pin nur einmal; zu kurzer PIN abgelehnt', async () => {
    expect((await request(app).post('/api/amazon/my-data/set-pin').send({ pin: '12' })).status).toBe(400);
    await request(app).post('/api/amazon/my-data/set-pin').send({ pin: '1234' }).expect(200);
    expect((await request(app).post('/api/amazon/my-data/set-pin').send({ pin: '5678' })).status).toBe(400);
  });

  it('change-pin mit altem PIN', async () => {
    await request(app).post('/api/amazon/my-data/set-pin').send({ pin: '1234' });
    expect((await request(app).post('/api/amazon/my-data/change-pin').send({ oldPin: 'falsch', newPin: '5678' })).status).toBe(401);
    expect((await request(app).post('/api/amazon/my-data/change-pin').send({ oldPin: '1234', newPin: '5678' })).status).toBe(200);
    expect((await request(app).post('/api/amazon/my-data/verify-pin').send({ pin: '5678' })).status).toBe(200);
  });

  it('reset-pin nur mit App-Passwort', async () => {
    const pwHash = await bcrypt.hash('app-pass', 12);
    db.prepare(`INSERT INTO user (id, username, password_hash) VALUES (1, 'benny', ?)`).run(pwHash);
    await request(app).post('/api/amazon/my-data/set-pin').send({ pin: '1234' });
    expect((await request(app).post('/api/amazon/my-data/reset-pin').send({ password: 'falsch', newPin: '5678' })).status).toBe(401);
    expect((await request(app).post('/api/amazon/my-data/reset-pin').send({ password: 'app-pass', newPin: '5678' })).status).toBe(200);
    expect((await request(app).post('/api/amazon/my-data/verify-pin').send({ pin: '5678' })).status).toBe(200);
  });
});

describe('Meine Daten — Daten (Unlock)', () => {
  let db: Database.Database; let app: express.Express;
  beforeEach(async () => { db = createTestDb(); app = await makeApp(db); });

  it('Daten ohne Unlock-Token -> 401; mit Token -> Felder vorbefuellt (seed)', async () => {
    const set = await request(app).post('/api/amazon/my-data/set-pin').send({ pin: '1234' });
    const token = set.body.token as string;
    expect((await request(app).get('/api/amazon/my-data')).status).toBe(401);
    const get = await request(app).get('/api/amazon/my-data').set('x-mydata-unlock', token);
    expect(get.status).toBe(200);
    const labels = (get.body.fields as { label: string }[]).map(f => f.label);
    expect(labels).toContain('EORI-Nummer');
    expect(labels).toContain('IBAN');
    const titles = (get.body.groups as { title: string }[]).map(g => g.title);
    expect(titles).toContain('Steuer & Zoll');
    expect(titles).toContain('Amazon-Konto');
    // EORI-Feld ist seiner Gruppe zugeordnet
    const eori = (get.body.fields as { label: string; group_id: number | null }[]).find(f => f.label === 'EORI-Nummer');
    expect(eori?.group_id).toBeTypeOf('number');
  });

  it('Feld-Label + Wert editierbar', async () => {
    const token = (await request(app).post('/api/amazon/my-data/set-pin').send({ pin: '1234' })).body.token as string;
    const auth = { 'x-mydata-unlock': token };
    const fid = (await request(app).get('/api/amazon/my-data').set(auth)).body.fields[0].id;
    await request(app).patch(`/api/amazon/my-data/custom/${fid}`).set(auth).send({ label: 'Zollkonto', value: 'DE123' }).expect(200);
    const after = await request(app).get('/api/amazon/my-data').set(auth);
    const f = (after.body.fields as { id: number; label: string; value: string }[]).find(x => x.id === fid);
    expect(f).toMatchObject({ label: 'Zollkonto', value: 'DE123' });
  });

  it('ungueltiges Unlock-Token -> 401', async () => {
    await request(app).post('/api/amazon/my-data/set-pin').send({ pin: '1234' });
    expect((await request(app).get('/api/amazon/my-data').set('x-mydata-unlock', 'kaputt')).status).toBe(401);
  });

  it('neues Feld in einer Gruppe anlegen + loeschen', async () => {
    const token = (await request(app).post('/api/amazon/my-data/set-pin').send({ pin: '1234' })).body.token as string;
    const auth = { 'x-mydata-unlock': token };
    const groups = (await request(app).get('/api/amazon/my-data').set(auth)).body.groups as { id: number; title: string }[];
    const gid = groups.find(g => g.title === 'Steuer & Zoll')!.id;
    const c = await request(app).post('/api/amazon/my-data/custom').set(auth).send({ group_id: gid });
    expect(c.status).toBe(201);
    expect(c.body.field.group_id).toBe(gid);
    const fid = c.body.field.id;
    await request(app).patch(`/api/amazon/my-data/custom/${fid}`).set(auth).send({ label: 'Zoll', value: '8501' }).expect(200);
    await request(app).delete(`/api/amazon/my-data/custom/${fid}`).set(auth).expect(204);
    const after = await request(app).get('/api/amazon/my-data').set(auth);
    expect((after.body.fields as { id: number }[]).some(f => f.id === fid)).toBe(false);
  });

  it('ungueltige group_id beim Feld-Anlegen -> 400', async () => {
    const token = (await request(app).post('/api/amazon/my-data/set-pin').send({ pin: '1234' })).body.token as string;
    const auth = { 'x-mydata-unlock': token };
    expect((await request(app).post('/api/amazon/my-data/custom').set(auth).send({ group_id: 99999 })).status).toBe(400);
  });

  it('Gruppe anlegen/umbenennen/loeschen (samt Feldern)', async () => {
    const token = (await request(app).post('/api/amazon/my-data/set-pin').send({ pin: '1234' })).body.token as string;
    const auth = { 'x-mydata-unlock': token };
    const g = await request(app).post('/api/amazon/my-data/groups').set(auth).send({});
    expect(g.status).toBe(201);
    const gid = g.body.group.id;
    await request(app).patch(`/api/amazon/my-data/groups/${gid}`).set(auth).send({ title: 'Versand' }).expect(200);
    const fid = (await request(app).post('/api/amazon/my-data/custom').set(auth).send({ group_id: gid })).body.field.id;
    const before = await request(app).get('/api/amazon/my-data').set(auth);
    expect((before.body.groups as { id: number; title: string }[]).find(x => x.id === gid)?.title).toBe('Versand');
    await request(app).delete(`/api/amazon/my-data/groups/${gid}`).set(auth).expect(204);
    const after = await request(app).get('/api/amazon/my-data').set(auth);
    expect((after.body.groups as { id: number }[]).some(x => x.id === gid)).toBe(false);
    expect((after.body.fields as { id: number }[]).some(x => x.id === fid)).toBe(false);
  });
});
