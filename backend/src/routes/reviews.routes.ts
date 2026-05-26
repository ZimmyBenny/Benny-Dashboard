import { Router } from 'express';
import db from '../db/connection';
import { type ReviewStatus } from '../lib/profitCalc';

const router = Router();

interface ReviewRow {
  id: number;
  product_name: string;
  product_url: string | null;
  purchase_price_cents: number;
  status: ReviewStatus;
  order_date: string | null;
  received_date: string | null;
  review_deadline: string | null;
  refund_code: string | null;
  refund_amount_cents: number | null;
  sale_amount_cents: number | null;
  notes: string | null;
  seller_notified: number; // 0 oder 1 (SQLite-Boolean)
  created_at: string;
  updated_at: string;
}

const PENDING_STATUSES = ['vorgemerkt','bestellt','erhalten','bewertet'] as const;

// Erlaubte PATCH-Felder (Whitelist gegen Massenzuweisung)
const PATCHABLE_FIELDS = [
  'product_name','product_url','purchase_price_cents','status',
  'order_date','received_date','review_deadline',
  'refund_code','refund_amount_cents','sale_amount_cents','notes',
  'seller_notified',
] as const;

function yearFilterSqlAndParams(year: string | undefined): { sql: string; params: string[] } {
  if (!year || year === 'all') return { sql: '', params: [] };
  return {
    sql: `strftime('%Y', COALESCE(received_date, order_date, created_at)) = ?`,
    params: [String(year)],
  };
}

// WICHTIG: /stats VOR /:id (Express Match-Order — RESEARCH Pitfall 2)
router.get('/stats', (req, res) => {
  const { year } = req.query as { year?: string };
  const { sql: yf, params } = yearFilterSqlAndParams(year);
  const where = yf ? `WHERE ${yf}` : '';
  const whereAnd = yf ? `WHERE ${yf} AND` : 'WHERE';

  const total = (db.prepare(`SELECT COUNT(*) AS c FROM amazon_reviews ${where}`).get(...params) as { c: number }).c;
  const openRefunds = (db.prepare(`SELECT COUNT(*) AS c FROM amazon_reviews ${whereAnd} status IN ('vorgemerkt','bestellt','erhalten','bewertet')`).get(...params) as { c: number }).c;

  // User-Decision 2026-05-26: Alle Stati ausser 'vorgemerkt' tragen zum Saldo bei.
  // Bestellt ohne Refund -> negativ; Geld erhalten -> 0 bei vollem Refund; Verkauft -> positiv.
  const committedRows = db.prepare(
    `SELECT * FROM amazon_reviews ${whereAnd} status IN ('bestellt','erhalten','bewertet','geld_erhalten','bereit_verkauf','behalten','verkauft','verschenkt','entsorgt')`
  ).all(...params) as ReviewRow[];

  // User-Decision 2026-05-26: Einkauf und Verkauf getrennt zeigen.
  const spentCents    = committedRows.reduce((sum, r) => sum + r.purchase_price_cents, 0);
  const receivedCents = committedRows.reduce((sum, r) => sum + (r.refund_amount_cents ?? 0) + (r.sale_amount_cents ?? 0), 0);
  // User-Decision 2026-05-25: negative Saldos werden NICHT geclampt (mathematisch korrekt)
  const realizedProfitCents = receivedCents - spentCents;

  res.json({
    total,
    open_refunds: openRefunds,
    spent_cents: spentCents,
    received_cents: receivedCents,
    realized_profit_cents: realizedProfitCents,
  });
});

router.get('/', (req, res) => {
  const { year } = req.query as { year?: string };
  const { sql: yf, params } = yearFilterSqlAndParams(year);
  const where = yf ? `WHERE ${yf}` : '';
  const rows = db.prepare(
    `SELECT * FROM amazon_reviews ${where} ORDER BY COALESCE(received_date, created_at) DESC, id DESC`
  ).all(...params);
  res.json(rows);
});

router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare('SELECT * FROM amazon_reviews WHERE id = ?').get(id);
  if (!row) { res.status(404).json({ error: 'Bewertung nicht gefunden' }); return; }
  res.json(row);
});

router.post('/', (req, res) => {
  const body = req.body as Partial<ReviewRow>;
  const productName = (body.product_name ?? '').trim();
  if (!productName) { res.status(400).json({ error: 'Produktname ist Pflicht.' }); return; }
  const price = Number(body.purchase_price_cents);
  if (!Number.isFinite(price) || price <= 0) {
    res.status(400).json({ error: 'Kaufpreis muss groesser als 0 sein.' });
    return;
  }
  const productUrl = typeof body.product_url === 'string' && body.product_url.trim()
    ? body.product_url.trim()
    : null;
  const result = db.prepare(`
    INSERT INTO amazon_reviews
      (product_name, product_url, purchase_price_cents, status, order_date, received_date,
       review_deadline, refund_code, refund_amount_cents, sale_amount_cents, notes)
    VALUES (?, ?, ?, 'vorgemerkt', ?, ?, ?, ?, ?, ?, ?)
  `).run(
    productName,
    productUrl,
    Math.round(price),
    body.order_date ?? null,
    body.received_date ?? null,
    body.review_deadline ?? null,
    body.refund_code ?? null,
    body.refund_amount_cents ?? null,
    body.sale_amount_cents ?? null,
    body.notes ?? null,
  );
  const created = db.prepare('SELECT * FROM amazon_reviews WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(created);
});

// User-Decision 2026-05-26: Sobald Item in einem dieser Stati landet, ist semantisch der Refund da.
// Auto-Fill refund_amount_cents = purchase_price_cents wenn noch leer.
const REFUND_GUARANTEED_STATUSES = new Set([
  'geld_erhalten', 'bereit_verkauf', 'behalten', 'verkauft', 'verschenkt', 'entsorgt',
]);

// Stati vor 'geld_erhalten': hier ist semantisch noch kein Refund da.
// Rueckwaerts-Drag (z.B. ausversehen reingeschoben) soll den Auto-Refund zuruecksetzen.
const PRE_REFUND_STATUSES = new Set(['vorgemerkt', 'bestellt', 'erhalten', 'bewertet']);

router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM amazon_reviews WHERE id = ?').get(id) as ReviewRow | undefined;
  if (!existing) { res.status(404).json({ error: 'Bewertung nicht gefunden' }); return; }

  const body = req.body as Record<string, unknown>;

  const targetStatus = (typeof body.status === 'string' ? body.status : existing.status) as string;
  const refundExplicitlyProvided = Object.prototype.hasOwnProperty.call(body, 'refund_amount_cents');

  // Auto-Refund: wenn Status zu einem refund-garantierten Status wechselt UND refund noch leer ist
  if (
    REFUND_GUARANTEED_STATUSES.has(targetStatus) &&
    existing.refund_amount_cents == null &&
    (!refundExplicitlyProvided || body.refund_amount_cents == null)
  ) {
    body.refund_amount_cents = existing.purchase_price_cents;
  }

  // Reverse-Auto-Refund: wenn Status von refund-garantiert ZURUECK zu pre-refund wechselt,
  // und der bestehende Refund == Kaufpreis ist (also wahrscheinlich Auto-Fill),
  // setze ihn auf NULL zurueck. Manuell eingetragene Refunds (Teilbetrag) bleiben.
  if (
    PRE_REFUND_STATUSES.has(targetStatus) &&
    REFUND_GUARANTEED_STATUSES.has(existing.status) &&
    existing.refund_amount_cents === existing.purchase_price_cents &&
    !refundExplicitlyProvided
  ) {
    body.refund_amount_cents = null;
  }

  const sets: string[] = [];
  const params: unknown[] = [];
  for (const field of PATCHABLE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      sets.push(`${field} = ?`);
      params.push(body[field] ?? null);
    }
  }
  if (sets.length === 0) {
    const row = db.prepare('SELECT * FROM amazon_reviews WHERE id = ?').get(id);
    res.json(row);
    return;
  }
  sets.push(`updated_at = datetime('now')`);
  params.push(id);
  db.prepare(`UPDATE amazon_reviews SET ${sets.join(', ')} WHERE id = ?`).run(...params);
  const updated = db.prepare('SELECT * FROM amazon_reviews WHERE id = ?').get(id);
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const r = db.prepare('DELETE FROM amazon_reviews WHERE id = ?').run(id);
  if (r.changes === 0) { res.status(404).json({ error: 'Bewertung nicht gefunden' }); return; }
  res.status(204).end();
});

// Suppress unused import warning — PENDING_STATUSES used in /stats SQL inline for clarity
void PENDING_STATUSES;

export default router;
