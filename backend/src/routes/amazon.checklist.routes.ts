import { Router, type Request, type Response } from 'express';
import db from '../db/connection';

const router = Router();

const MAX_TITLE = 200;
const MAX_DESCRIPTION = 500;
const MAX_REMARK = 1000;
const MAX_URL = 500;
const MAX_LABEL = 100;

interface SectionRow {
  id: number;
  sort_order: number;
  title: string;
  created_at: number;
  updated_at: number;
}
interface ProductSectionRow extends SectionRow {
  product_id: number;
}
interface ItemRow {
  id: number;
  section_id: number;
  sort_order: number;
  description: string;
  remark: string | null;
  link_url: string | null;
  link_label: string | null;
  is_done: number;
  created_at: number;
  updated_at: number;
}

function normalizeText(raw: unknown, max: number): { ok: true; value: string | null } | { ok: false } {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw !== 'string') return { ok: false };
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: true, value: null };
  if (trimmed.length > max) return { ok: false };
  return { ok: true, value: trimmed };
}

function requireText(raw: unknown, max: number): { ok: true; value: string } | { ok: false } {
  if (typeof raw !== 'string') return { ok: false };
  const trimmed = raw.trim();
  if (trimmed.length < 1 || trimmed.length > max) return { ok: false };
  return { ok: true, value: trimmed };
}

function loadMasterItems(sectionId: number): ItemRow[] {
  return db.prepare(
    `SELECT * FROM amazon_checklist_master_items WHERE section_id = ? ORDER BY sort_order, id`
  ).all(sectionId) as ItemRow[];
}

function loadMasterSectionsWithItems(): Array<SectionRow & { items: ItemRow[] }> {
  const sections = db.prepare(
    `SELECT * FROM amazon_checklist_master_sections ORDER BY sort_order, id`
  ).all() as SectionRow[];
  return sections.map(s => ({ ...s, items: loadMasterItems(s.id) }));
}

// ── Master ───────────────────────────────────────────────────────────────────

router.get('/checklist/master', (_req: Request, res: Response) => {
  res.json({ sections: loadMasterSectionsWithItems() });
});

router.post('/checklist/master/sections', (req: Request, res: Response) => {
  const title = requireText((req.body as { title?: unknown })?.title, MAX_TITLE);
  if (!title.ok) { res.status(400).json({ error: 'invalid title' }); return; }
  const maxOrder = (db.prepare(
    `SELECT COALESCE(MAX(sort_order), 0) AS m FROM amazon_checklist_master_sections`
  ).get() as { m: number }).m;
  const result = db.prepare(
    `INSERT INTO amazon_checklist_master_sections (sort_order, title) VALUES (?, ?)`
  ).run(maxOrder + 1, title.value);
  const row = db.prepare(`SELECT * FROM amazon_checklist_master_sections WHERE id = ?`).get(result.lastInsertRowid) as SectionRow;
  res.status(201).json({ section: { ...row, items: [] } });
});

router.patch('/checklist/master/sections/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(404).json({ error: 'not found' }); return; }
  const existing = db.prepare(`SELECT * FROM amazon_checklist_master_sections WHERE id = ?`).get(id);
  if (!existing) { res.status(404).json({ error: 'not found' }); return; }
  const body = (req.body as Record<string, unknown>) ?? {};
  const updates: string[] = []; const params: unknown[] = [];
  if (body.title !== undefined) {
    const t = requireText(body.title, MAX_TITLE);
    if (!t.ok) { res.status(400).json({ error: 'invalid title' }); return; }
    updates.push('title = ?'); params.push(t.value);
  }
  if (body.sort_order !== undefined) {
    if (typeof body.sort_order !== 'number' || !Number.isInteger(body.sort_order)) {
      res.status(400).json({ error: 'invalid sort_order' }); return;
    }
    updates.push('sort_order = ?'); params.push(body.sort_order);
  }
  if (updates.length > 0) {
    updates.push('updated_at = unixepoch()'); params.push(id);
    db.prepare(`UPDATE amazon_checklist_master_sections SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }
  const row = db.prepare(`SELECT * FROM amazon_checklist_master_sections WHERE id = ?`).get(id) as SectionRow;
  res.json({ section: { ...row, items: loadMasterItems(id) } });
});

router.delete('/checklist/master/sections/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(404).json({ error: 'not found' }); return; }
  db.prepare(`DELETE FROM amazon_checklist_master_sections WHERE id = ?`).run(id);
  res.status(204).end();
});

router.post('/checklist/master/sections/:id/items', (req: Request, res: Response) => {
  const sectionId = Number(req.params.id);
  if (!Number.isInteger(sectionId)) { res.status(404).json({ error: 'not found' }); return; }
  const existing = db.prepare(`SELECT 1 FROM amazon_checklist_master_sections WHERE id = ?`).get(sectionId);
  if (!existing) { res.status(404).json({ error: 'section not found' }); return; }

  const body = (req.body as Record<string, unknown>) ?? {};
  const desc = requireText(body.description, MAX_DESCRIPTION);
  if (!desc.ok) { res.status(400).json({ error: 'invalid description' }); return; }
  const remark = normalizeText(body.remark, MAX_REMARK);
  if (!remark.ok) { res.status(400).json({ error: 'invalid remark' }); return; }
  const linkUrl = normalizeText(body.link_url, MAX_URL);
  if (!linkUrl.ok) { res.status(400).json({ error: 'invalid link_url' }); return; }
  const linkLabel = normalizeText(body.link_label, MAX_LABEL);
  if (!linkLabel.ok) { res.status(400).json({ error: 'invalid link_label' }); return; }

  const maxOrder = (db.prepare(
    `SELECT COALESCE(MAX(sort_order), 0) AS m FROM amazon_checklist_master_items WHERE section_id = ?`
  ).get(sectionId) as { m: number }).m;
  const result = db.prepare(
    `INSERT INTO amazon_checklist_master_items
       (section_id, sort_order, description, remark, link_url, link_label)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(sectionId, maxOrder + 1, desc.value, remark.value, linkUrl.value, linkLabel.value);
  const row = db.prepare(`SELECT * FROM amazon_checklist_master_items WHERE id = ?`).get(result.lastInsertRowid) as ItemRow;
  res.status(201).json({ item: row });
});

router.patch('/checklist/master/items/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(404).json({ error: 'not found' }); return; }
  const existing = db.prepare(`SELECT 1 FROM amazon_checklist_master_items WHERE id = ?`).get(id);
  if (!existing) { res.status(404).json({ error: 'not found' }); return; }
  const body = (req.body as Record<string, unknown>) ?? {};
  const updates: string[] = []; const params: unknown[] = [];

  if (body.description !== undefined) {
    const v = requireText(body.description, MAX_DESCRIPTION);
    if (!v.ok) { res.status(400).json({ error: 'invalid description' }); return; }
    updates.push('description = ?'); params.push(v.value);
  }
  for (const [col, max] of [['remark', MAX_REMARK], ['link_url', MAX_URL], ['link_label', MAX_LABEL]] as const) {
    if (body[col] !== undefined) {
      const v = normalizeText(body[col], max);
      if (!v.ok) { res.status(400).json({ error: `invalid ${col}` }); return; }
      updates.push(`${col} = ?`); params.push(v.value);
    }
  }
  if (body.sort_order !== undefined) {
    if (typeof body.sort_order !== 'number' || !Number.isInteger(body.sort_order)) {
      res.status(400).json({ error: 'invalid sort_order' }); return;
    }
    updates.push('sort_order = ?'); params.push(body.sort_order);
  }
  if (body.is_done !== undefined) {
    if (body.is_done !== 0 && body.is_done !== 1) {
      res.status(400).json({ error: 'invalid is_done' }); return;
    }
    updates.push('is_done = ?'); params.push(body.is_done);
  }
  if (updates.length > 0) {
    updates.push('updated_at = unixepoch()'); params.push(id);
    db.prepare(`UPDATE amazon_checklist_master_items SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  }
  const row = db.prepare(`SELECT * FROM amazon_checklist_master_items WHERE id = ?`).get(id) as ItemRow;
  res.json({ item: row });
});

router.delete('/checklist/master/items/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(404).json({ error: 'not found' }); return; }
  db.prepare(`DELETE FROM amazon_checklist_master_items WHERE id = ?`).run(id);
  res.status(204).end();
});

export default router;
