import { Router } from 'express';
import db from '../db/connection';

const router = Router();

interface QuickLinkRow {
  id: number;
  label: string;
  url: string;
  sort_order: number;
  visible: number;
  created_at: string;
}

// GET / — alle Links sortiert nach sort_order; optional ?visible=true filtert auf visible=1
router.get('/', (req, res) => {
  const visibleOnly = req.query['visible'] === 'true';
  const rows = visibleOnly
    ? (db.prepare('SELECT * FROM quick_links WHERE visible = 1 ORDER BY sort_order ASC').all() as QuickLinkRow[])
    : (db.prepare('SELECT * FROM quick_links ORDER BY sort_order ASC').all() as QuickLinkRow[]);
  res.json(rows);
});

// PUT /reorder — MUSS VOR PUT /:id stehen
router.put('/reorder', (req, res) => {
  const { ids } = req.body as { ids?: number[] };
  if (!Array.isArray(ids)) {
    res.status(400).json({ error: 'ids muss ein Array sein' });
    return;
  }

  const update = db.prepare('UPDATE quick_links SET sort_order = ? WHERE id = ?');
  const reorderAll = db.transaction((idList: number[]) => {
    idList.forEach((id, index) => {
      update.run(index, id);
    });
  });
  reorderAll(ids);

  const rows = db.prepare('SELECT * FROM quick_links ORDER BY sort_order ASC').all() as QuickLinkRow[];
  res.json(rows);
});

// POST / — neuen Link anlegen
router.post('/', (req, res) => {
  const { label, url } = req.body as { label?: string; url?: string };
  if (!label || !label.trim()) {
    res.status(400).json({ error: 'Label ist erforderlich' });
    return;
  }
  if (!url || !url.trim()) {
    res.status(400).json({ error: 'URL ist erforderlich' });
    return;
  }
  if (!/^https?:\/\//i.test(url.trim())) {
    res.status(400).json({ error: 'URL muss mit http:// oder https:// beginnen' });
    return;
  }

  const maxRow = db.prepare('SELECT MAX(sort_order) as max_order FROM quick_links').get() as { max_order: number | null };
  const sortOrder = (maxRow?.max_order ?? -1) + 1;

  const result = db.prepare(
    'INSERT INTO quick_links (label, url, sort_order, visible) VALUES (?, ?, ?, 1)'
  ).run(label.trim(), url.trim(), sortOrder);

  const created = db.prepare('SELECT * FROM quick_links WHERE id = ?').get(result.lastInsertRowid) as QuickLinkRow;
  res.status(201).json(created);
});

// PUT /:id — Link bearbeiten
router.put('/:id', (req, res) => {
  const id = Number(req.params['id']);
  const existing = db.prepare('SELECT * FROM quick_links WHERE id = ?').get(id) as QuickLinkRow | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Link nicht gefunden' });
    return;
  }

  const { label, url, visible } = req.body as { label?: string; url?: string; visible?: boolean };
  const newLabel = label !== undefined ? label.trim() : existing.label;
  const newUrl = url !== undefined ? url.trim() : existing.url;
  const newVisible = visible !== undefined ? (visible ? 1 : 0) : existing.visible;

  if (url !== undefined && !/^https?:\/\//i.test(newUrl)) {
    res.status(400).json({ error: 'URL muss mit http:// oder https:// beginnen' });
    return;
  }

  db.prepare(
    'UPDATE quick_links SET label = ?, url = ?, visible = ? WHERE id = ?'
  ).run(newLabel, newUrl, newVisible, id);

  const updated = db.prepare('SELECT * FROM quick_links WHERE id = ?').get(id) as QuickLinkRow;
  res.json(updated);
});

// DELETE /:id — Link loeschen
router.delete('/:id', (req, res) => {
  const id = Number(req.params['id']);
  const existing = db.prepare('SELECT id FROM quick_links WHERE id = ?').get(id);
  if (!existing) {
    res.status(404).json({ error: 'Link nicht gefunden' });
    return;
  }
  db.prepare('DELETE FROM quick_links WHERE id = ?').run(id);
  res.status(204).send();
});

export default router;
