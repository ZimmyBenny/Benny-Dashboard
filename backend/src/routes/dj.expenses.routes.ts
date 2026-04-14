import { Router } from 'express';
import db from '../db/connection';
import { logAudit } from '../services/dj.audit.service';

const router = Router();

// GET /api/dj/expenses
router.get('/', (req, res) => {
  const { year, category } = req.query as Record<string, string>;
  let sql = 'SELECT * FROM dj_expenses WHERE deleted_at IS NULL';
  const params: unknown[] = [];
  if (year) { sql += " AND strftime('%Y', expense_date) = ?"; params.push(year); }
  if (category) { sql += ' AND category = ?'; params.push(category); }
  sql += ' ORDER BY expense_date DESC';
  res.json(db.prepare(sql).all(...params));
});

// POST /api/dj/expenses
router.post('/', (req, res) => {
  const { expense_date, category, description, amount_gross, tax_rate = 19.0,
    is_recurring = 0, recurring_interval, notes } = req.body as Record<string, unknown>;

  if (!expense_date || !category || !description || amount_gross == null) {
    res.status(400).json({ error: 'expense_date, category, description, amount_gross erforderlich' });
    return;
  }

  const rate = Number(tax_rate);
  const gross = Number(amount_gross);
  const netAmount = gross / (1 + rate / 100);
  const vatAmount = gross - netAmount;

  const result = db.prepare(`
    INSERT INTO dj_expenses
      (expense_date, category, description, amount_gross, tax_rate, amount_net, vat_amount, is_recurring, recurring_interval, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    expense_date, category, description, gross, rate,
    Math.round(netAmount * 100) / 100, Math.round(vatAmount * 100) / 100,
    is_recurring ? 1 : 0, recurring_interval ?? null, notes ?? null,
  );

  const newId = Number(result.lastInsertRowid);
  logAudit(req, 'expense', newId, 'create', undefined, req.body);
  res.status(201).json(db.prepare('SELECT * FROM dj_expenses WHERE id = ?').get(newId));
});

// PATCH /api/dj/expenses/:id
router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: 'Ungültige ID' }); return; }

  const existing = db.prepare('SELECT * FROM dj_expenses WHERE id = ? AND deleted_at IS NULL').get(id);
  if (!existing) { res.status(404).json({ error: 'Ausgabe nicht gefunden' }); return; }

  const { expense_date, category, description, amount_gross, tax_rate, is_recurring, recurring_interval, notes } =
    req.body as Record<string, unknown>;

  let netAmount = null, vatAmount = null;
  if (amount_gross != null && tax_rate != null) {
    const rate = Number(tax_rate);
    const gross = Number(amount_gross);
    netAmount = Math.round((gross / (1 + rate / 100)) * 100) / 100;
    vatAmount = Math.round((gross - netAmount) * 100) / 100;
  }

  db.prepare(`
    UPDATE dj_expenses SET
      expense_date = COALESCE(?, expense_date),
      category = COALESCE(?, category),
      description = COALESCE(?, description),
      amount_gross = COALESCE(?, amount_gross),
      tax_rate = COALESCE(?, tax_rate),
      amount_net = COALESCE(?, amount_net),
      vat_amount = COALESCE(?, vat_amount),
      is_recurring = COALESCE(?, is_recurring),
      recurring_interval = COALESCE(?, recurring_interval),
      notes = COALESCE(?, notes),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(
    expense_date ?? null, category ?? null, description ?? null,
    amount_gross ?? null, tax_rate ?? null, netAmount, vatAmount,
    is_recurring != null ? (is_recurring ? 1 : 0) : null,
    recurring_interval ?? null, notes ?? null, id,
  );

  logAudit(req, 'expense', id, 'update', existing, req.body);
  res.json(db.prepare('SELECT * FROM dj_expenses WHERE id = ?').get(id));
});

// DELETE /api/dj/expenses/:id (Soft-Delete)
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: 'Ungültige ID' }); return; }

  const existing = db.prepare('SELECT * FROM dj_expenses WHERE id = ? AND deleted_at IS NULL').get(id);
  if (!existing) { res.status(404).json({ error: 'Ausgabe nicht gefunden' }); return; }

  db.prepare("UPDATE dj_expenses SET deleted_at = datetime('now') WHERE id = ?").run(id);
  logAudit(req, 'expense', id, 'delete', existing, undefined);
  res.json({ ok: true });
});

export default router;
