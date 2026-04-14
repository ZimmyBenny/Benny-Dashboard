import { Router } from 'express';
import db from '../db/connection';
import { logAudit } from '../services/dj.audit.service';
import { nextNumber } from '../services/dj.number.service';

const router = Router();

function loadQuote(id: number) {
  const quote = db.prepare('SELECT * FROM dj_quotes WHERE id = ? AND deleted_at IS NULL').get(id);
  if (!quote) return null;
  const items = db.prepare('SELECT * FROM dj_quote_items WHERE quote_id = ? ORDER BY position').all(id);
  const customer = db.prepare(
    'SELECT id, salutation, first_name, last_name, organization_name, customer_number FROM contacts WHERE id = ?'
  ).get((quote as { customer_id: number }).customer_id);
  const event = (quote as { event_id: number | null }).event_id
    ? db.prepare('SELECT id, title, event_type, event_date FROM dj_events WHERE id = ?').get((quote as { event_id: number }).event_id)
    : null;
  return { ...quote as object, items, customer, event };
}

// GET /api/dj/quotes
router.get('/', (req, res) => {
  const { year, status, customer_id } = req.query as Record<string, string>;
  let sql = `
    SELECT q.*, c.first_name || ' ' || c.last_name AS customer_name, c.organization_name AS customer_org
    FROM dj_quotes q
    LEFT JOIN contacts c ON c.id = q.customer_id
    WHERE q.deleted_at IS NULL
  `;
  const params: unknown[] = [];
  if (year) { sql += " AND strftime('%Y', q.quote_date) = ?"; params.push(year); }
  if (status) { sql += ' AND q.status = ?'; params.push(status); }
  if (customer_id) { sql += ' AND q.customer_id = ?'; params.push(customer_id); }
  sql += ' ORDER BY q.created_at DESC';
  res.json(db.prepare(sql).all(...params));
});

// GET /api/dj/quotes/:id
router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: 'Ungültige ID' }); return; }
  const quote = loadQuote(id);
  if (!quote) { res.status(404).json({ error: 'Angebot nicht gefunden' }); return; }
  res.json(quote);
});

// POST /api/dj/quotes — Neues Angebot (Entwurf)
router.post('/', (req, res) => {
  const { customer_id, event_id, subject, header_text, footer_text, payment_terms, distance_km, trips, items } =
    req.body as Record<string, unknown>;

  if (!customer_id) { res.status(400).json({ error: 'customer_id erforderlich' }); return; }

  const validUntil = new Date();
  validUntil.setDate(validUntil.getDate() + 30);
  const validUntilStr = validUntil.toISOString().slice(0, 10);

  const txn = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO dj_quotes
        (customer_id, event_id, subject, header_text, footer_text, payment_terms, distance_km, trips, valid_until)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      customer_id, event_id ?? null, subject ?? null,
      header_text ?? null, footer_text ?? null, payment_terms ?? null,
      distance_km ?? null, trips ?? 2, validUntilStr,
    );
    const newId = Number(result.lastInsertRowid);

    if (Array.isArray(items)) {
      const insertItem = db.prepare(`
        INSERT INTO dj_quote_items
          (quote_id, position, service_id, package_id, description, quantity, unit, price_net, tax_rate, discount_pct, total_net)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const item of items as Array<Record<string, unknown>>) {
        insertItem.run(
          newId, item.position, item.service_id ?? null, item.package_id ?? null,
          item.description, item.quantity ?? 1, item.unit ?? 'Stück',
          item.price_net, item.tax_rate ?? 19.0, item.discount_pct ?? 0, item.total_net,
        );
      }
      // Summen berechnen
      updateQuoteTotals(newId);
    }
    return newId;
  });

  const newId = txn();
  logAudit(req, 'quote', newId, 'create', undefined, req.body);
  res.status(201).json(loadQuote(newId));
});

// PATCH /api/dj/quotes/:id
router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: 'Ungültige ID' }); return; }

  const existing = db.prepare('SELECT * FROM dj_quotes WHERE id = ? AND deleted_at IS NULL AND finalized_at IS NULL').get(id);
  if (!existing) {
    res.status(409).json({ error: 'Angebot nicht gefunden oder bereits finalisiert' });
    return;
  }

  const { subject, header_text, footer_text, payment_terms, distance_km, trips, valid_until, items } =
    req.body as Record<string, unknown>;

  const txn = db.transaction(() => {
    db.prepare(`
      UPDATE dj_quotes SET
        subject = COALESCE(?, subject), header_text = COALESCE(?, header_text),
        footer_text = COALESCE(?, footer_text), payment_terms = COALESCE(?, payment_terms),
        distance_km = COALESCE(?, distance_km), trips = COALESCE(?, trips),
        valid_until = COALESCE(?, valid_until)
      WHERE id = ?
    `).run(
      subject ?? null, header_text ?? null, footer_text ?? null,
      payment_terms ?? null, distance_km ?? null, trips ?? null,
      valid_until ?? null, id,
    );

    if (Array.isArray(items)) {
      db.prepare('DELETE FROM dj_quote_items WHERE quote_id = ?').run(id);
      const insertItem = db.prepare(`
        INSERT INTO dj_quote_items
          (quote_id, position, service_id, package_id, description, quantity, unit, price_net, tax_rate, discount_pct, total_net)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const item of items as Array<Record<string, unknown>>) {
        insertItem.run(
          id, item.position, item.service_id ?? null, item.package_id ?? null,
          item.description, item.quantity ?? 1, item.unit ?? 'Stück',
          item.price_net, item.tax_rate ?? 19.0, item.discount_pct ?? 0, item.total_net,
        );
      }
      updateQuoteTotals(id);
    }
  });
  txn();

  logAudit(req, 'quote', id, 'update', existing, req.body);
  res.json(loadQuote(id));
});

// POST /api/dj/quotes/:id/finalize — Angebot finalisieren, AN-Nummer vergeben
router.post('/:id/finalize', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: 'Ungültige ID' }); return; }

  const existing = db.prepare('SELECT * FROM dj_quotes WHERE id = ? AND deleted_at IS NULL AND finalized_at IS NULL').get(id);
  if (!existing) {
    res.status(409).json({ error: 'Angebot nicht gefunden oder bereits finalisiert' });
    return;
  }

  const txn = db.transaction(() => {
    const number = nextNumber('quote');
    db.prepare(`
      UPDATE dj_quotes SET number = ?, status = 'gesendet', finalized_at = datetime('now'), sent_at = datetime('now')
      WHERE id = ?
    `).run(number, id);
    return number;
  });

  const number = txn();
  logAudit(req, 'quote', id, 'finalize', existing, { number });
  res.json(loadQuote(id));
});

// DELETE /api/dj/quotes/:id (Soft-Delete, nur Entwürfe)
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: 'Ungültige ID' }); return; }

  const existing = db.prepare('SELECT * FROM dj_quotes WHERE id = ? AND deleted_at IS NULL AND finalized_at IS NULL').get(id);
  if (!existing) {
    res.status(409).json({ error: 'Angebot nicht gefunden oder bereits finalisiert (kann nicht gelöscht werden)' });
    return;
  }

  db.prepare("UPDATE dj_quotes SET deleted_at = datetime('now') WHERE id = ?").run(id);
  logAudit(req, 'quote', id, 'delete', existing, undefined);
  res.json({ ok: true });
});

function updateQuoteTotals(quoteId: number) {
  const items = db.prepare('SELECT * FROM dj_quote_items WHERE quote_id = ?').all(quoteId) as Array<{
    total_net: number; tax_rate: number; discount_pct: number;
  }>;
  const subtotalNet = items.reduce((s, i) => s + i.total_net, 0);
  const taxTotal = items.reduce((s, i) => s + i.total_net * (i.tax_rate / 100), 0);
  const totalGross = subtotalNet + taxTotal;
  db.prepare('UPDATE dj_quotes SET subtotal_net = ?, tax_total = ?, total_gross = ? WHERE id = ?')
    .run(subtotalNet, taxTotal, totalGross, quoteId);
}

export default router;
