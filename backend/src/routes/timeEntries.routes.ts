import { Router } from 'express';
import db from '../db/connection';

const router = Router();

// GET /api/time-entries?project_id=&client_id=&contact_id=&date_from=&date_to=
router.get('/', (req, res) => {
  const { project_id, client_id, contact_id, date_from, date_to } = req.query as {
    project_id?: string;
    client_id?: string;
    contact_id?: string;
    date_from?: string;
    date_to?: string;
  };

  let sql = `
    SELECT
      te.*,
      p.name  AS project_name,
      c.name  AS client_name,
      te.contact_id,
      CASE WHEN ct.contact_kind = 'person'
        THEN COALESCE(ct.first_name || ' ' || ct.last_name, ct.organization_name)
        ELSE ct.organization_name
      END AS contact_name
    FROM time_entries te
    LEFT JOIN projects p  ON p.id  = te.project_id
    LEFT JOIN clients  c  ON c.id  = te.client_id
    LEFT JOIN contacts ct ON ct.id = te.contact_id
    WHERE 1=1
  `;
  const params: (string | number)[] = [];

  if (project_id) {
    sql += ' AND te.project_id = ?';
    params.push(Number(project_id));
  }
  if (client_id) {
    sql += ' AND te.client_id = ?';
    params.push(Number(client_id));
  }
  if (contact_id) {
    sql += ' AND te.contact_id = ?';
    params.push(Number(contact_id));
  }
  if (date_from) {
    sql += ' AND te.date >= ?';
    params.push(date_from);
  }
  if (date_to) {
    sql += ' AND te.date <= ?';
    params.push(date_to);
  }
  sql += ' ORDER BY te.date DESC, te.created_at DESC';

  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

// POST /api/time-entries
router.post('/', (req, res) => {
  const { project_id, client_id, contact_id, title, note, date, duration_seconds, start_time, end_time } = req.body as {
    project_id?: number | null;
    client_id?: number | null;
    contact_id?: number | null;
    title?: string;
    note?: string | null;
    date?: string;
    duration_seconds?: number;
    start_time?: string | null;
    end_time?: string | null;
  };

  if (!title || !title.trim()) {
    res.status(400).json({ error: 'Titel ist erforderlich' });
    return;
  }
  if (!date) {
    res.status(400).json({ error: 'Datum ist erforderlich' });
    return;
  }
  if (typeof duration_seconds !== 'number' || duration_seconds < 0) {
    res.status(400).json({ error: 'Dauer ist erforderlich' });
    return;
  }

  const result = db.prepare(`
    INSERT INTO time_entries (project_id, client_id, contact_id, title, note, date, duration_seconds, start_time, end_time)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    project_id ?? null,
    client_id ?? null,
    contact_id ?? null,
    title.trim(),
    note ?? null,
    date,
    duration_seconds,
    start_time ?? null,
    end_time ?? null,
  );

  const created = db.prepare(`
    SELECT te.*, p.name AS project_name, c.name AS client_name,
      CASE WHEN ct.contact_kind = 'person'
        THEN COALESCE(ct.first_name || ' ' || ct.last_name, ct.organization_name)
        ELSE ct.organization_name
      END AS contact_name
    FROM time_entries te
    LEFT JOIN projects p  ON p.id  = te.project_id
    LEFT JOIN clients  c  ON c.id  = te.client_id
    LEFT JOIN contacts ct ON ct.id = te.contact_id
    WHERE te.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json(created);
});

// PUT /api/time-entries/:id
router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const { project_id, client_id, contact_id, title, note, date, duration_seconds, start_time, end_time } = req.body as {
    project_id?: number | null;
    client_id?: number | null;
    contact_id?: number | null;
    title?: string;
    note?: string | null;
    date?: string;
    duration_seconds?: number;
    start_time?: string | null;
    end_time?: string | null;
  };

  const existing = db.prepare('SELECT id FROM time_entries WHERE id = ?').get(id);
  if (!existing) {
    res.status(404).json({ error: 'Eintrag nicht gefunden' });
    return;
  }

  db.prepare(`
    UPDATE time_entries
    SET project_id = ?, client_id = ?, contact_id = ?, title = ?, note = ?, date = ?, duration_seconds = ?,
        start_time = ?, end_time = ?
    WHERE id = ?
  `).run(
    project_id ?? null,
    client_id ?? null,
    contact_id ?? null,
    title ?? '',
    note ?? null,
    date ?? '',
    duration_seconds ?? 0,
    start_time ?? null,
    end_time ?? null,
    id,
  );

  const updated = db.prepare(`
    SELECT te.*, p.name AS project_name, c.name AS client_name,
      CASE WHEN ct.contact_kind = 'person'
        THEN COALESCE(ct.first_name || ' ' || ct.last_name, ct.organization_name)
        ELSE ct.organization_name
      END AS contact_name
    FROM time_entries te
    LEFT JOIN projects p  ON p.id  = te.project_id
    LEFT JOIN clients  c  ON c.id  = te.client_id
    LEFT JOIN contacts ct ON ct.id = te.contact_id
    WHERE te.id = ?
  `).get(id);

  res.json(updated);
});

// DELETE /api/time-entries/:id
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM time_entries WHERE id = ?').get(id);
  if (!existing) {
    res.status(404).json({ error: 'Eintrag nicht gefunden' });
    return;
  }
  db.prepare('DELETE FROM time_entries WHERE id = ?').run(id);
  res.json({ message: 'Eintrag gelöscht' });
});

export default router;
