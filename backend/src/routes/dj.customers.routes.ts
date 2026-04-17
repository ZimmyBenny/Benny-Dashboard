import { Router } from 'express';
import db from '../db/connection';

const router = Router();

// Hilfsfunktion: Kontaktdaten für DJ-Kontext zusammenbauen
function loadCustomer(id: number) {
  const contact = db.prepare('SELECT * FROM contacts WHERE id = ? AND deleted_at IS NULL').get(id);
  if (!contact) return null;
  const addresses = db.prepare("SELECT * FROM contact_addresses WHERE contact_id = ? ORDER BY is_primary DESC").all(id);
  const emails = db.prepare("SELECT * FROM contact_emails WHERE contact_id = ? ORDER BY is_primary DESC").all(id);
  const phones = db.prepare("SELECT * FROM contact_phones WHERE contact_id = ? ORDER BY is_primary DESC").all(id);
  const events = db.prepare(`
    SELECT id, title, event_type, event_date, status FROM dj_events
    WHERE customer_id = ? AND deleted_at IS NULL ORDER BY event_date DESC
  `).all(id);
  return { ...contact as object, addresses, emails, phones, events };
}

// GET /api/dj/customers — Alle Kontakte mit area = 'DJ'
router.get('/', (_req, res) => {
  const rows = db.prepare(`
    SELECT
      c.id, c.contact_kind, c.salutation, c.first_name, c.last_name,
      c.organization_name, c.customer_number, c.area,
      (SELECT street FROM contact_addresses WHERE contact_id = c.id AND is_primary = 1 LIMIT 1) AS street,
      (SELECT postal_code FROM contact_addresses WHERE contact_id = c.id AND is_primary = 1 LIMIT 1) AS postal_code,
      (SELECT city FROM contact_addresses WHERE contact_id = c.id AND is_primary = 1 LIMIT 1) AS city,
      (SELECT country FROM contact_addresses WHERE contact_id = c.id AND is_primary = 1 LIMIT 1) AS country,
      (SELECT email FROM contact_emails WHERE contact_id = c.id AND is_primary = 1 LIMIT 1) AS email,
      (SELECT phone FROM contact_phones WHERE contact_id = c.id AND is_primary = 1 LIMIT 1) AS phone,
      (SELECT COUNT(*) FROM dj_events WHERE customer_id = c.id AND deleted_at IS NULL) AS event_count
    FROM contacts c
    WHERE c.area = 'DJ' AND (c.is_archived = 0 OR c.is_archived IS NULL)
    ORDER BY c.last_name, c.first_name, c.organization_name
  `).all();
  res.json(rows);
});

// GET /api/dj/customers/search?q=... — Suche für Picker (alle Kontakte, nicht nur DJ)
router.get('/search', (req, res) => {
  const q = String(req.query.q ?? '').trim();
  if (!q) { res.json([]); return; }

  const like = `%${q}%`;
  const rows = db.prepare(`
    SELECT
      c.id, c.contact_kind, c.salutation, c.first_name, c.last_name,
      c.organization_name, c.customer_number, c.area,
      (SELECT city FROM contact_addresses WHERE contact_id = c.id AND is_primary = 1 LIMIT 1) AS city,
      (SELECT email FROM contact_emails WHERE contact_id = c.id AND is_primary = 1 LIMIT 1) AS email
    FROM contacts c
    WHERE (c.is_archived = 0 OR c.is_archived IS NULL)
      AND (
        c.first_name LIKE ? OR c.last_name LIKE ?
        OR c.organization_name LIKE ? OR c.customer_number LIKE ?
      )
    ORDER BY c.last_name, c.first_name, c.organization_name
    LIMIT 20
  `).all(like, like, like, like);
  res.json(rows);
});

// GET /api/dj/customers/:id
router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: 'Ungültige ID' }); return; }

  const customer = loadCustomer(id);
  if (!customer) { res.status(404).json({ error: 'Kontakt nicht gefunden' }); return; }
  res.json(customer);
});

export default router;
