import { Router } from 'express';
import db from '../db/connection';

const router = Router();

// GET /api/tasks?status=&area=&search=&priority=&all_done=&contact_id=
router.get('/', (req, res) => {
  const { status, area, search, priority, all_done, contact_id } = req.query as {
    status?: string;
    area?: string;
    search?: string;
    priority?: string;
    all_done?: string;
    contact_id?: string;
  };

  let sql = `
    SELECT t.*,
      wp.title AS source_page_title,
      CASE WHEN c.contact_kind = 'person'
        THEN COALESCE(NULLIF(TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')), ''), c.organization_name)
        ELSE c.organization_name
      END AS contact_name
    FROM tasks t
    LEFT JOIN workbook_pages wp ON t.source_page_id = wp.id
    LEFT JOIN contacts c ON t.contact_id = c.id
    WHERE 1=1`;
  const params: (string | number)[] = [];

  if (status) {
    sql += ' AND t.status = ?';
    params.push(status);
  }
  if (area) {
    sql += ' AND t.area = ?';
    params.push(area);
  }
  if (priority) {
    sql += ' AND t.priority = ?';
    params.push(priority);
  }
  if (contact_id) {
    sql += ' AND t.contact_id = ?';
    params.push(Number(contact_id));
  }
  if (search) {
    const like = `%${search}%`;
    sql += ' AND (t.title LIKE ? OR t.description LIKE ? OR t.tags LIKE ? OR t.project_or_customer LIKE ?)';
    params.push(like, like, like, like);
  }

  // For archived status: all, sorted by completed_at DESC
  // For done status: only last 20 unless all_done=true
  if (status === 'archived') {
    sql += ' ORDER BY t.completed_at DESC';
  } else if (status === 'done' && all_done !== 'true') {
    sql += ' ORDER BY t.completed_at DESC LIMIT 20';
  } else {
    sql += ' ORDER BY t.position ASC';
  }

  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

// GET /api/tasks/stats
router.get('/stats', (_req, res) => {
  const stats = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END), 0)          AS open_count,
      COALESCE(SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END), 0)   AS in_progress_count,
      COALESCE(SUM(CASE WHEN status = 'waiting' THEN 1 ELSE 0 END), 0)        AS waiting_count,
      COALESCE(SUM(CASE WHEN status = 'done' AND updated_at >= date('now', '-7 days') THEN 1 ELSE 0 END), 0) AS done_this_week,
      COALESCE(SUM(CASE WHEN due_date < date('now') AND status != 'done' THEN 1 ELSE 0 END), 0) AS overdue_count,
      COALESCE(SUM(CASE WHEN due_date >= date('now', 'weekday 0', '-7 days') AND due_date <= date('now', 'weekday 0', '+0 days') AND status != 'done' THEN 1 ELSE 0 END), 0) AS due_this_week
    FROM tasks
  `).get();
  res.json(stats);
});

// GET /api/tasks/due-reminders
router.get('/due-reminders', (_req, res) => {
  const rows = db.prepare(`
    SELECT t.*, wp.title AS source_page_title
    FROM tasks t
    LEFT JOIN workbook_pages wp ON t.source_page_id = wp.id
    WHERE t.has_reminder = 1
      AND t.reminder_at IS NOT NULL
      AND datetime(t.reminder_at) <= datetime('now')
      AND t.status NOT IN ('done', 'archived')
    ORDER BY t.reminder_at ASC
  `).all();
  res.json(rows);
});

// GET /api/tasks/:id
router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  const row = db.prepare(
    `SELECT t.*,
      wp.title AS source_page_title,
      CASE WHEN c.contact_kind = 'person'
        THEN COALESCE(NULLIF(TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')), ''), c.organization_name)
        ELSE c.organization_name
      END AS contact_name
     FROM tasks t
     LEFT JOIN workbook_pages wp ON t.source_page_id = wp.id
     LEFT JOIN contacts c ON t.contact_id = c.id
     WHERE t.id = ?`
  ).get(id);
  if (!row) { res.status(404).json({ error: 'Task nicht gefunden' }); return; }
  res.json(row);
});

// POST /api/tasks
router.post('/', (req, res) => {
  const {
    title, description, status, area, priority, due_date, tags,
    project_or_customer, notes, start_date, reminder_at, has_reminder,
    create_calendar_entry, calendar_event_id, calendar_sync_status,
    is_all_day, estimated_duration, status_note, source_page_id, contact_id,
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
    source_page_id?: number | null;
    contact_id?: number | null;
  };

  if (!title || !title.trim()) {
    res.status(400).json({ error: 'Titel ist erforderlich' });
    return;
  }

  if (status_note && status_note.length > 500) {
    res.status(400).json({ error: 'status_note darf maximal 500 Zeichen lang sein' });
    return;
  }

  // Threat T-rwz-01: contact_id als Number parsen, null erlauben
  const resolvedContactId = contact_id != null ? Number(contact_id) : null;

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
      is_all_day, estimated_duration, status_note, source_page_id, contact_id, position
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    source_page_id ?? null,
    resolvedContactId,
    position,
  );

  // Activity-Log: Task mit Kontakt verknüpft
  if (resolvedContactId != null) {
    db.prepare(`
      INSERT INTO contact_activity_log (contact_id, event_type, message, related_entity_type, related_entity_id)
      VALUES (?, 'task_linked', ?, 'task', ?)
    `).run(resolvedContactId, `Aufgabe verknüpft: ${title.trim()}`, result.lastInsertRowid);
  }

  const created = db.prepare(
    `SELECT t.*,
      wp.title AS source_page_title,
      CASE WHEN c.contact_kind = 'person'
        THEN COALESCE(NULLIF(TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')), ''), c.organization_name)
        ELSE c.organization_name
      END AS contact_name
     FROM tasks t
     LEFT JOIN workbook_pages wp ON t.source_page_id = wp.id
     LEFT JOIN contacts c ON t.contact_id = c.id
     WHERE t.id = ?`
  ).get(result.lastInsertRowid);
  res.status(201).json(created);
});

// PUT /api/tasks/:id
router.put('/:id', (req, res) => {
  const id = Number(req.params.id);

  const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as {
    status: string;
    contact_id: number | null;
    title: string;
    status_note: string | null;
  } | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Task nicht gefunden' });
    return;
  }

  const {
    title, description, status, area, priority, due_date, tags,
    project_or_customer, notes, start_date, reminder_at, has_reminder,
    create_calendar_entry, calendar_event_id, calendar_sync_status,
    is_all_day, estimated_duration, position, status_note, source_page_id, contact_id,
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
    source_page_id?: number | null;
    contact_id?: number | null;
  };

  if (status_note && status_note.length > 500) {
    res.status(400).json({ error: 'status_note darf maximal 500 Zeichen lang sein' });
    return;
  }

  // Threat T-rwz-01: contact_id als Number parsen, null erlauben
  const newContactId = contact_id !== undefined ? (contact_id != null ? Number(contact_id) : null) : existing.contact_id;
  const oldContactId = existing.contact_id;

  const newStatus = status ?? existing.status;
  const taskTitle = title?.trim() || existing.title;

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
        estimated_duration = ?, status_note = ?, source_page_id = COALESCE(?, source_page_id),
        contact_id = ?,
        position = COALESCE(?, position),
        completed_at = ${completedAtExpr},
        updated_at = datetime('now')
    WHERE id = ?
  `).run(
    taskTitle,
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
    source_page_id !== undefined ? (source_page_id ?? null) : null,
    newContactId,
    position ?? null,
    id,
  );

  // Activity-Log: Kontakt-Verknüpfungsänderung
  if (contact_id !== undefined) {
    if (newContactId != null && newContactId !== oldContactId) {
      // Neuer Kontakt gesetzt
      db.prepare(`
        INSERT INTO contact_activity_log (contact_id, event_type, message, related_entity_type, related_entity_id)
        VALUES (?, 'task_linked', ?, 'task', ?)
      `).run(newContactId, `Aufgabe verknüpft: ${taskTitle}`, id);
    }
    if (oldContactId != null && oldContactId !== newContactId) {
      // Alter Kontakt entfernt
      db.prepare(`
        INSERT INTO contact_activity_log (contact_id, event_type, message, related_entity_type, related_entity_id)
        VALUES (?, 'task_unlinked', ?, 'task', ?)
      `).run(oldContactId, `Aufgabe entfernt: ${taskTitle}`, id);
    }
  }

  // Activity-Log: Status-Änderung mit Kontakt-Bezug
  const activeContactId = newContactId ?? oldContactId;
  if (activeContactId != null && status !== undefined) {
    if (newStatus === 'done' && existing.status !== 'done') {
      db.prepare(`
        INSERT INTO contact_activity_log (contact_id, event_type, message, related_entity_type, related_entity_id)
        VALUES (?, 'task_completed', ?, 'task', ?)
      `).run(activeContactId, `Aufgabe erledigt: ${taskTitle}`, id);
    } else if (newStatus !== 'done' && existing.status === 'done') {
      db.prepare(`
        INSERT INTO contact_activity_log (contact_id, event_type, message, related_entity_type, related_entity_id)
        VALUES (?, 'task_reopened', ?, 'task', ?)
      `).run(activeContactId, `Aufgabe wiedereröffnet: ${taskTitle}`, id);
    }
  }

  const updated = db.prepare(
    `SELECT t.*,
      wp.title AS source_page_title,
      CASE WHEN c.contact_kind = 'person'
        THEN COALESCE(NULLIF(TRIM(COALESCE(c.first_name,'') || ' ' || COALESCE(c.last_name,'')), ''), c.organization_name)
        ELSE c.organization_name
      END AS contact_name
     FROM tasks t
     LEFT JOIN workbook_pages wp ON t.source_page_id = wp.id
     LEFT JOIN contacts c ON t.contact_id = c.id
     WHERE t.id = ?`
  ).get(id);
  res.json(updated);
});

// PATCH /api/tasks/reorder
router.patch('/reorder', (req, res) => {
  const { updates } = req.body as {
    updates: { id: number; status: string; position: number; status_note?: string | null }[];
  };

  if (!Array.isArray(updates) || updates.length === 0) {
    res.status(400).json({ error: 'updates Array ist erforderlich' });
    return;
  }

  const reorder = db.transaction((items: { id: number; status: string; position: number; status_note?: string | null }[]) => {
    const stmtWithNote = db.prepare(
      `UPDATE tasks SET status = ?, position = ?, status_note = ?, updated_at = datetime('now') WHERE id = ?`
    );
    const stmtWithoutNote = db.prepare(
      `UPDATE tasks SET status = ?, position = ?, updated_at = datetime('now') WHERE id = ?`
    );
    for (const u of items) {
      if ('status_note' in u) {
        stmtWithNote.run(u.status, u.position, u.status_note ?? null, u.id);
      } else {
        stmtWithoutNote.run(u.status, u.position, u.id);
      }
    }
  });

  reorder(updates);
  res.json({ ok: true });
});

// PATCH /api/tasks/:id/status
router.patch('/:id/status', (req, res) => {
  const id = Number(req.params.id);
  const { status, position, status_note } = req.body as { status: string; position: number; status_note?: string | null };

  const existing = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as {
    status: string;
    contact_id: number | null;
    title: string;
  } | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Task nicht gefunden' });
    return;
  }

  if (status_note && status_note.length > 500) {
    res.status(400).json({ error: 'status_note darf maximal 500 Zeichen lang sein' });
    return;
  }

  let completedAtExpr = 'completed_at';
  if (status === 'archived') {
    completedAtExpr = 'completed_at'; // behalte vorhandenen Wert
  } else if (status === 'done' && existing.status !== 'done') {
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

  // Activity-Log: Status-Änderung wenn Kontakt verknüpft
  if (existing.contact_id != null) {
    if (status === 'done' && existing.status !== 'done') {
      db.prepare(`
        INSERT INTO contact_activity_log (contact_id, event_type, message, related_entity_type, related_entity_id)
        VALUES (?, 'task_completed', ?, 'task', ?)
      `).run(existing.contact_id, `Aufgabe erledigt: ${existing.title}`, id);
    } else if (status !== 'done' && existing.status === 'done') {
      db.prepare(`
        INSERT INTO contact_activity_log (contact_id, event_type, message, related_entity_type, related_entity_id)
        VALUES (?, 'task_reopened', ?, 'task', ?)
      `).run(existing.contact_id, `Aufgabe wiedereröffnet: ${existing.title}`, id);
    }
  }

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
  res.json({ message: 'Task gelöscht' });
});

export default router;
