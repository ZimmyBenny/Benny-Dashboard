import { Router } from 'express';
import db from '../db/connection';
import { logAudit } from '../services/audit.service';

const router = Router();

// GET /api/dj/services
router.get('/', (_req, res) => {
  const services = db.prepare(
    'SELECT * FROM dj_services WHERE active = 1 ORDER BY category, sort_order, name'
  ).all();
  res.json(services);
});

// GET /api/dj/services/all (inkl. inaktive)
router.get('/all', (_req, res) => {
  const services = db.prepare('SELECT * FROM dj_services ORDER BY category, sort_order, name').all();
  res.json(services);
});

// GET /api/dj/packages
router.get('/packages', (_req, res) => {
  const packages = db.prepare('SELECT * FROM dj_packages WHERE active = 1 ORDER BY sort_order').all();
  const result = (packages as Array<{ id: number } & Record<string, unknown>>).map((pkg) => {
    const services = db.prepare(`
      SELECT s.*, ps.quantity FROM dj_services s
      JOIN dj_package_services ps ON ps.service_id = s.id
      WHERE ps.package_id = ?
    `).all(pkg.id);
    return { ...pkg, services };
  });
  res.json(result);
});

// POST /api/dj/services
router.post('/', (req, res) => {
  const { category, name, description, unit, price_net, tax_rate = 19.0, sort_order = 0 } =
    req.body as Record<string, unknown>;

  if (!category || !name || price_net == null) {
    res.status(400).json({ error: 'category, name, price_net erforderlich' });
    return;
  }

  const result = db.prepare(`
    INSERT INTO dj_services (category, name, description, unit, price_net, tax_rate, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(category, name, description ?? null, unit ?? 'Stück', price_net, tax_rate, sort_order);

  const newId = Number(result.lastInsertRowid);
  logAudit(req, 'service', newId, 'create', undefined, req.body);
  res.status(201).json(db.prepare('SELECT * FROM dj_services WHERE id = ?').get(newId));
});

// PATCH /api/dj/services/:id
router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: 'Ungültige ID' }); return; }

  const existing = db.prepare('SELECT * FROM dj_services WHERE id = ?').get(id);
  if (!existing) { res.status(404).json({ error: 'Leistung nicht gefunden' }); return; }

  const { category, name, description, unit, price_net, tax_rate, sort_order, active } = req.body as Record<string, unknown>;
  db.prepare(`
    UPDATE dj_services SET
      category = COALESCE(?, category), name = COALESCE(?, name),
      description = COALESCE(?, description), unit = COALESCE(?, unit),
      price_net = COALESCE(?, price_net), tax_rate = COALESCE(?, tax_rate),
      sort_order = COALESCE(?, sort_order), active = COALESCE(?, active),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(category ?? null, name ?? null, description ?? null, unit ?? null,
    price_net ?? null, tax_rate ?? null, sort_order ?? null, active ?? null, id);

  logAudit(req, 'service', id, 'update', existing, req.body);
  res.json(db.prepare('SELECT * FROM dj_services WHERE id = ?').get(id));
});

// DELETE /api/dj/services/:id — Deaktivieren (Preis-Versionierung)
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: 'Ungültige ID' }); return; }

  const existing = db.prepare('SELECT * FROM dj_services WHERE id = ?').get(id);
  if (!existing) { res.status(404).json({ error: 'Leistung nicht gefunden' }); return; }

  db.prepare("UPDATE dj_services SET active = 0, updated_at = datetime('now') WHERE id = ?").run(id);
  logAudit(req, 'service', id, 'deactivate', existing, { active: 0 });
  res.json({ ok: true });
});

// POST /api/dj/packages
router.post('/packages', (req, res) => {
  const { name, description, price_net, tax_rate = 19.0, sort_order = 0, service_ids } =
    req.body as { name: string; description?: string; price_net: number; tax_rate?: number; sort_order?: number; service_ids?: number[] };

  if (!name || price_net == null) {
    res.status(400).json({ error: 'name und price_net erforderlich' });
    return;
  }

  const txn = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO dj_packages (name, description, price_net, tax_rate, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `).run(name, description ?? null, price_net, tax_rate, sort_order);

    const pkgId = Number(result.lastInsertRowid);

    if (Array.isArray(service_ids)) {
      const insertLink = db.prepare(
        'INSERT OR IGNORE INTO dj_package_services (package_id, service_id, quantity) VALUES (?, ?, 1)'
      );
      for (const sid of service_ids) insertLink.run(pkgId, sid);
    }
    return pkgId;
  });

  const pkgId = txn();
  logAudit(req, 'package', pkgId, 'create', undefined, req.body);
  res.status(201).json(db.prepare('SELECT * FROM dj_packages WHERE id = ?').get(pkgId));
});

export default router;
