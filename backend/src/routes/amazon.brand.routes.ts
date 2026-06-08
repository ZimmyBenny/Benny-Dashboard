import { Router, type Request, type Response } from 'express';
import db from '../db/connection';

const router = Router();

type BrandStatus = 'offen' | 'in_bearbeitung' | 'erledigt';
const VALID_BRAND_STATUS: ReadonlySet<BrandStatus> = new Set(['offen', 'in_bearbeitung', 'erledigt']);

type ResearchStatus = 'frei' | 'belegt' | 'unklar';
const VALID_RESEARCH_STATUS: ReadonlySet<ResearchStatus> = new Set(['frei', 'belegt', 'unklar']);

const MAX_NAME = 200;
const MAX_REMARKS = 300;
const MAX_URL = 500;
const MAX_NOTES = 2000;

interface BrandRow {
  product_id: number;
  status: BrandStatus;
  is_expanded: number;
  notes: string | null;
  updated_at: number;
}

interface CandidateRow {
  id: number;
  product_id: number;
  sort_order: number;
  name: string;
  is_interesting: number;
  is_maybe: number;
  is_yes: number;
  is_no: number;
  is_favorite: number;
  is_archived: number;
  is_final: number;
  remarks: string | null;
  trademark_status: ResearchStatus | null;
  domain_com_status: ResearchStatus | null;
  domain_de_status: ResearchStatus | null;
  social_status: ResearchStatus | null;
  research_url: string | null;
  research_notes: string | null;
  ranking: number | null;
  created_at: number;
  updated_at: number;
}

function ensureProduct(id: number): boolean {
  return db.prepare(`SELECT 1 FROM amazon_products WHERE id = ?`).get(id) !== undefined;
}

function getOrCreateBrand(productId: number): BrandRow {
  let row = db.prepare(`SELECT * FROM amazon_brand_name WHERE product_id = ?`).get(productId) as BrandRow | undefined;
  if (!row) {
    db.prepare(`INSERT INTO amazon_brand_name (product_id) VALUES (?)`).run(productId);
    row = db.prepare(`SELECT * FROM amazon_brand_name WHERE product_id = ?`).get(productId) as BrandRow;
  }
  return row;
}

function listCandidates(productId: number): CandidateRow[] {
  return db.prepare(
    `SELECT * FROM amazon_brand_name_candidates WHERE product_id = ? ORDER BY sort_order, id`
  ).all(productId) as CandidateRow[];
}

function normalizeText(raw: unknown, maxLen: number): { ok: true; value: string | null } | { ok: false } {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: false };
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: true, value: null };
  if (trimmed.length > maxLen) return { ok: false };
  return { ok: true, value: trimmed };
}

function loadCandidate(productId: number, candidateId: number): CandidateRow | undefined {
  return db.prepare(
    `SELECT * FROM amazon_brand_name_candidates WHERE id = ? AND product_id = ?`
  ).get(candidateId, productId) as CandidateRow | undefined;
}

// GET /api/amazon/products/:id/brand
router.get('/products/:id/brand', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) {
    res.status(404).json({ error: 'product not found' });
    return;
  }
  const brand = getOrCreateBrand(id);
  const names = listCandidates(id);
  res.json({ brand, names });
});

// PATCH /api/amazon/products/:id/brand
router.patch('/products/:id/brand', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) {
    res.status(404).json({ error: 'product not found' });
    return;
  }
  getOrCreateBrand(id);

  const body = (req.body as Record<string, unknown>) ?? {};
  const updates: string[] = [];
  const params: unknown[] = [];

  if (body.status !== undefined) {
    if (typeof body.status !== 'string' || !VALID_BRAND_STATUS.has(body.status as BrandStatus)) {
      res.status(400).json({ error: 'invalid status' });
      return;
    }
    updates.push('status = ?');
    params.push(body.status);
  }

  if (body.is_expanded !== undefined) {
    if (body.is_expanded !== 0 && body.is_expanded !== 1) {
      res.status(400).json({ error: 'invalid is_expanded' });
      return;
    }
    updates.push('is_expanded = ?');
    params.push(body.is_expanded);
  }

  if (body.notes !== undefined) {
    const v = normalizeText(body.notes, MAX_NOTES);
    if (!v.ok) { res.status(400).json({ error: 'invalid notes' }); return; }
    updates.push('notes = ?');
    params.push(v.value);
  }

  if (updates.length > 0) {
    updates.push('updated_at = unixepoch()');
    params.push(id);
    db.prepare(`UPDATE amazon_brand_name SET ${updates.join(', ')} WHERE product_id = ?`).run(...params);
  }

  const brand = getOrCreateBrand(id);
  res.json({ brand });
});

// POST /api/amazon/products/:id/brand/names
router.post('/products/:id/brand/names', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) {
    res.status(404).json({ error: 'product not found' });
    return;
  }

  const nameRaw = (req.body as { name?: unknown })?.name;
  const v = normalizeText(nameRaw, MAX_NAME);
  if (!v.ok || v.value === null) {
    res.status(400).json({ error: 'name length invalid' });
    return;
  }

  const maxOrder = (db.prepare(
    `SELECT COALESCE(MAX(sort_order), 0) AS m FROM amazon_brand_name_candidates WHERE product_id = ?`
  ).get(id) as { m: number }).m;

  const result = db.prepare(
    `INSERT INTO amazon_brand_name_candidates (product_id, sort_order, name) VALUES (?, ?, ?)`
  ).run(id, maxOrder + 1, v.value);

  const row = db.prepare(`SELECT * FROM amazon_brand_name_candidates WHERE id = ?`).get(result.lastInsertRowid) as CandidateRow;
  res.status(201).json({ name: row });
});

// PATCH /api/amazon/products/:id/brand/names/:nameId
router.patch('/products/:id/brand/names/:nameId', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const cid = Number(req.params.nameId);
  if (!Number.isInteger(id) || !Number.isInteger(cid)) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  if (!ensureProduct(id) || !loadCandidate(id, cid)) {
    res.status(404).json({ error: 'not found' });
    return;
  }

  const body = (req.body as Record<string, unknown>) ?? {};
  const updates: string[] = [];
  const params: unknown[] = [];

  if (body.name !== undefined) {
    const v = normalizeText(body.name, MAX_NAME);
    if (!v.ok || v.value === null) { res.status(400).json({ error: 'name length invalid' }); return; }
    updates.push('name = ?');
    params.push(v.value);
  }

  for (const col of ['is_interesting', 'is_maybe', 'is_yes', 'is_no', 'is_favorite', 'is_archived', 'is_final'] as const) {
    if (body[col] !== undefined) {
      if (body[col] !== 0 && body[col] !== 1) {
        res.status(400).json({ error: `invalid ${col}` });
        return;
      }
      updates.push(`${col} = ?`);
      params.push(body[col]);
    }
  }

  if (body.remarks !== undefined) {
    const v = normalizeText(body.remarks, MAX_REMARKS);
    if (!v.ok) { res.status(400).json({ error: 'invalid remarks' }); return; }
    updates.push('remarks = ?');
    params.push(v.value);
  }

  if (body.research_url !== undefined) {
    const v = normalizeText(body.research_url, MAX_URL);
    if (!v.ok) { res.status(400).json({ error: 'invalid research_url' }); return; }
    updates.push('research_url = ?');
    params.push(v.value);
  }

  if (body.research_notes !== undefined) {
    const v = normalizeText(body.research_notes, MAX_NOTES);
    if (!v.ok) { res.status(400).json({ error: 'invalid research_notes' }); return; }
    updates.push('research_notes = ?');
    params.push(v.value);
  }

  for (const col of ['trademark_status', 'domain_com_status', 'domain_de_status', 'social_status'] as const) {
    if (body[col] !== undefined) {
      if (body[col] !== null &&
          (typeof body[col] !== 'string' || !VALID_RESEARCH_STATUS.has(body[col] as ResearchStatus))) {
        res.status(400).json({ error: `invalid ${col}` });
        return;
      }
      updates.push(`${col} = ?`);
      params.push(body[col]);
    }
  }

  if (body.ranking !== undefined) {
    if (body.ranking !== null &&
        (typeof body.ranking !== 'number' || !Number.isInteger(body.ranking) ||
         body.ranking < 1 || body.ranking > 3)) {
      res.status(400).json({ error: 'invalid ranking' });
      return;
    }
    updates.push('ranking = ?');
    params.push(body.ranking);
  }

  if (body.sort_order !== undefined) {
    if (typeof body.sort_order !== 'number' || !Number.isInteger(body.sort_order)) {
      res.status(400).json({ error: 'invalid sort_order' });
      return;
    }
    updates.push('sort_order = ?');
    params.push(body.sort_order);
  }

  if (updates.length > 0) {
    updates.push('updated_at = unixepoch()');
    params.push(cid);
    db.prepare(`UPDATE amazon_brand_name_candidates SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }

  if (body.is_final === 1) {
    db.prepare(`UPDATE amazon_brand_name_candidates SET is_final = 0, updated_at = unixepoch() WHERE product_id = ? AND id != ?`).run(id, cid);
  }

  const row = db.prepare(`SELECT * FROM amazon_brand_name_candidates WHERE id = ?`).get(cid) as CandidateRow;
  res.json({ name: row });
});

// DELETE /api/amazon/products/:id/brand/names/:nameId
router.delete('/products/:id/brand/names/:nameId', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const cid = Number(req.params.nameId);
  if (!Number.isInteger(id) || !Number.isInteger(cid)) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  if (!ensureProduct(id) || !loadCandidate(id, cid)) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  db.prepare(`DELETE FROM amazon_brand_name_candidates WHERE id = ?`).run(cid);
  res.status(204).end();
});

export default router;
