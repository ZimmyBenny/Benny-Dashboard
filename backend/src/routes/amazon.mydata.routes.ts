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
interface FieldRow { id: number; group_key: string; sort_order: number; label: string; value: string; created_at: number; }

const GROUP_KEYS = new Set(['steuer', 'bank', 'firma', 'amazon', 'weitere']);
const DEFAULT_FIELDS: [string, string][] = [
  ['steuer', 'EORI-Nummer'], ['steuer', 'USt-IdNr'], ['steuer', 'Steuernummer'], ['steuer', 'Finanzamt'],
  ['bank', 'Kontoinhaber'], ['bank', 'IBAN'], ['bank', 'BIC'], ['bank', 'Bank'],
  ['firma', 'Name'], ['firma', 'Firma'], ['firma', 'Adresse'], ['firma', 'E-Mail'], ['firma', 'Telefon'], ['firma', 'Webseite'],
  ['amazon', 'Seller-E-Mail'], ['amazon', 'Store-Name'], ['amazon', 'Merchant-Token'],
];
function seedDefaultsIfNeeded(): void {
  const seeded = (db.prepare(`SELECT fields_seeded FROM amazon_my_data WHERE id = 1`).get() as { fields_seeded: number } | undefined)?.fields_seeded;
  if (seeded) return;
  const ins = db.prepare(`INSERT INTO amazon_my_data_custom (group_key, sort_order, label, value) VALUES (?, ?, ?, '')`);
  db.transaction(() => {
    DEFAULT_FIELDS.forEach(([g, label], idx) => ins.run(g, idx + 1, label));
    db.prepare(`UPDATE amazon_my_data SET fields_seeded = 1 WHERE id = 1`).run();
  })();
}
function loadFields(): FieldRow[] {
  return db.prepare(`SELECT * FROM amazon_my_data_custom ORDER BY sort_order, id`).all() as FieldRow[];
}

const DUMMY_HASH = '$2b$12$CwTycUXWue0Thq9StjUM0uJ8.m8yq9W/xWc9Cg3aB8fQaN8g6q6Dq';

function getRow(): MyDataRow {
  let row = db.prepare(`SELECT * FROM amazon_my_data WHERE id = 1`).get() as MyDataRow | undefined;
  if (!row) {
    db.prepare(`INSERT INTO amazon_my_data (id) VALUES (1)`).run();
    row = db.prepare(`SELECT * FROM amazon_my_data WHERE id = 1`).get() as MyDataRow;
  }
  return row;
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
  getRow();
  seedDefaultsIfNeeded();
  res.json({ fields: loadFields() });
});

router.post('/my-data/custom', requireMyDataUnlock, (req: Request, res: Response) => {
  const gk = (req.body ?? {}).group_key;
  const group_key = typeof gk === 'string' && GROUP_KEYS.has(gk) ? gk : 'weitere';
  const maxOrder = (db.prepare(`SELECT COALESCE(MAX(sort_order),0) AS m FROM amazon_my_data_custom`).get() as { m: number }).m;
  const r = db.prepare(`INSERT INTO amazon_my_data_custom (group_key, sort_order) VALUES (?, ?)`).run(group_key, maxOrder + 1);
  res.status(201).json({ field: db.prepare(`SELECT * FROM amazon_my_data_custom WHERE id = ?`).get(r.lastInsertRowid) as FieldRow });
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
  if (sets.length === 0) { res.json({ field: db.prepare(`SELECT * FROM amazon_my_data_custom WHERE id = ?`).get(id) as FieldRow }); return; }
  db.prepare(`UPDATE amazon_my_data_custom SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
  res.json({ field: db.prepare(`SELECT * FROM amazon_my_data_custom WHERE id = ?`).get(id) as FieldRow });
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
