# Amazon „Meine Daten" — Implementierungs-Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PIN-geschützter Stammdaten-Bereich „Meine Daten" unter Amazon (EORI, Bank, Firma, Amazon-Konto + eigene Felder), server-seitig per PIN entsperrt.

**Architecture:** Single-Row-Tabelle (id=1) für feste Felder + PIN-Hash, plus Custom-Felder-Tabelle. Express-Router mit bcrypt-PIN (12 Runden) und kurzlebigem Unlock-JWT (`purpose: 'mydata'`, 60 Min); Daten-Routen hinter Unlock-Middleware. Frontend: PIN-Gate-Seite + Formular, Unlock-Token im Zustand-Store, per Interceptor als `x-mydata-unlock`-Header gesendet.

**Tech Stack:** Express 5, better-sqlite3, jsonwebtoken, bcryptjs, React 19, TanStack Query, Zustand.

**Branch:** `feature/amazon-meine-daten` (aktiv, enthält bereits `main`). Migration: **088**.

---

## Dateien-Übersicht

**Backend:**
- Create: `backend/src/db/migrations/088_amazon_my_data.sql`
- Create: `backend/src/routes/amazon.mydata.routes.ts` (PIN + Daten + Unlock-Middleware)
- Modify: `backend/src/app.ts` (Router mounten)
- Create: `backend/test/integration.amazon_mydata.test.ts`

**Frontend:**
- Modify: `frontend/src/store/authStore.ts` (pinGateToken)
- Modify: `frontend/src/api/client.ts` (x-mydata-unlock Header)
- Modify: `frontend/src/api/amazon.api.ts` (Typen + Funktionen)
- Create: `frontend/src/pages/amazon/AmazonMyDataPage.tsx`
- Modify: `frontend/src/components/layout/navConfig.ts` (Sidebar + pageNames)
- Modify: `frontend/src/routes/routes.tsx` (Route)

---

## Task 1: Migration 088 — Tabellen

**Files:** Create `backend/src/db/migrations/088_amazon_my_data.sql`

- [ ] **Step 1: Migration schreiben**

```sql
-- Persönliche/geschäftliche Stammdaten (Single-Row, id=1) + PIN-Hash
CREATE TABLE amazon_my_data (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  pin_hash       TEXT,
  eori           TEXT,
  vat_id         TEXT,
  tax_number     TEXT,
  finanzamt      TEXT,
  bank_holder    TEXT,
  iban           TEXT,
  bic            TEXT,
  bank_name      TEXT,
  name           TEXT,
  firma          TEXT,
  adresse        TEXT,
  email          TEXT,
  telefon        TEXT,
  webseite       TEXT,
  amazon_email   TEXT,
  amazon_store   TEXT,
  merchant_token TEXT,
  updated_at     INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE amazon_my_data_custom (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  label       TEXT    NOT NULL DEFAULT '',
  value       TEXT    NOT NULL DEFAULT '',
  created_at  INTEGER NOT NULL DEFAULT (unixepoch())
);
```

Kein `PRAGMA foreign_keys`. Zeile `id=1` wird lazy im Router angelegt.

- [ ] **Step 2: Verifizieren** (Backend-Neustart durch Benny / über Supervisor):
`sqlite3 ~/.local/share/benny-dashboard/dashboard.db "SELECT name FROM sqlite_master WHERE name LIKE 'amazon_my_data%';"`
Expected: `amazon_my_data`, `amazon_my_data_custom`.

- [ ] **Step 3: Commit**
```bash
git add backend/src/db/migrations/088_amazon_my_data.sql
git commit -m "feat(amazon-mydata): Migration 088 — Stammdaten + Custom-Felder"
```

---

## Task 2: Backend — PIN-Routen + Unlock-Middleware

**Files:** Create `backend/src/routes/amazon.mydata.routes.ts`; Test `backend/test/integration.amazon_mydata.test.ts`

Muster: `auth.routes.ts` (jwt.sign + bcrypt.compare), `user.routes.ts` (bcrypt.hash 12). DB-Import `import db from '../db/connection'`.

- [ ] **Step 1: Router-Grundgerüst + Helfer + PIN-Routen**

```ts
import { Router, type Request, type Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import db from '../db/connection';

const router = Router();

interface MyDataRow {
  id: number; pin_hash: string | null;
  eori: string | null; vat_id: string | null; tax_number: string | null; finanzamt: string | null;
  bank_holder: string | null; iban: string | null; bic: string | null; bank_name: string | null;
  name: string | null; firma: string | null; adresse: string | null; email: string | null; telefon: string | null; webseite: string | null;
  amazon_email: string | null; amazon_store: string | null; merchant_token: string | null;
  updated_at: number;
}
interface CustomRow { id: number; sort_order: number; label: string; value: string; created_at: number; }

// Felder, die per PATCH editierbar sind
const EDITABLE_FIELDS = [
  'eori', 'vat_id', 'tax_number', 'finanzamt',
  'bank_holder', 'iban', 'bic', 'bank_name',
  'name', 'firma', 'adresse', 'email', 'telefon', 'webseite',
  'amazon_email', 'amazon_store', 'merchant_token',
] as const;

function getRow(): MyDataRow {
  let row = db.prepare(`SELECT * FROM amazon_my_data WHERE id = 1`).get() as MyDataRow | undefined;
  if (!row) {
    db.prepare(`INSERT INTO amazon_my_data (id) VALUES (1)`).run();
    row = db.prepare(`SELECT * FROM amazon_my_data WHERE id = 1`).get() as MyDataRow;
  }
  return row;
}
function publicFields(row: MyDataRow) {
  const { id: _id, pin_hash: _pin, ...rest } = row;
  return rest; // ohne pin_hash
}

// ── Unlock-Middleware ──
export function requireMyDataUnlock(req: Request, res: Response, next: () => void): void {
  const token = req.headers['x-mydata-unlock'];
  if (typeof token !== 'string') { res.status(401).json({ error: 'locked', code: 'MYDATA_LOCKED' }); return; }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET as string, { algorithms: ['HS256'] }) as jwt.JwtPayload;
    if (payload.purpose !== 'mydata') { res.status(401).json({ error: 'locked', code: 'MYDATA_LOCKED' }); return; }
    next();
  } catch {
    res.status(401).json({ error: 'locked', code: 'MYDATA_LOCKED' });
  }
}
function issueUnlockToken(): string {
  return jwt.sign({ purpose: 'mydata' }, process.env.JWT_SECRET as string, { algorithm: 'HS256', expiresIn: '60m' });
}
function isValidPin(pin: unknown): pin is string {
  return typeof pin === 'string' && pin.length >= 4 && pin.length <= 100;
}

// ── PIN-Routen ──
router.get('/my-data/status', (_req: Request, res: Response) => {
  const row = getRow();
  res.json({ pinSet: !!row.pin_hash });
});

router.post('/my-data/set-pin', async (req: Request, res: Response) => {
  const row = getRow();
  if (row.pin_hash) { res.status(400).json({ error: 'pin already set' }); return; }
  const pin = (req.body ?? {}).pin;
  if (!isValidPin(pin)) { res.status(400).json({ error: 'pin invalid (min 4 Zeichen)' }); return; }
  const hash = await bcrypt.hash(pin, 12);
  db.prepare(`UPDATE amazon_my_data SET pin_hash = ?, updated_at = unixepoch() WHERE id = 1`).run(hash);
  res.json({ token: issueUnlockToken() });
});

router.post('/my-data/verify-pin', async (req: Request, res: Response) => {
  const row = getRow();
  const pin = (req.body ?? {}).pin;
  const dummy = '$2b$12$CwTycUXWue0Thq9StjUM0uJ8.m8yq9W/xWc9Cg3aB8fQaN8g6q6Dq';
  const ok = await bcrypt.compare(typeof pin === 'string' ? pin : '', row.pin_hash ?? dummy);
  if (!row.pin_hash || !ok) { res.status(401).json({ error: 'wrong pin' }); return; }
  res.json({ token: issueUnlockToken() });
});

router.post('/my-data/change-pin', async (req: Request, res: Response) => {
  const row = getRow();
  const { oldPin, newPin } = (req.body ?? {}) as { oldPin?: unknown; newPin?: unknown };
  if (!row.pin_hash) { res.status(400).json({ error: 'no pin set' }); return; }
  const ok = await bcrypt.compare(typeof oldPin === 'string' ? oldPin : '', row.pin_hash);
  if (!ok) { res.status(401).json({ error: 'wrong pin' }); return; }
  if (!isValidPin(newPin)) { res.status(400).json({ error: 'pin invalid' }); return; }
  const hash = await bcrypt.hash(newPin, 12);
  db.prepare(`UPDATE amazon_my_data SET pin_hash = ?, updated_at = unixepoch() WHERE id = 1`).run(hash);
  res.json({ token: issueUnlockToken() });
});

router.post('/my-data/reset-pin', async (req: Request, res: Response) => {
  const { password, newPin } = (req.body ?? {}) as { password?: unknown; newPin?: unknown };
  const user = db.prepare(`SELECT password_hash FROM user WHERE id = 1`).get() as { password_hash: string } | undefined;
  const dummy = '$2b$12$CwTycUXWue0Thq9StjUM0uJ8.m8yq9W/xWc9Cg3aB8fQaN8g6q6Dq';
  const ok = await bcrypt.compare(typeof password === 'string' ? password : '', user?.password_hash ?? dummy);
  if (!user || !ok) { res.status(401).json({ error: 'wrong password' }); return; }
  if (!isValidPin(newPin)) { res.status(400).json({ error: 'pin invalid' }); return; }
  getRow();
  const hash = await bcrypt.hash(newPin, 12);
  db.prepare(`UPDATE amazon_my_data SET pin_hash = ?, updated_at = unixepoch() WHERE id = 1`).run(hash);
  res.json({ token: issueUnlockToken() });
});

export default router;
```

- [ ] **Step 2: Test (PIN-Flow)** `backend/test/integration.amazon_mydata.test.ts`

Setup wie andere Integrationstests (createTestDb + Connection-Mock). Wichtig: `process.env.JWT_SECRET` im Test setzen. Außerdem den User (id=1) anlegen für reset-pin-Test.
```ts
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

  it('reset-pin nur mit App-Passwort', async () => {
    const pwHash = await bcrypt.hash('app-pass', 12);
    db.prepare(`INSERT INTO user (id, username, password_hash) VALUES (1, 'benny', ?)`).run(pwHash);
    await request(app).post('/api/amazon/my-data/set-pin').send({ pin: '1234' });
    expect((await request(app).post('/api/amazon/my-data/reset-pin').send({ password: 'falsch', newPin: '5678' })).status).toBe(401);
    expect((await request(app).post('/api/amazon/my-data/reset-pin').send({ password: 'app-pass', newPin: '5678' })).status).toBe(200);
    expect((await request(app).post('/api/amazon/my-data/verify-pin').send({ pin: '5678' })).status).toBe(200);
  });
});
```

- [ ] **Step 3: Test laufen lassen** `npm --prefix backend test -- integration.amazon_mydata` → PASS (PIN-Tests).

- [ ] **Step 4: Commit**
```bash
git add backend/src/routes/amazon.mydata.routes.ts backend/test/integration.amazon_mydata.test.ts
git commit -m "feat(amazon-mydata): PIN-Routen (set/verify/change/reset) + Unlock-Middleware + Tests"
```

---

## Task 3: Backend — Daten-Routen (hinter Unlock)

**Files:** Modify `backend/src/routes/amazon.mydata.routes.ts`

- [ ] **Step 1: Daten- + Custom-Routen ergänzen** (vor `export default router`)

```ts
// ── Daten (verlangen Unlock) ──
router.get('/my-data', requireMyDataUnlock, (_req: Request, res: Response) => {
  const row = getRow();
  const custom = db.prepare(`SELECT * FROM amazon_my_data_custom ORDER BY sort_order, id`).all() as CustomRow[];
  res.json({ data: publicFields(row), custom });
});

router.patch('/my-data', requireMyDataUnlock, (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const sets: string[] = []; const vals: unknown[] = [];
  for (const field of EDITABLE_FIELDS) {
    if (field in body) {
      const v = body[field];
      if (v !== null && typeof v !== 'string') { res.status(400).json({ error: `invalid ${field}` }); return; }
      sets.push(`${field} = ?`); vals.push(v === null ? null : (v as string).slice(0, 1000));
    }
  }
  getRow();
  if (sets.length === 0) { res.json({ data: publicFields(getRow()) }); return; }
  sets.push('updated_at = unixepoch()');
  db.prepare(`UPDATE amazon_my_data SET ${sets.join(', ')} WHERE id = 1`).run(...vals);
  res.json({ data: publicFields(getRow()) });
});

router.post('/my-data/custom', requireMyDataUnlock, (_req: Request, res: Response) => {
  const maxOrder = (db.prepare(`SELECT COALESCE(MAX(sort_order),0) AS m FROM amazon_my_data_custom`).get() as { m: number }).m;
  const r = db.prepare(`INSERT INTO amazon_my_data_custom (sort_order) VALUES (?)`).run(maxOrder + 1);
  res.status(201).json({ field: db.prepare(`SELECT * FROM amazon_my_data_custom WHERE id = ?`).get(r.lastInsertRowid) as CustomRow });
});

router.patch('/my-data/custom/:id', requireMyDataUnlock, (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(404).json({ error: 'not found' }); return; }
  const exists = db.prepare(`SELECT 1 FROM amazon_my_data_custom WHERE id = ?`).get(id);
  if (!exists) { res.status(404).json({ error: 'not found' }); return; }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const sets: string[] = []; const vals: unknown[] = [];
  for (const field of ['label', 'value'] as const) {
    if (field in body) {
      if (typeof body[field] !== 'string') { res.status(400).json({ error: `invalid ${field}` }); return; }
      sets.push(`${field} = ?`); vals.push((body[field] as string).slice(0, 1000));
    }
  }
  if (sets.length === 0) { res.json({ field: db.prepare(`SELECT * FROM amazon_my_data_custom WHERE id = ?`).get(id) as CustomRow }); return; }
  db.prepare(`UPDATE amazon_my_data_custom SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
  res.json({ field: db.prepare(`SELECT * FROM amazon_my_data_custom WHERE id = ?`).get(id) as CustomRow });
});

router.delete('/my-data/custom/:id', requireMyDataUnlock, (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(404).json({ error: 'not found' }); return; }
  db.prepare(`DELETE FROM amazon_my_data_custom WHERE id = ?`).run(id);
  res.status(204).end();
});

router.post('/my-data/custom/reorder', requireMyDataUnlock, (req: Request, res: Response) => {
  const order = (req.body as { order?: unknown })?.order;
  if (!Array.isArray(order) || order.some(x => !Number.isInteger(x))) { res.status(400).json({ error: 'invalid order' }); return; }
  const upd = db.prepare(`UPDATE amazon_my_data_custom SET sort_order = ? WHERE id = ?`);
  db.transaction(() => { order.forEach((cid: number, idx: number) => upd.run(idx + 1, cid)); })();
  res.status(204).end();
});
```

- [ ] **Step 2: Test (Unlock-Schutz + Daten)** — im selben Test-File ergänzen
```ts
  it('Daten-Route ohne Unlock-Token -> 401; mit Token -> ok', async () => {
    const set = await request(app).post('/api/amazon/my-data/set-pin').send({ pin: '1234' });
    const token = set.body.token as string;
    expect((await request(app).get('/api/amazon/my-data')).status).toBe(401);
    const get = await request(app).get('/api/amazon/my-data').set('x-mydata-unlock', token);
    expect(get.status).toBe(200);
    expect(get.body.data.pin_hash).toBeUndefined(); // pin_hash nie ausgeliefert
    await request(app).patch('/api/amazon/my-data').set('x-mydata-unlock', token).send({ eori: 'DE123', iban: 'DE0012' }).expect(200);
    const after = await request(app).get('/api/amazon/my-data').set('x-mydata-unlock', token);
    expect(after.body.data.eori).toBe('DE123');
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
  });
```

- [ ] **Step 3: Tests grün** `npm --prefix backend test -- integration.amazon_mydata` + `npm --prefix backend run typecheck` → Exit 0.

- [ ] **Step 4: Commit**
```bash
git add backend/src/routes/amazon.mydata.routes.ts backend/test/integration.amazon_mydata.test.ts
git commit -m "feat(amazon-mydata): Daten- + Custom-Routen hinter Unlock + Tests"
```

---

## Task 4: Router in app.ts mounten

**Files:** Modify `backend/src/app.ts`

- [ ] **Step 1: Import + Mount** (bei den anderen amazon-Mounts, nach `amazonResearchRoutes`)

Import (nach `import amazonResearchRoutes ...`):
```ts
import amazonMyDataRoutes from './routes/amazon.mydata.routes';
```
Mount (nach `app.use('/api/amazon', amazonResearchRoutes);`):
```ts
  app.use('/api/amazon', amazonMyDataRoutes);
```

- [ ] **Step 2: Typecheck + Commit** `npm --prefix backend run typecheck` → 0.
```bash
git add backend/src/app.ts
git commit -m "feat(amazon-mydata): Router mounten"
```

---

## Task 5: Frontend — authStore + apiClient-Header

**Files:** Modify `frontend/src/store/authStore.ts`, `frontend/src/api/client.ts`

- [ ] **Step 1: authStore um pinGateToken erweitern** — der Token ist NICHT persistiert (nur im Speicher), damit nach Reload wieder gesperrt. Da der Store mit `persist` läuft, das Feld über `partialize` von der Persistenz ausschließen.

`authStore.ts` neu:
```ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface AuthState {
  token: string | null;
  pinGateToken: string | null;
  login: (token: string) => void;
  logout: () => void;
  setPinGateToken: (t: string | null) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      pinGateToken: null,
      login: (token) => set({ token }),
      logout: () => set({ token: null, pinGateToken: null }),
      setPinGateToken: (t) => set({ pinGateToken: t }),
    }),
    {
      name: 'benny-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ token: state.token }), // pinGateToken NICHT persistieren
    }
  )
);
```

- [ ] **Step 2: apiClient-Interceptor um Header erweitern** (`client.ts`, im Request-Interceptor nach dem Bearer-Token):
```ts
  const pinGateToken = useAuthStore.getState().pinGateToken;
  if (pinGateToken) {
    config.headers['x-mydata-unlock'] = pinGateToken;
  }
```

- [ ] **Step 3: Typecheck + Commit** `npm --prefix frontend run typecheck` → 0.
```bash
git add frontend/src/store/authStore.ts frontend/src/api/client.ts
git commit -m "feat(amazon-mydata): pinGateToken im Store + x-mydata-unlock Header"
```

---

## Task 6: Frontend — API-Funktionen

**Files:** Modify `frontend/src/api/amazon.api.ts` (am Ende ergänzen)

- [ ] **Step 1: Typen + Funktionen**
```ts
// ── Meine Daten (Stammdaten + PIN) ──
export interface MyDataFields {
  eori: string | null; vat_id: string | null; tax_number: string | null; finanzamt: string | null;
  bank_holder: string | null; iban: string | null; bic: string | null; bank_name: string | null;
  name: string | null; firma: string | null; adresse: string | null; email: string | null; telefon: string | null; webseite: string | null;
  amazon_email: string | null; amazon_store: string | null; merchant_token: string | null;
  updated_at: number;
}
export interface MyDataCustom { id: number; sort_order: number; label: string; value: string; created_at: number; }
export type MyDataPatch = Partial<Omit<MyDataFields, 'updated_at'>>;

export async function fetchMyDataStatus(): Promise<{ pinSet: boolean }> {
  return (await apiClient.get('/amazon/my-data/status')).data as { pinSet: boolean };
}
export async function setMyDataPin(pin: string): Promise<{ token: string }> {
  return (await apiClient.post('/amazon/my-data/set-pin', { pin })).data as { token: string };
}
export async function verifyMyDataPin(pin: string): Promise<{ token: string }> {
  return (await apiClient.post('/amazon/my-data/verify-pin', { pin })).data as { token: string };
}
export async function changeMyDataPin(oldPin: string, newPin: string): Promise<{ token: string }> {
  return (await apiClient.post('/amazon/my-data/change-pin', { oldPin, newPin })).data as { token: string };
}
export async function resetMyDataPin(password: string, newPin: string): Promise<{ token: string }> {
  return (await apiClient.post('/amazon/my-data/reset-pin', { password, newPin })).data as { token: string };
}
export async function fetchMyData(): Promise<{ data: MyDataFields; custom: MyDataCustom[] }> {
  return (await apiClient.get('/amazon/my-data')).data as { data: MyDataFields; custom: MyDataCustom[] };
}
export async function updateMyData(patch: MyDataPatch): Promise<{ data: MyDataFields }> {
  return (await apiClient.patch('/amazon/my-data', patch)).data as { data: MyDataFields };
}
export async function createMyDataCustom(): Promise<MyDataCustom> {
  return ((await apiClient.post('/amazon/my-data/custom', {})).data as { field: MyDataCustom }).field;
}
export async function updateMyDataCustom(id: number, patch: Partial<Pick<MyDataCustom, 'label' | 'value'>>): Promise<MyDataCustom> {
  return ((await apiClient.patch(`/amazon/my-data/custom/${id}`, patch)).data as { field: MyDataCustom }).field;
}
export async function deleteMyDataCustom(id: number): Promise<void> {
  await apiClient.delete(`/amazon/my-data/custom/${id}`);
}
```

- [ ] **Step 2: Typecheck + Commit**
```bash
git add frontend/src/api/amazon.api.ts
git commit -m "feat(amazon-mydata): Frontend-API + Typen"
```

---

## Task 7: Frontend — AmazonMyDataPage (PIN-Gate + Formular)

**Files:** Create `frontend/src/pages/amazon/AmazonMyDataPage.tsx`

Eigenständige Seite; nutzt `PageWrapper`. Zustand: lädt Status; zeigt PIN-Gate (setzen/eingeben/vergessen) ODER — bei vorhandenem `pinGateToken` — das Formular. Daten über TanStack Query (Query enabled nur wenn entsperrt). Felder-Gruppen mit Auto-Save on blur + Copy-Button; Eigene-Felder-Liste; „PIN ändern".

- [ ] **Step 1: Komponente schreiben**

```tsx
import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { useAuthStore } from '../../store/authStore';
import {
  fetchMyDataStatus, setMyDataPin, verifyMyDataPin, changeMyDataPin, resetMyDataPin,
  fetchMyData, updateMyData, createMyDataCustom, updateMyDataCustom, deleteMyDataCustom,
  type MyDataFields, type MyDataCustom, type MyDataPatch,
} from '../../api/amazon.api';

const INPUT_STYLE: React.CSSProperties = {
  background: 'var(--color-surface-container-low)', color: 'var(--color-on-surface)', border: '1px solid rgba(255,255,255,0.08)',
};

const GROUPS: { title: string; fields: { key: keyof MyDataPatch; label: string }[] }[] = [
  { title: 'Steuer & Zoll', fields: [
    { key: 'eori', label: 'EORI-Nummer' }, { key: 'vat_id', label: 'USt-IdNr' },
    { key: 'tax_number', label: 'Steuernummer' }, { key: 'finanzamt', label: 'Finanzamt' } ] },
  { title: 'Bankverbindung', fields: [
    { key: 'bank_holder', label: 'Kontoinhaber' }, { key: 'iban', label: 'IBAN' },
    { key: 'bic', label: 'BIC' }, { key: 'bank_name', label: 'Bank' } ] },
  { title: 'Firma & Kontakt', fields: [
    { key: 'name', label: 'Name' }, { key: 'firma', label: 'Firma' }, { key: 'adresse', label: 'Adresse' },
    { key: 'email', label: 'E-Mail' }, { key: 'telefon', label: 'Telefon' }, { key: 'webseite', label: 'Webseite' } ] },
  { title: 'Amazon-Konto', fields: [
    { key: 'amazon_email', label: 'Seller-E-Mail' }, { key: 'amazon_store', label: 'Store-Name' },
    { key: 'merchant_token', label: 'Merchant-Token' } ] },
];

function CopyBtn({ value }: { value: string | null }) {
  const [done, setDone] = useState(false);
  if (!value) return null;
  return (
    <button type="button" title="Kopieren" onClick={() => { navigator.clipboard.writeText(value).then(() => { setDone(true); setTimeout(() => setDone(false), 1200); }); }}
      className="p-1 rounded hover:bg-white/5 flex-shrink-0" style={{ color: done ? 'var(--color-secondary)' : 'var(--color-on-surface-variant)' }}>
      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{done ? 'check' : 'content_copy'}</span>
    </button>
  );
}

function Field({ label, value, onSave }: { label: string; value: string | null; onSave: (v: string) => void }) {
  const [v, setV] = useState(value ?? '');
  useEffect(() => { setV(value ?? ''); }, [value]);
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs w-32 flex-shrink-0" style={{ color: 'var(--color-on-surface-variant)' }}>{label}</span>
      <input value={v} onChange={(e) => setV(e.target.value)} onBlur={() => { if (v !== (value ?? '')) onSave(v); }}
        className="flex-1 px-2 py-1 rounded text-sm" style={INPUT_STYLE} autoComplete="off" />
      <CopyBtn value={value} />
    </div>
  );
}

function PinGate({ pinSet, onUnlocked }: { pinSet: boolean; onUnlocked: (token: string) => void }) {
  const [pin, setPin] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [forgot, setForgot] = useState(false);
  const [pw, setPw] = useState(''); const [newPin, setNewPin] = useState('');

  async function submit() {
    setErr(null);
    try {
      const r = pinSet ? await verifyMyDataPin(pin) : await setMyDataPin(pin);
      onUnlocked(r.token);
    } catch { setErr(pinSet ? 'Falscher PIN.' : 'PIN muss mind. 4 Zeichen haben.'); }
  }
  async function reset() {
    setErr(null);
    try { const r = await resetMyDataPin(pw, newPin); onUnlocked(r.token); }
    catch { setErr('App-Passwort falsch oder PIN zu kurz.'); }
  }

  return (
    <div className="max-w-sm mx-auto mt-10 rounded-xl p-6 flex flex-col gap-3"
      style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined" style={{ color: 'var(--color-primary)' }}>lock</span>
        <h2 className="font-semibold" style={{ color: 'var(--color-on-surface)' }}>{pinSet ? 'Bereich entsperren' : 'PIN festlegen'}</h2>
      </div>
      {!forgot ? (
        <>
          <input type="password" value={pin} onChange={(e) => setPin(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            placeholder={pinSet ? 'PIN eingeben' : 'Neuen PIN festlegen (min. 4 Zeichen)'} autoFocus
            className="px-3 py-2 rounded-md text-sm" style={INPUT_STYLE} />
          <button type="button" onClick={submit} className="px-3 py-2 rounded-md text-sm"
            style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)' }}>
            {pinSet ? 'Entsperren' : 'PIN festlegen'}
          </button>
          {pinSet && <button type="button" onClick={() => { setForgot(true); setErr(null); }} className="text-xs self-start"
            style={{ color: 'var(--color-on-surface-variant)' }}>PIN vergessen?</button>}
        </>
      ) : (
        <>
          <p className="text-xs" style={{ color: 'var(--color-on-surface-variant)' }}>Zum Zurücksetzen dein App-Login-Passwort + neuen PIN eingeben.</p>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="App-Passwort" className="px-3 py-2 rounded-md text-sm" style={INPUT_STYLE} />
          <input type="password" value={newPin} onChange={(e) => setNewPin(e.target.value)} placeholder="Neuer PIN" className="px-3 py-2 rounded-md text-sm" style={INPUT_STYLE} />
          <button type="button" onClick={reset} className="px-3 py-2 rounded-md text-sm" style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)' }}>PIN zurücksetzen</button>
          <button type="button" onClick={() => { setForgot(false); setErr(null); }} className="text-xs self-start" style={{ color: 'var(--color-on-surface-variant)' }}>Zurück</button>
        </>
      )}
      {err && <p className="text-xs" style={{ color: '#fca5a5' }}>{err}</p>}
    </div>
  );
}

function CustomField({ field, onSave, onDelete }: { field: MyDataCustom; onSave: (patch: { label?: string; value?: string }) => void; onDelete: () => void }) {
  const [label, setLabel] = useState(field.label);
  const [value, setValue] = useState(field.value);
  useEffect(() => { setLabel(field.label); }, [field.label]);
  useEffect(() => { setValue(field.value); }, [field.value]);
  return (
    <div className="flex items-center gap-2">
      <input value={label} onChange={(e) => setLabel(e.target.value)} onBlur={() => { if (label !== field.label) onSave({ label }); }}
        placeholder="Bezeichnung" className="w-40 px-2 py-1 rounded text-sm" style={INPUT_STYLE} />
      <input value={value} onChange={(e) => setValue(e.target.value)} onBlur={() => { if (value !== field.value) onSave({ value }); }}
        placeholder="Wert" className="flex-1 px-2 py-1 rounded text-sm" style={INPUT_STYLE} />
      <CopyBtn value={field.value} />
      <button type="button" onClick={() => { if (confirm('Feld wirklich löschen?')) onDelete(); }} aria-label="Feld löschen"
        className="p-1 rounded hover:bg-white/5 flex-shrink-0" style={{ color: '#fca5a5' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
      </button>
    </div>
  );
}

export function AmazonMyDataPage() {
  const qc = useQueryClient();
  const pinGateToken = useAuthStore((s) => s.pinGateToken);
  const setPinGateToken = useAuthStore((s) => s.setPinGateToken);
  const status = useQuery({ queryKey: ['mydata', 'status'], queryFn: fetchMyDataStatus });
  const data = useQuery({ queryKey: ['mydata', 'data'], queryFn: fetchMyData, enabled: !!pinGateToken });

  const inval = () => qc.invalidateQueries({ queryKey: ['mydata', 'data'] });
  const patch = useMutation({ mutationFn: (p: MyDataPatch) => updateMyData(p), onSettled: inval });
  const addCustom = useMutation({ mutationFn: () => createMyDataCustom(), onSettled: inval });
  const patchCustom = useMutation({ mutationFn: (v: { id: number; patch: { label?: string; value?: string } }) => updateMyDataCustom(v.id, v.patch), onSettled: inval });
  const delCustom = useMutation({ mutationFn: (id: number) => deleteMyDataCustom(id), onSettled: inval });
  const [changingPin, setChangingPin] = useState(false);

  function lock() { setPinGateToken(null); qc.removeQueries({ queryKey: ['mydata', 'data'] }); }

  if (status.isLoading) return <PageWrapper><p style={{ color: 'var(--color-on-surface-variant)' }}>Lade …</p></PageWrapper>;

  if (!pinGateToken) {
    return <PageWrapper><PinGate pinSet={!!status.data?.pinSet} onUnlocked={(t) => { setPinGateToken(t); qc.invalidateQueries({ queryKey: ['mydata'] }); }} /></PageWrapper>;
  }

  const d = data.data?.data;
  return (
    <PageWrapper>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'var(--font-headline)', color: 'var(--color-on-surface)' }}>Meine Daten</h1>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setChangingPin(v => !v)} className="px-3 py-1.5 rounded-md text-sm"
            style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}>PIN ändern</button>
          <button type="button" onClick={lock} className="px-3 py-1.5 rounded-md text-sm flex items-center gap-1"
            style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>lock</span>Sperren</button>
        </div>
      </div>

      {changingPin && <ChangePinBox onClose={() => setChangingPin(false)} onChanged={(t) => { setPinGateToken(t); setChangingPin(false); }} />}

      {data.isLoading || !d ? <p style={{ color: 'var(--color-on-surface-variant)' }}>Lade Daten …</p> : (
        <div className="flex flex-col gap-5">
          {GROUPS.map(g => (
            <section key={g.title} className="rounded-xl p-4 flex flex-col gap-2"
              style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <p className="text-xs font-semibold tracking-wider" style={{ color: 'var(--color-on-surface-variant)' }}>{g.title.toUpperCase()}</p>
              {g.fields.map(f => (
                <Field key={f.key} label={f.label} value={d[f.key] as string | null} onSave={(v) => patch.mutate({ [f.key]: v } as MyDataPatch)} />
              ))}
            </section>
          ))}
          <section className="rounded-xl p-4 flex flex-col gap-2"
            style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <p className="text-xs font-semibold tracking-wider" style={{ color: 'var(--color-on-surface-variant)' }}>EIGENE FELDER</p>
            {(data.data?.custom ?? []).map(c => (
              <CustomField key={c.id} field={c}
                onSave={(p) => patchCustom.mutate({ id: c.id, patch: p })}
                onDelete={() => delCustom.mutate(c.id)} />
            ))}
            <button type="button" onClick={() => addCustom.mutate()} className="self-start px-3 py-1.5 rounded-md text-sm flex items-center gap-1.5"
              style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span> Feld hinzufügen
            </button>
          </section>
        </div>
      )}
    </PageWrapper>
  );
}

function ChangePinBox({ onClose, onChanged }: { onClose: () => void; onChanged: (token: string) => void }) {
  const [oldPin, setOldPin] = useState(''); const [newPin, setNewPin] = useState('');
  const [err, setErr] = useState<string | null>(null);
  async function submit() {
    setErr(null);
    try { const r = await changeMyDataPin(oldPin, newPin); onChanged(r.token); }
    catch { setErr('Alter PIN falsch oder neuer PIN zu kurz.'); }
  }
  return (
    <div className="rounded-xl p-4 mb-4 flex items-center gap-2 flex-wrap" style={{ background: 'var(--color-surface-container-low)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <input type="password" value={oldPin} onChange={(e) => setOldPin(e.target.value)} placeholder="Alter PIN" className="px-2 py-1 rounded text-sm" style={INPUT_STYLE} />
      <input type="password" value={newPin} onChange={(e) => setNewPin(e.target.value)} placeholder="Neuer PIN" className="px-2 py-1 rounded text-sm" style={INPUT_STYLE} />
      <button type="button" onClick={submit} className="px-3 py-1.5 rounded-md text-sm" style={{ background: 'var(--color-primary)', color: 'var(--color-on-primary)' }}>Ändern</button>
      <button type="button" onClick={onClose} className="px-3 py-1.5 rounded-md text-sm" style={{ background: 'var(--color-surface-container-high)', color: 'var(--color-on-surface)' }}>Abbrechen</button>
      {err && <p className="text-xs w-full" style={{ color: '#fca5a5' }}>{err}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + Commit** `npm --prefix frontend run typecheck` → 0.
```bash
git add frontend/src/pages/amazon/AmazonMyDataPage.tsx
git commit -m "feat(amazon-mydata): AmazonMyDataPage (PIN-Gate + Formular + eigene Felder)"
```

---

## Task 8: Frontend — Navigation + Route

**Files:** Modify `frontend/src/components/layout/navConfig.ts`, `frontend/src/routes/routes.tsx`

- [ ] **Step 1: Sidebar-Eintrag** — in `navConfig.ts` die Amazon-`subItems` ergänzen (nach `markenname`):
```ts
    { path: '/amazon/meine-daten',             label: 'Meine Daten', icon: 'lock' },
```
und in `pageNames`:
```ts
  '/amazon/meine-daten':              'Meine Daten',
```

- [ ] **Step 2: Route** — in `routes.tsx` Import + Route (nach der markenname-Zeile):
```tsx
import { AmazonMyDataPage } from '../pages/amazon/AmazonMyDataPage';
```
```tsx
          { path: '/amazon/meine-daten', element: <AmazonMyDataPage /> },
```

- [ ] **Step 3: Typecheck** `npm --prefix frontend run typecheck` → 0.

- [ ] **Step 4: Manuelle Verifikation** (Backend-Neustart für Migration 088, hart neu laden): Sidebar → Amazon → „Meine Daten" → PIN festlegen → Felder eintragen (Auto-Save) → Copy-Button → eigenes Feld → Reload → wieder gesperrt → mit PIN entsperren → Daten noch da → „PIN ändern" / „PIN vergessen" (App-Passwort).

- [ ] **Step 5: Commit**
```bash
git add frontend/src/components/layout/navConfig.ts frontend/src/routes/routes.tsx
git commit -m "feat(amazon-mydata): Sidebar-Eintrag + Route"
```

---

## Abschluss
- [ ] Voller Backend-Test + beide Typechecks grün.
- [ ] UAT mit Benny anhand der Testkriterien aus der Spec.
- [ ] Merge `feature/amazon-meine-daten` → `main` (`--no-ff`) nach Freigabe (enthält auch die Sample-Datum-Beschriftung).

## Self-Review (gegen Spec)
- Ort: Amazon-Unterpunkt „Meine Daten" ✓ (Task 8)
- PIN-Gate server-seitig (Unlock-JWT, x-mydata-unlock, 401 ohne Token) ✓ (Task 2, 3, 5)
- set/verify/change/reset-pin (reset via App-Passwort) ✓ (Task 2)
- Felder-Gruppen + Copy-Buttons + eigene Felder ✓ (Task 6, 7)
- pin_hash nie ausgeliefert ✓ (publicFields, Test Task 3)
- Migration 088, Single-Row lazy id=1 ✓ (Task 1, 2)
- Auto-Save, Lösch-Bestätigung, echte Umlaute ✓
