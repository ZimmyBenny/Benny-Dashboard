import { Router } from 'express';
import db from '../db/connection';

const router = Router();

interface ClientRow {
  id: number;
  name: string;
  created_at: string;
}

// GET /api/clients
router.get('/', (_req, res) => {
  const rows = db.prepare('SELECT * FROM clients ORDER BY name ASC').all() as ClientRow[];
  res.json(rows);
});

// POST /api/clients
router.post('/', (req, res) => {
  const { name } = req.body as { name?: string };
  if (!name || !name.trim()) {
    res.status(400).json({ error: 'Name ist erforderlich' });
    return;
  }
  const existing = db.prepare('SELECT id FROM clients WHERE name = ?').get(name.trim());
  if (existing) {
    res.status(409).json({ error: 'Kunde existiert bereits' });
    return;
  }
  const result = db.prepare('INSERT INTO clients (name) VALUES (?)').run(name.trim());
  const created = db.prepare('SELECT * FROM clients WHERE id = ?').get(result.lastInsertRowid) as ClientRow;
  res.status(201).json(created);
});

export default router;
