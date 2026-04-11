import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import os from 'os';
import fs from 'fs';
import db from '../db/connection';

// ── Upload storage ─────────────────────────────────────────────────────────────

const UPLOADS_DIR = path.join(os.homedir(), '.local', 'share', 'benny-dashboard', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const ext = path.extname(file.originalname);
    cb(null, `${unique}${ext}`);
  },
});

const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } }); // 50 MB

const router = Router();

// ── Helper: TipTap-JSON -> plain text ─────────────────────────────────────────
type TipTapNode = {
  text?: string;
  content?: TipTapNode[];
};

function extractText(node: TipTapNode): string {
  if (node.text) return node.text;
  if (node.content) return node.content.map(extractText).join(' ');
  return '';
}

function parseContent(raw: unknown): { content: string; content_text: string; excerpt: string } {
  let contentObj: TipTapNode;
  if (typeof raw === 'string') {
    try { contentObj = JSON.parse(raw); } catch { contentObj = { type: 'doc', content: [] } as TipTapNode; }
  } else if (raw && typeof raw === 'object') {
    contentObj = raw as TipTapNode;
  } else {
    contentObj = { type: 'doc', content: [] } as TipTapNode;
  }
  const content_text = extractText(contentObj).replace(/\s+/g, ' ').trim();
  const excerpt = content_text.slice(0, 180);
  return { content: JSON.stringify(contentObj), content_text, excerpt };
}

// ── Workbooks ─────────────────────────────────────────────────────────────────

router.get('/workbooks', (_req: Request, res: Response) => {
  const rows = db.prepare('SELECT * FROM workbooks').all();
  res.json(rows);
});

// ── Sections ──────────────────────────────────────────────────────────────────

router.get('/sections', (_req: Request, res: Response) => {
  const rows = db.prepare(
    'SELECT * FROM workbook_sections WHERE is_archived = 0 ORDER BY sort_order ASC, id ASC'
  ).all();
  res.json(rows);
});

router.post('/sections', (req: Request, res: Response) => {
  const { name, icon = 'folder', color } = req.body as { name?: string; icon?: string; color?: string };
  if (!name || !name.trim()) {
    res.status(400).json({ error: 'Name ist erforderlich' });
    return;
  }
  const result = db.prepare(
    'INSERT INTO workbook_sections (workbook_id, name, icon, color) VALUES (1, ?, ?, ?)'
  ).run(name.trim(), icon, color ?? null);
  const section = db.prepare('SELECT * FROM workbook_sections WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(section);
});

router.put('/sections/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { name, icon, color } = req.body as { name?: string; icon?: string; color?: string };
  if (!name || !name.trim()) {
    res.status(400).json({ error: 'Name ist erforderlich' });
    return;
  }
  db.prepare(
    'UPDATE workbook_sections SET name = ?, icon = ?, color = ?, updated_at = datetime(\'now\') WHERE id = ?'
  ).run(name.trim(), icon ?? 'folder', color ?? null, id);
  const section = db.prepare('SELECT * FROM workbook_sections WHERE id = ?').get(id);
  if (!section) { res.status(404).json({ error: 'Sektion nicht gefunden' }); return; }
  res.json(section);
});

router.patch('/sections/:id/archive', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  db.prepare(
    'UPDATE workbook_sections SET is_archived = 1 - is_archived, updated_at = datetime(\'now\') WHERE id = ?'
  ).run(id);
  const section = db.prepare('SELECT * FROM workbook_sections WHERE id = ?').get(id);
  if (!section) { res.status(404).json({ error: 'Sektion nicht gefunden' }); return; }
  res.json(section);
});

router.delete('/sections/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  // Alle Seiten der Sektion löschen (inkl. Unterseiten), dann Sektion
  db.prepare('DELETE FROM workbook_pages WHERE section_id = ?').run(id);
  db.prepare('DELETE FROM workbook_sections WHERE id = ?').run(id);
  res.status(204).end();
});

// ── Pages ─────────────────────────────────────────────────────────────────────

router.get('/pages', (req: Request, res: Response) => {
  const { section_id, pinned, archived, parent_id } = req.query as {
    section_id?: string; pinned?: string; archived?: string; parent_id?: string;
  };

  let sql = 'SELECT * FROM workbook_pages WHERE 1=1';
  const params: unknown[] = [];

  if (section_id !== undefined) {
    sql += ' AND section_id = ?';
    params.push(Number(section_id));
  }
  if (pinned === 'true') {
    sql += ' AND is_pinned = 1';
  }
  if (archived === 'true') {
    sql += ' AND is_archived = 1';
  } else if (archived !== 'true') {
    sql += ' AND is_archived = 0';
  }

  // parent_id Filter: wenn gesetzt → Kinder dieser Seite; sonst → nur Top-Level (parent_id IS NULL)
  if (parent_id !== undefined) {
    sql += ' AND parent_id = ?';
    params.push(Number(parent_id));
  } else {
    sql += ' AND parent_id IS NULL';
  }

  sql += ' ORDER BY is_pinned DESC, updated_at DESC';

  const rows = db.prepare(sql).all(...params);
  res.json(rows);
});

router.post('/pages', (req: Request, res: Response) => {
  const { section_id, title, template_id, tags, parent_id } = req.body as {
    section_id?: number;
    title?: string;
    template_id?: number;
    tags?: string;
    content?: unknown;
    parent_id?: number | null;
  };

  let content = '{"type":"doc","content":[]}';
  let content_text = '';
  let excerpt = '';

  if (template_id) {
    const tmpl = db.prepare('SELECT * FROM workbook_templates WHERE id = ?').get(template_id) as { content?: string } | undefined;
    if (tmpl?.content) {
      const parsed = parseContent(tmpl.content);
      content = parsed.content;
      content_text = parsed.content_text;
      excerpt = parsed.excerpt;
    }
  } else if (req.body.content) {
    const parsed = parseContent(req.body.content);
    content = parsed.content;
    content_text = parsed.content_text;
    excerpt = parsed.excerpt;
  }

  const result = db.prepare(
    `INSERT INTO workbook_pages (workbook_id, section_id, parent_id, title, content, content_text, excerpt, tags, template_id)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    section_id ?? null,
    parent_id ?? null,
    title?.trim() || 'Unbenannte Seite',
    content,
    content_text,
    excerpt || null,
    tags ?? null,
    template_id ?? null
  );

  const page = db.prepare('SELECT * FROM workbook_pages WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(page);
});

router.get('/pages/:id', (req: Request, res: Response) => {
  const page = db.prepare('SELECT * FROM workbook_pages WHERE id = ?').get(Number(req.params.id));
  if (!page) { res.status(404).json({ error: 'Seite nicht gefunden' }); return; }
  res.json(page);
});

router.put('/pages/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { title, content, tags, section_id } = req.body as {
    title?: string;
    content?: unknown;
    tags?: string;
    section_id?: number | null;
    excerpt?: string;
  };

  const existing = db.prepare('SELECT * FROM workbook_pages WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!existing) { res.status(404).json({ error: 'Seite nicht gefunden' }); return; }

  const newTitle = title !== undefined ? title.trim() || 'Unbenannte Seite' : (existing.title as string);
  const newSectionId = section_id !== undefined ? section_id : (existing.section_id as number | null);
  const newTags = tags !== undefined ? tags : (existing.tags as string | null);

  let newContent = existing.content as string;
  let newContentText = existing.content_text as string;
  let newExcerpt = existing.excerpt as string | null;

  if (content !== undefined) {
    const parsed = parseContent(content);
    newContent = parsed.content;
    newContentText = parsed.content_text;
    newExcerpt = req.body.excerpt !== undefined ? req.body.excerpt : (parsed.excerpt || null);
  }

  db.prepare(
    `UPDATE workbook_pages
     SET title = ?, content = ?, content_text = ?, excerpt = ?, tags = ?, section_id = ?,
         updated_at = datetime('now'), updated_by = 'benny'
     WHERE id = ?`
  ).run(newTitle, newContent, newContentText, newExcerpt, newTags, newSectionId, id);

  const updated = db.prepare('SELECT * FROM workbook_pages WHERE id = ?').get(id);
  res.json(updated);
});

router.patch('/pages/:id/pin', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  db.prepare(
    'UPDATE workbook_pages SET is_pinned = 1 - is_pinned, updated_at = datetime(\'now\') WHERE id = ?'
  ).run(id);
  const page = db.prepare('SELECT * FROM workbook_pages WHERE id = ?').get(id);
  if (!page) { res.status(404).json({ error: 'Seite nicht gefunden' }); return; }
  res.json(page);
});

router.patch('/pages/:id/archive', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  db.prepare(
    'UPDATE workbook_pages SET is_archived = 1 - is_archived, updated_at = datetime(\'now\') WHERE id = ?'
  ).run(id);
  const page = db.prepare('SELECT * FROM workbook_pages WHERE id = ?').get(id);
  if (!page) { res.status(404).json({ error: 'Seite nicht gefunden' }); return; }
  res.json(page);
});

router.patch('/pages/:id/template', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  db.prepare(
    'UPDATE workbook_pages SET is_template = 1 - is_template, updated_at = datetime(\'now\') WHERE id = ?'
  ).run(id);
  const page = db.prepare('SELECT * FROM workbook_pages WHERE id = ?').get(id);
  if (!page) { res.status(404).json({ error: 'Seite nicht gefunden' }); return; }
  res.json(page);
});

router.delete('/pages/:id', (req: Request, res: Response) => {
  db.prepare('DELETE FROM workbook_pages WHERE id = ?').run(Number(req.params.id));
  res.status(204).end();
});

// ── Page Views ────────────────────────────────────────────────────────────────

router.post('/pages/:id/view', (req: Request, res: Response) => {
  db.prepare('INSERT INTO workbook_page_views (page_id) VALUES (?)').run(Number(req.params.id));
  res.status(204).end();
});

// ── Recent / Recently Visited ─────────────────────────────────────────────────

router.get('/recent', (_req: Request, res: Response) => {
  const rows = db.prepare(
    'SELECT * FROM workbook_pages WHERE is_archived = 0 ORDER BY updated_at DESC LIMIT 10'
  ).all();
  res.json(rows);
});

router.get('/recently-visited', (_req: Request, res: Response) => {
  const rows = db.prepare(`
    SELECT p.* FROM workbook_pages p
    JOIN (
      SELECT page_id, MAX(viewed_at) AS last_view
      FROM workbook_page_views
      GROUP BY page_id
    ) v ON v.page_id = p.id
    WHERE p.is_archived = 0
    ORDER BY v.last_view DESC
    LIMIT 10
  `).all();
  res.json(rows);
});

// ── Templates ─────────────────────────────────────────────────────────────────

router.get('/templates', (_req: Request, res: Response) => {
  const rows = db.prepare('SELECT * FROM workbook_templates ORDER BY id ASC').all();
  res.json(rows);
});

// ── FTS5 Search ───────────────────────────────────────────────────────────────

router.get('/search', (req: Request, res: Response) => {
  const q = (req.query.q as string | undefined)?.trim() ?? '';
  if (!q) { res.json([]); return; }

  // Sanitize + prefix-match
  const sanitized = q.replace(/[^\w äöüÄÖÜß]/g, '').trim();
  if (!sanitized) { res.json([]); return; }

  const ftsQuery = sanitized
    .split(/\s+/)
    .filter(Boolean)
    .map(token => token.replace(/[^\w äöüÄÖÜß]/g, '') + '*')
    .join(' ');

  const rows = db.prepare(`
    SELECT p.id, p.title, p.section_id,
           s.name AS section_name,
           snippet(workbook_pages_fts, 1, '<mark>', '</mark>', '...', 10) AS snippet,
           rank
    FROM workbook_pages_fts
    JOIN workbook_pages p ON p.id = workbook_pages_fts.rowid
    LEFT JOIN workbook_sections s ON s.id = p.section_id
    WHERE workbook_pages_fts MATCH ? AND p.is_archived = 0
    ORDER BY rank
    LIMIT 20
  `).all(ftsQuery);

  res.json(rows);
});

// ── Attachments ───────────────────────────────────────────────────────────────

router.get('/pages/:id/attachments', (req: Request, res: Response) => {
  const rows = db.prepare(
    'SELECT * FROM workbook_attachments WHERE page_id = ? ORDER BY uploaded_at ASC'
  ).all(Number(req.params.id));
  res.json(rows);
});

router.post('/pages/:id/attachments', upload.single('file'), (req: Request, res: Response) => {
  const pageId = Number(req.params.id);
  const file = req.file;
  if (!file) { res.status(400).json({ error: 'Keine Datei übermittelt' }); return; }

  // Multer liest Dateinamen als Latin-1 — in UTF-8 umwandeln
  const originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');

  const result = db.prepare(
    `INSERT INTO workbook_attachments (page_id, file_name, file_type, file_size, storage_path)
     VALUES (?, ?, ?, ?, ?)`
  ).run(pageId, originalName, file.mimetype, file.size, file.filename);

  const attachment = db.prepare('SELECT * FROM workbook_attachments WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(attachment);
});

router.get('/attachments/:id/download', (req: Request, res: Response) => {
  const row = db.prepare('SELECT * FROM workbook_attachments WHERE id = ?').get(Number(req.params.id)) as {
    file_name: string; storage_path: string;
  } | undefined;
  if (!row) { res.status(404).json({ error: 'Anhang nicht gefunden' }); return; }
  const filePath = path.join(UPLOADS_DIR, row.storage_path);
  if (!fs.existsSync(filePath)) { res.status(404).json({ error: 'Datei nicht gefunden' }); return; }
  res.download(filePath, row.file_name);
});

router.delete('/attachments/:id', (req: Request, res: Response) => {
  const row = db.prepare('SELECT * FROM workbook_attachments WHERE id = ?').get(Number(req.params.id)) as {
    storage_path: string;
  } | undefined;
  if (!row) { res.status(404).json({ error: 'Anhang nicht gefunden' }); return; }
  const filePath = path.join(UPLOADS_DIR, row.storage_path);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  db.prepare('DELETE FROM workbook_attachments WHERE id = ?').run(Number(req.params.id));
  res.status(204).end();
});

export default router;
