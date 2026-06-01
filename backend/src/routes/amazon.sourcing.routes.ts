import { Router, type Request, type Response } from 'express';
import db from '../db/connection';

const router = Router();

type SourcingStatus = 'offen' | 'in_bearbeitung' | 'erledigt';
const VALID_SOURCING_STATUS: ReadonlySet<SourcingStatus> = new Set(['offen', 'in_bearbeitung', 'erledigt']);

const CP_COLUMNS = [
  'cp_hersteller_gefiltert',
  'cp_anforderungen_kommuniziert',
  'cp_erste_preise_erhalten',
  'cp_usp_geprueft',
  'cp_samples_angefragt',
  'cp_sample_analyse',
  'cp_vergleichstabelle',
  'cp_finale_verhandlung',
  'cp_zahlungsziel',
] as const;

interface SourcingRow {
  product_id: number;
  status: SourcingStatus;
  is_expanded: number;
  cp_hersteller_gefiltert: number;
  cp_anforderungen_kommuniziert: number;
  cp_erste_preise_erhalten: number;
  cp_usp_geprueft: number;
  cp_samples_angefragt: number;
  cp_sample_analyse: number;
  cp_vergleichstabelle: number;
  cp_finale_verhandlung: number;
  cp_zahlungsziel: number;
  updated_at: number;
}

function ensureProduct(id: number): boolean {
  return db.prepare(`SELECT 1 FROM amazon_products WHERE id = ?`).get(id) !== undefined;
}

function getOrCreateSourcing(productId: number): SourcingRow {
  let row = db.prepare(`SELECT * FROM amazon_sourcing WHERE product_id = ?`).get(productId) as SourcingRow | undefined;
  if (!row) {
    db.prepare(`INSERT INTO amazon_sourcing (product_id) VALUES (?)`).run(productId);
    row = db.prepare(`SELECT * FROM amazon_sourcing WHERE product_id = ?`).get(productId) as SourcingRow;
  }
  return row;
}

function listSamples(productId: number): unknown[] {
  return db.prepare(
    `SELECT * FROM amazon_sourcing_samples
     WHERE product_id = ?
     ORDER BY sort_order, id`
  ).all(productId);
}

// GET /api/amazon/products/:id/sourcing
router.get('/products/:id/sourcing', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) {
    res.status(404).json({ error: 'product not found' });
    return;
  }
  const sourcing = getOrCreateSourcing(id);
  const samples = listSamples(id);
  res.json({ sourcing, samples });
});

// PATCH /api/amazon/products/:id/sourcing
router.patch('/products/:id/sourcing', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) {
    res.status(404).json({ error: 'product not found' });
    return;
  }
  getOrCreateSourcing(id);

  const body = (req.body as Record<string, unknown>) ?? {};
  const updates: string[] = [];
  const params: unknown[] = [];

  if (body.status !== undefined) {
    if (typeof body.status !== 'string' || !VALID_SOURCING_STATUS.has(body.status as SourcingStatus)) {
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

  for (const col of CP_COLUMNS) {
    if (body[col] !== undefined) {
      if (body[col] !== 0 && body[col] !== 1) {
        res.status(400).json({ error: `invalid ${col}` });
        return;
      }
      updates.push(`${col} = ?`);
      params.push(body[col]);
    }
  }

  if (updates.length > 0) {
    updates.push('updated_at = unixepoch()');
    params.push(id);
    db.prepare(`UPDATE amazon_sourcing SET ${updates.join(', ')} WHERE product_id = ?`).run(...params);
  }

  const sourcing = getOrCreateSourcing(id);
  res.json({ sourcing });
});

export default router;
