import { Router } from 'express';
import db from '../db/connection';

const router = Router();

// GET /api/projects — mit optionalem client_name join
router.get('/', (_req, res) => {
  const rows = db.prepare(`
    SELECT p.*, c.name AS client_name
    FROM projects p
    LEFT JOIN clients c ON c.id = p.client_id
    ORDER BY p.name ASC
  `).all();
  res.json(rows);
});

// POST /api/projects
router.post('/', (req, res) => {
  const { name, client_id, hourly_rate, color } = req.body as {
    name?: string;
    client_id?: number | null;
    hourly_rate?: number | null;
    color?: string | null;
  };
  if (!name || !name.trim()) {
    res.status(400).json({ error: 'Name ist erforderlich' });
    return;
  }
  const result = db.prepare(
    'INSERT INTO projects (name, client_id, hourly_rate, color) VALUES (?, ?, ?, ?)'
  ).run(name.trim(), client_id ?? null, hourly_rate ?? null, color ?? null);

  const created = db.prepare(`
    SELECT p.*, c.name AS client_name
    FROM projects p
    LEFT JOIN clients c ON c.id = p.client_id
    WHERE p.id = ?
  `).get(result.lastInsertRowid);
  res.status(201).json(created);
});

export default router;
