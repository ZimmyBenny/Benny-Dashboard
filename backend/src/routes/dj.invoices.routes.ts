import { Router } from 'express';
import db from '../db/connection';
import { logAudit } from '../services/dj.audit.service';
import { nextNumber } from '../services/dj.number.service';
import { gobdGuardInvoice } from '../middleware/dj.gobd.middleware';
import { todayLocal, addDaysLocal } from '../lib/dates';

const router = Router();

function loadInvoice(id: number) {
  const invoice = db.prepare('SELECT * FROM dj_invoices WHERE id = ?').get(id);
  if (!invoice) return null;
  const items = db.prepare('SELECT * FROM dj_invoice_items WHERE invoice_id = ? ORDER BY position').all(id);
  const payments = db.prepare('SELECT * FROM dj_payments WHERE invoice_id = ? ORDER BY payment_date').all(id);
  const customer = db.prepare(
    'SELECT id, salutation, first_name, last_name, organization_name, customer_number FROM contacts WHERE id = ?'
  ).get((invoice as { customer_id: number }).customer_id);
  const event = (invoice as { event_id: number | null }).event_id
    ? db.prepare('SELECT id, title, event_type, event_date FROM dj_events WHERE id = ?').get((invoice as { event_id: number }).event_id)
    : null;
  const cancelledBy = (invoice as { cancelled_by_invoice_id: number | null }).cancelled_by_invoice_id
    ? db.prepare('SELECT id, number FROM dj_invoices WHERE id = ?').get((invoice as { cancelled_by_invoice_id: number }).cancelled_by_invoice_id)
    : null;
  const cancels = (invoice as { cancels_invoice_id: number | null }).cancels_invoice_id
    ? db.prepare('SELECT id, number FROM dj_invoices WHERE id = ?').get((invoice as { cancels_invoice_id: number }).cancels_invoice_id)
    : null;
  return { ...invoice as object, items, payments, customer, event, cancelledBy, cancels };
}

function updateInvoiceTotals(invoiceId: number) {
  const items = db.prepare('SELECT * FROM dj_invoice_items WHERE invoice_id = ?').all(invoiceId) as Array<{
    total_net: number; tax_rate: number;
  }>;
  const subtotalNet = items.reduce((s, i) => s + i.total_net, 0);
  const taxTotal = items.reduce((s, i) => s + i.total_net * (i.tax_rate / 100), 0);
  const totalGross = subtotalNet + taxTotal;
  db.prepare('UPDATE dj_invoices SET subtotal_net = ?, tax_total = ?, total_gross = ? WHERE id = ?')
    .run(subtotalNet, taxTotal, totalGross, invoiceId);
}

// GET /api/dj/invoices
router.get('/', (req, res) => {
  const { year, status, customer_id } = req.query as Record<string, string>;
  let sql = `
    SELECT i.*, c.first_name || ' ' || c.last_name AS customer_name, c.organization_name AS customer_org
    FROM dj_invoices i
    LEFT JOIN contacts c ON c.id = i.customer_id
    WHERE 1=1
  `;
  const params: unknown[] = [];
  if (year) { sql += " AND strftime('%Y', i.invoice_date) = ?"; params.push(year); }
  if (status) { sql += ' AND i.status = ?'; params.push(status); }
  if (customer_id) { sql += ' AND i.customer_id = ?'; params.push(customer_id); }
  sql += ' ORDER BY i.created_at DESC';
  res.json(db.prepare(sql).all(...params));
});

// GET /api/dj/invoices/:id
router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: 'Ungültige ID' }); return; }
  const invoice = loadInvoice(id);
  if (!invoice) { res.status(404).json({ error: 'Rechnung nicht gefunden' }); return; }
  res.json(invoice);
});

// POST /api/dj/invoices — Neue Rechnung (Entwurf)
router.post('/', (req, res) => {
  const { customer_id, event_id, quote_id, subject, header_text, footer_text,
    payment_method, distance_km, trips, delivery_date, items } = req.body as Record<string, unknown>;

  if (!customer_id) { res.status(400).json({ error: 'customer_id erforderlich' }); return; }

  const settings = db.prepare("SELECT value FROM dj_settings WHERE key = 'tax'").get() as { value: string } | undefined;
  const tax = settings ? JSON.parse(settings.value) : { default_payment_term_days: 14 };
  // Lokales Datum verwenden — sonst zwischen 00:00 und 02:00 lokaler Zeit
  // (CEST) waere das Faelligkeitsdatum um 1 Tag verschoben.
  const dueDateStr = addDaysLocal(todayLocal(), tax.default_payment_term_days ?? 14);

  const txn = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO dj_invoices
        (customer_id, event_id, quote_id, subject, header_text, footer_text,
         payment_method, distance_km, trips, delivery_date, due_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      customer_id, event_id ?? null, quote_id ?? null, subject ?? null,
      header_text ?? null, footer_text ?? null, payment_method ?? null,
      distance_km ?? null, trips ?? 2, delivery_date ?? null,
      dueDateStr,
    );
    const newId = Number(result.lastInsertRowid);

    if (Array.isArray(items)) {
      const insertItem = db.prepare(`
        INSERT INTO dj_invoice_items
          (invoice_id, position, service_id, package_id, description, quantity, unit, price_net, tax_rate, discount_pct, total_net)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const item of items as Array<Record<string, unknown>>) {
        insertItem.run(
          newId, item.position, item.service_id ?? null, item.package_id ?? null,
          item.description, item.quantity ?? 1, item.unit ?? 'Stück',
          item.price_net, item.tax_rate ?? 19.0, item.discount_pct ?? 0, item.total_net,
        );
      }
      updateInvoiceTotals(newId);
    }
    return newId;
  });

  const newId = txn();
  logAudit(req, 'invoice', newId, 'create', undefined, req.body);
  res.status(201).json(loadInvoice(newId));
});

// PATCH /api/dj/invoices/:id — GoBD-Guard schützt finalisierte Rechnungen
router.patch('/:id', gobdGuardInvoice, (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM dj_invoices WHERE id = ?').get(id) as Record<string, unknown>;

  const { subject, header_text, footer_text, payment_method, delivery_date, due_date, distance_km, trips, items } =
    req.body as Record<string, unknown>;

  const txn = db.transaction(() => {
    db.prepare(`
      UPDATE dj_invoices SET
        subject = COALESCE(?, subject), header_text = COALESCE(?, header_text),
        footer_text = COALESCE(?, footer_text), payment_method = COALESCE(?, payment_method),
        delivery_date = COALESCE(?, delivery_date), due_date = COALESCE(?, due_date),
        distance_km = COALESCE(?, distance_km), trips = COALESCE(?, trips)
      WHERE id = ?
    `).run(
      subject ?? null, header_text ?? null, footer_text ?? null,
      payment_method ?? null, delivery_date ?? null, due_date ?? null,
      distance_km ?? null, trips ?? null, id,
    );

    if (Array.isArray(items)) {
      db.prepare('DELETE FROM dj_invoice_items WHERE invoice_id = ?').run(id);
      const insertItem = db.prepare(`
        INSERT INTO dj_invoice_items
          (invoice_id, position, service_id, package_id, description, quantity, unit, price_net, tax_rate, discount_pct, total_net)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const item of items as Array<Record<string, unknown>>) {
        insertItem.run(
          id, item.position, item.service_id ?? null, item.package_id ?? null,
          item.description, item.quantity ?? 1, item.unit ?? 'Stück',
          item.price_net, item.tax_rate ?? 19.0, item.discount_pct ?? 0, item.total_net,
        );
      }
      updateInvoiceTotals(id);
    }
  });
  txn();

  logAudit(req, 'invoice', id, 'update', existing, req.body);
  res.json(loadInvoice(id));
});

// POST /api/dj/invoices/:id/finalize — GoBD: Nummer vergeben, readonly
router.post('/:id/finalize', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: 'Ungültige ID' }); return; }

  const existing = db.prepare('SELECT * FROM dj_invoices WHERE id = ? AND finalized_at IS NULL').get(id);
  if (!existing) { res.status(409).json({ error: 'Rechnung nicht gefunden oder bereits finalisiert' }); return; }

  const txn = db.transaction(() => {
    const number = nextNumber('invoice');
    db.prepare(`
      UPDATE dj_invoices SET number = ?, status = 'offen', finalized_at = datetime('now')
      WHERE id = ?
    `).run(number, id);
    return number;
  });

  const number = txn();
  logAudit(req, 'invoice', id, 'finalize', existing, { number });
  res.json(loadInvoice(id));
});

// POST /api/dj/invoices/:id/cancel — Stornorechnung erstellen
router.post('/:id/cancel', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: 'Ungültige ID' }); return; }

  const original = db.prepare('SELECT * FROM dj_invoices WHERE id = ? AND finalized_at IS NOT NULL AND status != ?').get(id, 'storniert') as Record<string, unknown> | undefined;
  if (!original) { res.status(409).json({ error: 'Rechnung nicht gefunden, nicht finalisiert oder bereits storniert' }); return; }

  const items = db.prepare('SELECT * FROM dj_invoice_items WHERE invoice_id = ?').all(id) as Array<Record<string, unknown>>;

  const txn = db.transaction(() => {
    // Stornorechnung anlegen
    const result = db.prepare(`
      INSERT INTO dj_invoices
        (customer_id, event_id, quote_id, subject, header_text, footer_text,
         status, invoice_date, delivery_date, due_date, payment_method,
         distance_km, trips, is_cancellation, cancels_invoice_id,
         subtotal_net, tax_total, total_gross, finalized_at)
      VALUES (?, ?, ?, ?, ?, ?, 'offen', date('now'), ?, date('now'), ?,
              ?, ?, 1, ?, ?, ?, ?, datetime('now'))
    `).run(
      original.customer_id, original.event_id ?? null, original.quote_id ?? null,
      `Stornorechnung zu ${original.number ?? 'Entwurf'} vom ${original.invoice_date}`,
      `Diese Rechnung storniert ${original.number}.`,
      original.footer_text ?? null,
      original.delivery_date ?? null, original.payment_method ?? null,
      original.distance_km ?? null, original.trips ?? 2,
      id,
      -(original.subtotal_net as number), -(original.tax_total as number), -(original.total_gross as number),
    );
    const cancelId = Number(result.lastInsertRowid);
    const cancelNumber = nextNumber('credit_note');

    db.prepare("UPDATE dj_invoices SET number = ? WHERE id = ?").run(cancelNumber, cancelId);

    // Positionen mit negativen Beträgen kopieren (Trigger blockt erst NACH finalize)
    const insertItem = db.prepare(`
      INSERT INTO dj_invoice_items
        (invoice_id, position, service_id, package_id, description, quantity, unit, price_net, tax_rate, discount_pct, total_net)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of items) {
      insertItem.run(
        cancelId, item.position, item.service_id ?? null, item.package_id ?? null,
        item.description, item.quantity, item.unit, item.price_net,
        item.tax_rate, item.discount_pct, -(item.total_net as number),
      );
    }

    // Original als storniert markieren
    db.prepare(`
      UPDATE dj_invoices SET status = 'storniert', cancelled_by_invoice_id = ?, cancelled_at = datetime('now')
      WHERE id = ?
    `).run(cancelId, id);

    return cancelId;
  });

  const cancelId = txn();
  logAudit(req, 'invoice', id, 'cancel', original, { cancelled_by_invoice_id: cancelId });
  logAudit(req, 'invoice', cancelId, 'create', undefined, { is_cancellation: true, cancels_invoice_id: id });
  res.status(201).json(loadInvoice(cancelId));
});

// POST /api/dj/invoices/:id/pay — Zahlung erfassen
router.post('/:id/pay', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: 'Ungültige ID' }); return; }

  const invoice = db.prepare('SELECT * FROM dj_invoices WHERE id = ? AND finalized_at IS NOT NULL').get(id) as Record<string, unknown> | undefined;
  if (!invoice) { res.status(404).json({ error: 'Rechnung nicht gefunden oder nicht finalisiert' }); return; }

  const { payment_date, amount, method, reference, notes } = req.body as Record<string, unknown>;
  if (!payment_date || !amount) { res.status(400).json({ error: 'payment_date und amount erforderlich' }); return; }

  const txn = db.transaction(() => {
    db.prepare(
      'INSERT INTO dj_payments (invoice_id, payment_date, amount, method, reference, notes) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(id, payment_date, amount, method ?? null, reference ?? null, notes ?? null);

    const total = db.prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM dj_payments WHERE invoice_id = ?').get(id) as { total: number };
    const paidAmount = total.total;
    const gross = invoice.total_gross as number;
    const newStatus = paidAmount >= gross ? 'bezahlt' : 'teilbezahlt';

    db.prepare('UPDATE dj_invoices SET paid_amount = ?, status = ? WHERE id = ?').run(paidAmount, newStatus, id);
  });
  txn();

  logAudit(req, 'invoice', id, 'pay', { paid_before: invoice.paid_amount }, { amount, payment_date });
  res.json(loadInvoice(id));
});

export default router;
