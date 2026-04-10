import { Router } from 'express';
import db from '../db/connection';

const router = Router();

// GET /api/tasks?status=&area=&search=&priority=&all_done=
router.get('/', (req, res) => {
  const { status, area, search, priority, all_done } = req.query as {
    status?: string;
    area?: string;
    search?: string;
    priority?: string;
    all_done?: string;
  };

  let sql = `SELECT * FROM tasks WHERE 1=1`;
  const params: (string | number)[] = [];

  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  if (area) {
    sql += ' AND area = ?';
    params.push(area);
  }
  if (priority) {
    sql += ' AND priority = ?';
    params.push(priority);
  }
  if (search) {
    const like = `%${search}%`;
    sql += ' AND (title LIKE ? OR description LIKE ? OR tags LIKE ? OR project_or_customer LIKE ?)';
    params.push(like, like, like, like);
  }

  // For done status: only last 20 unless all_done=true
  if (status === 'done' && all_done !== 'true') {
    sql += ' ORDER BY completed_at DESC LIMIT 20';
  } else {
    sql += ' ORDER BY position ASC';
  }

  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

// GET /api/tasks/stats
router.get('/stats', (_req, res) => {
  const stats = db.prepare(`
    SELECT
      SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END)          AS open_count,
      SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END)   AS in_progress_count,
      SUM(CASE WHEN status = 'waiting' THEN 1 ELSE 0 END)        AS waiting_count,
      SUM(CASE WHEN status = 'done' AND updated_at >= date('now', '-7 days') THEN 1 ELSE 0 END) AS done_this_week,
      SUM(CASE WHEN due_date < date('now') AND status != 'done' THEN 1 ELSE 0 END) AS overdue_count
    FROM tasks
  `).get();
  res.json(stats);
});

// POST /api/tasks
router.post('/', (req, res) => {
  const {
    title, description, status, area, priority, due_date, tags,
    project_or_customer, notes, start_date, reminder_at, has_reminder,
    create_calendar_entry, calendar_event_id, calendar_sync_status,
    is_all_day, estimated_duration, status_note,
  } = req.body as {
    title?: string;
    description?: string | null;
    status?: string;
    area?: string | null;
    priority?: string;
    due_date?: string | null;
    tags?: string | null;
    project_or_customer?: string | null;
    notes?: string | null;
    start_date?: string | null;
    reminder_at?: string | null;
    has_reminder?: number;
    create_calendar_entry?: number;
    calendar_event_id?: string | null;
    calendar_sync_status?: string | null;
    is_all_day?: number;
    estimated_duration?: number | null;
    status_note?: string | null;
  };

  if (!title || !title.trim()) {
    res.status(400).json({ error: 'Titel ist erforderlich' });
    return;
  }

  if (status_note && status_note.length > 500) {
    res.status(400).json({ error: 'status_note darf maximal 500 Zeichen lang sein' });
    return;
  }

  const resolvedStatus = status ?? 'open';

  // Auto-position: MAX(position) + 1 within same status
  const maxPos = db.prepare(
    `SELECT COALESCE(MAX(position), -1) AS maxPos FROM tasks WHERE status = ?`
  ).get(resolvedStatus) as { maxPos: number };
  const position = maxPos.maxPos + 1;

  const result = db.prepare(`
    INSERT INTO tasks (
      title, description, status, area, priority, due_date, tags,
      project_or_customer, notes, start_date, reminder_at, has_reminder,
      create_calendar_entry, calendar_event_id, calendar_sync_status,
      is_all_day, estimated_duration, status_note, position
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    title.trim(),
    description ?? null,
    resolvedStatus,
    area ?? null,
    priority ?? 'medium',
    due_date ?? null,
    tags ?? null,
    project_or_customer ?? null,
    notes ?? null,
    start_date ?? null,
    reminder_at ?? null,
    has_reminder ?? 0,
    create_calendar_entry ?? 0,
    calendar_event_id ?? null,
    calendar_sync_status ?? null,
    is_all_day ?? 0,
    estimated_duration ?? null,
    status_note ?? null,
    position,
  );

  const created = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(created);
});

// PUT /api/tasks/:id
router.put('/:id', (req, res) => {
  const id = Number(req.params.id);

  const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as { status: string } | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Task nicht gefunden' });
    return;
  }

  const {
    title, description, status, area, priority, due_date, tags,
    project_or_customer, notes, start_date, reminder_at, has_reminder,
    create_calendar_entry, calendar_event_id, calendar_sync_status,
    is_all_day, estimated_duration, position, status_note,
  } = req.body as {
    title?: string;
    description?: string | null;
    status?: string;
    area?: string | null;
    priority?: string;
    due_date?: string | null;
    tags?: string | null;
    project_or_customer?: string | null;
    notes?: string | null;
    start_date?: string | null;
    reminder_at?: string | null;
    has_reminder?: number;
    create_calendar_entry?: number;
    calendar_event_id?: string | null;
    calendar_sync_status?: string | null;
    is_all_day?: number;
    estimated_duration?: number | null;
    position?: number;
    status_note?: string | null;
  };

  if (status_note && status_note.length > 500) {
    res.status(400).json({ error: 'status_note darf maximal 500 Zeichen lang sein' });
    return;
  }

  const newStatus = status ?? existing.status;
  let completedAtExpr = 'completed_at';
  if (newStatus === 'done' && existing.status !== 'done') {
    completedAtExpr = "datetime('now')";
  } else if (newStatus !== 'done' && existing.status === 'done') {
    completedAtExpr = 'NULL';
  }

  db.prepare(`
    UPDATE tasks
    SET title = ?, description = ?, status = ?, area = ?, priority = ?,
        due_date = ?, tags = ?, project_or_customer = ?, notes = ?,
        start_date = ?, reminder_at = ?, has_reminder = ?, create_calendar_entry = ?,
        calendar_event_id = ?, calendar_sync_status = ?, is_all_day = ?,
        estimated_duration = ?, status_note = ?, position = COALESCE(?, position),
        completed_at = ${completedAtExpr},
        updated_at = datetime('now')
    WHERE id = ?
  `).run(
    title ?? '',
    description ?? null,
    newStatus,
    area ?? null,
    priority ?? 'medium',
    due_date ?? null,
    tags ?? null,
    project_or_customer ?? null,
    notes ?? null,
    start_date ?? null,
    reminder_at ?? null,
    has_reminder ?? 0,
    create_calendar_entry ?? 0,
    calendar_event_id ?? null,
    calendar_sync_status ?? null,
    is_all_day ?? 0,
    estimated_duration ?? null,
    status_note !== undefined ? (status_note ?? null) : (existing as Record<string, unknown>).status_note ?? null,
    position ?? null,
    id,
  );

  const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  res.json(updated);
});

// PATCH /api/tasks/reorder
router.patch('/reorder', (req, res) => {
  const { updates } = req.body as {
    updates: { id: number; status: string; position: number }[];
  };

  if (!Array.isArray(updates) || updates.length === 0) {
    res.status(400).json({ error: 'updates Array ist erforderlich' });
    return;
  }

  const reorder = db.transaction((items: { id: number; status: string; position: number }[]) => {
    const stmt = db.prepare(
      `UPDATE tasks SET status = ?, position = ?, updated_at = datetime('now') WHERE id = ?`
    );
    for (const u of items) {
      stmt.run(u.status, u.position, u.id);
    }
  });

  reorder(updates);
  res.json({ ok: true });
});

// PATCH /api/tasks/:id/status
router.patch('/:id/status', (req, res) => {
  const id = Number(req.params.id);
  const { status, position, status_note } = req.body as { status: string; position: number; status_note?: string | null };

  const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as { status: string } | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Task nicht gefunden' });
    return;
  }

  if (status_note && status_note.length > 500) {
    res.status(400).json({ error: 'status_note darf maximal 500 Zeichen lang sein' });
    return;
  }

  let completedAtExpr = 'completed_at';
  if (status === 'done' && existing.status !== 'done') {
    completedAtExpr = "datetime('now')";
  } else if (status !== 'done' && existing.status === 'done') {
    completedAtExpr = 'NULL';
  }

  db.prepare(`
    UPDATE tasks
    SET status = ?, position = ?, status_note = COALESCE(?, status_note),
        completed_at = ${completedAtExpr}, updated_at = datetime('now')
    WHERE id = ?
  `).run(status, position, status_note ?? null, id);

  const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  res.json(updated);
});

// DELETE /api/tasks/:id
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.prepare('SELECT id FROM tasks WHERE id = ?').get(id);
  if (!existing) {
    res.status(404).json({ error: 'Task nicht gefunden' });
    return;
  }
  db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  res.json({ message: 'Task geloescht' });
});

export default router;
