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

type SampleQuality = 'sehr_gut' | 'gut' | 'mittel' | 'schlecht';
type SampleStatus = 'angefragt' | 'bestellt' | 'erhalten' | 'abgelehnt';
const VALID_QUALITY: ReadonlySet<SampleQuality> = new Set(['sehr_gut', 'gut', 'mittel', 'schlecht']);
const VALID_SAMPLE_STATUS: ReadonlySet<SampleStatus> = new Set(['angefragt', 'bestellt', 'erhalten', 'abgelehnt']);

const SAMPLE_LIMIT = 50;
const MAX_TEXT_LEN = 500;

interface SampleRow {
  id: number;
  product_id: number;
  sort_order: number;
  is_winner: number;
  hersteller: string | null;
  sample_kosten: string | null;
  besonderheiten: string | null;
  lieferzeit: string | null;
  qualitaet: SampleQuality | null;
  bewertung: number | null;
  status: SampleStatus | null;
  notizen: string | null;
  created_at: number;
  updated_at: number;
}

function normalizeText(raw: unknown): { ok: true; value: string | null } | { ok: false } {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: false };
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: true, value: null };
  if (trimmed.length > MAX_TEXT_LEN) return { ok: false };
  return { ok: true, value: trimmed };
}

function loadSample(productId: number, sampleId: number): SampleRow | undefined {
  return db.prepare(
    `SELECT * FROM amazon_sourcing_samples WHERE id = ? AND product_id = ?`
  ).get(sampleId, productId) as SampleRow | undefined;
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

// POST /api/amazon/products/:id/sourcing/samples
router.post('/products/:id/sourcing/samples', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) {
    res.status(404).json({ error: 'product not found' });
    return;
  }

  const count = (db.prepare(
    `SELECT COUNT(*) AS c FROM amazon_sourcing_samples WHERE product_id = ?`
  ).get(id) as { c: number }).c;
  if (count >= SAMPLE_LIMIT) {
    res.status(400).json({ error: 'sample limit reached' });
    return;
  }

  const maxOrder = (db.prepare(
    `SELECT COALESCE(MAX(sort_order), 0) AS m FROM amazon_sourcing_samples WHERE product_id = ?`
  ).get(id) as { m: number }).m;

  const result = db.prepare(
    `INSERT INTO amazon_sourcing_samples (product_id, sort_order) VALUES (?, ?)`
  ).run(id, maxOrder + 1);

  const row = db.prepare(`SELECT * FROM amazon_sourcing_samples WHERE id = ?`).get(result.lastInsertRowid) as SampleRow;
  res.status(201).json({ sample: row });
});

// PATCH /api/amazon/products/:id/sourcing/samples/:sampleId
router.patch('/products/:id/sourcing/samples/:sampleId', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const sampleId = Number(req.params.sampleId);
  if (!Number.isInteger(id) || !Number.isInteger(sampleId)) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  if (!ensureProduct(id) || !loadSample(id, sampleId)) {
    res.status(404).json({ error: 'not found' });
    return;
  }

  const body = (req.body as Record<string, unknown>) ?? {};
  const updates: string[] = [];
  const params: unknown[] = [];

  for (const col of ['hersteller', 'sample_kosten', 'besonderheiten', 'lieferzeit', 'notizen'] as const) {
    if (body[col] !== undefined) {
      const v = normalizeText(body[col]);
      if (!v.ok) { res.status(400).json({ error: `invalid ${col}` }); return; }
      updates.push(`${col} = ?`);
      params.push(v.value);
    }
  }

  if (body.qualitaet !== undefined) {
    if (body.qualitaet !== null &&
        (typeof body.qualitaet !== 'string' || !VALID_QUALITY.has(body.qualitaet as SampleQuality))) {
      res.status(400).json({ error: 'invalid qualitaet' });
      return;
    }
    updates.push('qualitaet = ?');
    params.push(body.qualitaet);
  }

  if (body.status !== undefined) {
    if (body.status !== null &&
        (typeof body.status !== 'string' || !VALID_SAMPLE_STATUS.has(body.status as SampleStatus))) {
      res.status(400).json({ error: 'invalid status' });
      return;
    }
    updates.push('status = ?');
    params.push(body.status);
  }

  if (body.bewertung !== undefined) {
    if (body.bewertung !== null &&
        (typeof body.bewertung !== 'number' || !Number.isInteger(body.bewertung) ||
         body.bewertung < 0 || body.bewertung > 5)) {
      res.status(400).json({ error: 'invalid bewertung' });
      return;
    }
    updates.push('bewertung = ?');
    params.push(body.bewertung);
  }

  if (body.sort_order !== undefined) {
    if (typeof body.sort_order !== 'number' || !Number.isInteger(body.sort_order)) {
      res.status(400).json({ error: 'invalid sort_order' });
      return;
    }
    updates.push('sort_order = ?');
    params.push(body.sort_order);
  }

  if (body.is_winner !== undefined) {
    if (body.is_winner !== 0 && body.is_winner !== 1) {
      res.status(400).json({ error: 'invalid is_winner' });
      return;
    }
    if (body.is_winner === 1) {
      db.transaction(() => {
        db.prepare(
          `UPDATE amazon_sourcing_samples SET is_winner = 0, updated_at = unixepoch()
           WHERE product_id = ? AND id != ?`
        ).run(id, sampleId);
      })();
    }
    updates.push('is_winner = ?');
    params.push(body.is_winner);
  }

  if (updates.length > 0) {
    updates.push('updated_at = unixepoch()');
    params.push(sampleId);
    db.prepare(`UPDATE amazon_sourcing_samples SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }

  const row = db.prepare(`SELECT * FROM amazon_sourcing_samples WHERE id = ?`).get(sampleId) as SampleRow;
  res.json({ sample: row });
});

// DELETE /api/amazon/products/:id/sourcing/samples/:sampleId
router.delete('/products/:id/sourcing/samples/:sampleId', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const sampleId = Number(req.params.sampleId);
  if (!Number.isInteger(id) || !Number.isInteger(sampleId)) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  if (!ensureProduct(id) || !loadSample(id, sampleId)) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  db.prepare(`DELETE FROM amazon_sourcing_samples WHERE id = ?`).run(sampleId);
  res.status(204).end();
});

export default router;
