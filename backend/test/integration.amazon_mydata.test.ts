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

  it('Daten-Route ohne Unlock-Token -> 401; mit Token -> ok, pin_hash nie geliefert', async () => {
    const set = await request(app).post('/api/amazon/my-data/set-pin').send({ pin: '1234' });
    const token = set.body.token as string;
    expect((await request(app).get('/api/amazon/my-data')).status).toBe(401);
    const get = await request(app).get('/api/amazon/my-data').set('x-mydata-unlock', token);
    expect(get.status).toBe(200);
    expect((get.body.data as Record<string, unknown>).pin_hash).toBeUndefined();
    await request(app).patch('/api/amazon/my-data').set('x-mydata-unlock', token).send({ eori: 'DE123', iban: 'DE0012' }).expect(200);
    const after = await request(app).get('/api/amazon/my-data').set('x-mydata-unlock', token);
    expect(after.body.data.eori).toBe('DE123');
    expect(after.body.data.iban).toBe('DE0012');
  });

  it('ungueltiges Unlock-Token -> 401', async () => {
    await request(app).post('/api/amazon/my-data/set-pin').send({ pin: '1234' });
    expect((await request(app).get('/api/amazon/my-data').set('x-mydata-unlock', 'kaputt')).status).toBe(401);
  });

  it('eigene Felder anlegen/patchen/loeschen', async () => {
    const token = (await request(app).post('/api/amazon/my-data/set-pin').send({ pin: '1234' })).body.token as string;
    const auth = { 'x-mydata-unlock': token };
    const c = await request(app).post('/api/amazon/my-data/custom').set(auth).send({});
    expect(c.status).toBe(201);
    const fid = c.body.field.id;
    await request(app).patch(`/api/amazon/my-data/custom/${fid}`).set(auth).send({ label: 'Kundennr.', value: 'A-42' }).expect(200);
    const list = await request(app).get('/api/amazon/my-data').set(auth);
    expect(list.body.custom[0]).toMatchObject({ label: 'Kundennr.', value: 'A-42' });
    await request(app).delete(`/api/amazon/my-data/custom/${fid}`).set(auth).expect(204);
    const empty = await request(app).get('/api/amazon/my-data').set(auth);
    expect(empty.body.custom).toEqual([]);
  });
});
