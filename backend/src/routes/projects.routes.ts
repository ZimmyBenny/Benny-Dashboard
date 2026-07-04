import { Router } from 'express';
import db from '../db/connection';

const router = Router();

// GET /api/projects — mit optionalem client_name join + entry_count (fuer Loesch-Confirm)
router.get('/', (_req, res) => {
  const rows = db.prepare(`
    SELECT p.*, c.name AS client_name,
           (SELECT COUNT(*) FROM time_entries te WHERE te.project_id = p.id) AS entry_count
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

// PATCH /api/projects/:id — umbenennen
router.patch('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'Ungültige Projekt-ID' });
    return;
  }
  const existing = db.prepare('SELECT id FROM projects WHERE id = ?').get(id);
  if (!existing) {
    res.status(404).json({ error: 'Projekt nicht gefunden' });
    return;
  }
  const { name } = req.body as { name?: string };
  if (!name || !name.trim()) {
    res.status(400).json({ error: 'Name ist erforderlich' });
    return;
  }
  db.prepare('UPDATE projects SET name = ? WHERE id = ?').run(name.trim(), id);
  const updated = db.prepare(`
    SELECT p.*, c.name AS client_name,
           (SELECT COUNT(*) FROM time_entries te WHERE te.project_id = p.id) AS entry_count
    FROM projects p
    LEFT JOIN clients c ON c.id = p.client_id
    WHERE p.id = ?
  `).get(id);
  res.json(updated);
});

// DELETE /api/projects/:id — Eintraege behalten ihre Zeiten (FK ON DELETE SET NULL)
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'Ungültige Projekt-ID' });
    return;
  }
  const existing = db.prepare('SELECT id FROM projects WHERE id = ?').get(id);
  if (!existing) {
    res.status(404).json({ error: 'Projekt nicht gefunden' });
    return;
  }
  const count = db
    .prepare('SELECT COUNT(*) AS c FROM time_entries WHERE project_id = ?')
    .get(id) as { c: number };
  db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  res.json({ ok: true, entriesKept: count.c });
});

export default router;
