import { Router, type Request, type Response } from 'express';
import db from '../db/connection';

const router = Router();

type Status = 'interessant' | 'aktiv' | 'bestehend' | 'verworfen';
const VALID_STATUS: ReadonlySet<Status> = new Set(['interessant', 'aktiv', 'bestehend', 'verworfen']);
const MAX_NAME_LEN = 200;

interface ProductRow {
  id: number;
  name: string;
  status: Status;
  image_path: string | null;
  created_at: number;
  updated_at: number;
}

function validateName(raw: unknown): { ok: true; value: string } | { ok: false } {
  if (typeof raw !== 'string') return { ok: false };
  const trimmed = raw.trim();
  if (trimmed.length < 1 || trimmed.length > MAX_NAME_LEN) return { ok: false };
  return { ok: true, value: trimmed };
}

// GET /api/amazon/products?include_discarded=true|false
router.get('/products', (req: Request, res: Response) => {
  const includeDiscarded = String(req.query.include_discarded) === 'true';
  const sql = includeDiscarded
    ? `SELECT * FROM amazon_products ORDER BY created_at DESC, id DESC`
    : `SELECT * FROM amazon_products WHERE status != 'verworfen' ORDER BY created_at DESC, id DESC`;
  res.json(db.prepare(sql).all());
});

// POST /api/amazon/products
router.post('/products', (req: Request, res: Response) => {
  const name = validateName((req.body as { name?: unknown })?.name);
  if (!name.ok) { res.status(400).json({ error: 'name length invalid' }); return; }

  const result = db.prepare(
    `INSERT INTO amazon_products (name) VALUES (?)`
  ).run(name.value);
  const row = db.prepare(`SELECT * FROM amazon_products WHERE id = ?`).get(result.lastInsertRowid) as ProductRow;
  res.status(201).json(row);
});

// PATCH /api/amazon/products/:id
router.patch('/products/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: 'invalid id' }); return; }

  const existing = db.prepare(`SELECT * FROM amazon_products WHERE id = ?`).get(id) as ProductRow | undefined;
  if (!existing) { res.status(404).json({ error: 'not found' }); return; }

  const body = (req.body as { name?: unknown; status?: unknown }) ?? {};
  const updates: string[] = [];
  const params: unknown[] = [];

  if (body.name !== undefined) {
    const name = validateName(body.name);
    if (!name.ok) { res.status(400).json({ error: 'name length invalid' }); return; }
    updates.push('name = ?');
    params.push(name.value);
  }
  if (body.status !== undefined) {
    if (typeof body.status !== 'string' || !VALID_STATUS.has(body.status as Status)) {
      res.status(400).json({ error: 'invalid status' });
      return;
    }
    updates.push('status = ?');
    params.push(body.status);
  }

  if (updates.length === 0) { res.json(existing); return; }

  updates.push('updated_at = unixepoch()');
  params.push(id);
  db.prepare(`UPDATE amazon_products SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  const row = db.prepare(`SELECT * FROM amazon_products WHERE id = ?`).get(id) as ProductRow;
  res.json(row);
});

// DELETE /api/amazon/products/:id
router.delete('/products/:id', (_req: Request, res: Response) => {
  const id = Number(_req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: 'invalid id' }); return; }
  // Bild-Cleanup folgt in Task 3 (gleicher Handler wird dort erweitert).
  db.prepare(`DELETE FROM amazon_products WHERE id = ?`).run(id);
  res.status(204).end();
});

export default router;
