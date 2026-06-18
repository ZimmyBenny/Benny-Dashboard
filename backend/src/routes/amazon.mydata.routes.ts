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

const EDITABLE_FIELDS = [
  'eori', 'vat_id', 'tax_number', 'finanzamt',
  'bank_holder', 'iban', 'bic', 'bank_name',
  'name', 'firma', 'adresse', 'email', 'telefon', 'webseite',
  'amazon_email', 'amazon_store', 'merchant_token',
] as const;

const DUMMY_HASH = '$2b$12$CwTycUXWue0Thq9StjUM0uJ8.m8yq9W/xWc9Cg3aB8fQaN8g6q6Dq';

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
  void _id; void _pin;
  return rest;
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
  const ok = await bcrypt.compare(typeof pin === 'string' ? pin : '', row.pin_hash ?? DUMMY_HASH);
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
  const ok = await bcrypt.compare(typeof password === 'string' ? password : '', user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok) { res.status(401).json({ error: 'wrong password' }); return; }
  if (!isValidPin(newPin)) { res.status(400).json({ error: 'pin invalid' }); return; }
  getRow();
  const hash = await bcrypt.hash(newPin, 12);
  db.prepare(`UPDATE amazon_my_data SET pin_hash = ?, updated_at = unixepoch() WHERE id = 1`).run(hash);
  res.json({ token: issueUnlockToken() });
});

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

export default router;
