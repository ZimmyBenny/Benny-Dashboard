import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import os from 'os';
import fs from 'fs';
import PDFDocument from 'pdfkit';
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

// ── Export ────────────────────────────────────────────────────────────────────

router.get('/export', (req: Request, res: Response) => {
  const format = ((req.query.format as string) || 'csv').toLowerCase();
  const sectionId = req.query.section_id ? Number(req.query.section_id) : null;
  const pageId = req.query.page_id ? Number(req.query.page_id) : null;

  if (format !== 'csv' && format !== 'pdf') {
    res.status(400).json({ error: 'format muss csv oder pdf sein' });
    return;
  }

  // Seiten + Section-Name in einem JOIN laden (nur non-archived)
  let sql = `
    SELECT p.id, p.title, p.content_text, p.tags, p.created_at, p.updated_at,
           s.name AS section_name
    FROM workbook_pages p
    LEFT JOIN workbook_sections s ON s.id = p.section_id
    WHERE p.is_archived = 0
  `;
  const params: unknown[] = [];

  if (pageId !== null) {
    sql += ' AND p.id = ?';
    params.push(pageId);
  } else if (sectionId !== null) {
    sql += ' AND p.section_id = ?';
    params.push(sectionId);
  }

  sql += ' ORDER BY s.sort_order ASC, s.id ASC, p.is_pinned DESC, p.updated_at DESC';

  const rows = db.prepare(sql).all(...params) as Array<{
    id: number;
    title: string;
    content_text: string | null;
    tags: string | null;
    created_at: string;
    updated_at: string;
    section_name: string | null;
  }>;

  const ts = new Date().toISOString().slice(0, 10);
  const baseName = `arbeitsmappe-export-${ts}`;

  if (format === 'csv') {
    // CSV RFC4180: Felder mit , " \n in doppelte Anfuehrungszeichen, inneres " verdoppeln.
    const escape = (v: string | null | undefined): string => {
      const s = (v ?? '').toString();
      if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    };
    const header = ['Titel', 'Bereich', 'Erstellt', 'Aktualisiert', 'Tags', 'Inhalt'];
    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push([
        escape(r.title),
        escape(r.section_name ?? ''),
        escape(r.created_at),
        escape(r.updated_at),
        escape(r.tags ?? ''),
        escape(r.content_text ?? ''),
      ].join(','));
    }
    // UTF-8 BOM, damit Excel Umlaute korrekt anzeigt
    const csv = '\uFEFF' + lines.join('\r\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${baseName}.csv"`);
    res.send(csv);
    return;
  }

  // PDF
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${baseName}.pdf"`);

  const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: 'Arbeitsmappe Export' } });
  doc.pipe(res);

  // Titel + Meta
  doc.fontSize(20).text('Arbeitsmappe \u2014 Export', { align: 'left' });
  doc.moveDown(0.3);
  doc.fontSize(10).fillColor('#666').text(`Erstellt: ${new Date().toLocaleString('de-DE')}`);
  doc.moveDown(1);
  doc.fillColor('black');

  if (rows.length === 0) {
    doc.fontSize(12).text('Keine Seiten im gewaehlten Filter.');
    doc.end();
    return;
  }

  let lastSection: string | null = null;
  for (const r of rows) {
    const section = r.section_name ?? 'Ohne Bereich';
    if (section !== lastSection) {
      doc.moveDown(0.5);
      doc.fontSize(14).fillColor('#6200ea').text(section, { underline: true });
      doc.fillColor('black');
      doc.moveDown(0.3);
      lastSection = section;
    }

    doc.fontSize(13).text(r.title, { continued: false });
    const metaParts: string[] = [];
    metaParts.push(`Erstellt: ${r.created_at.slice(0, 10)}`);
    metaParts.push(`Aktualisiert: ${r.updated_at.slice(0, 10)}`);
    if (r.tags && r.tags.trim()) metaParts.push(`Tags: ${r.tags}`);
    doc.fontSize(9).fillColor('#888').text(metaParts.join('  |  '));
    doc.fillColor('black');
    doc.moveDown(0.3);

    const body = (r.content_text ?? '').trim() || '(leer)';
    doc.fontSize(11).text(body, { align: 'left' });
    doc.moveDown(0.8);
  }

  doc.end();
});

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
  const { section_id, pinned, archived, parent_id, contact_id } = req.query as {
    section_id?: string; pinned?: string; archived?: string; parent_id?: string; contact_id?: string;
  };

  // Spezialfall: contact_id Filter — JOIN mit section_name, kein parent_id IS NULL Filter
  if (contact_id !== undefined) {
    const sql = `
      SELECT p.*, s.name AS section_name FROM workbook_pages p
      LEFT JOIN workbook_sections s ON s.id = p.section_id
      WHERE p.contact_id = ? AND p.is_archived = 0
      ORDER BY p.updated_at DESC
    `;
    const rows = db.prepare(sql).all(Number(contact_id));
    res.json(rows);
    return;
  }

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
  const { section_id, title, template_id, tags, parent_id, contact_id } = req.body as {
    section_id?: number;
    title?: string;
    template_id?: number;
    tags?: string;
    content?: unknown;
    parent_id?: number | null;
    contact_id?: number | null;
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
    `INSERT INTO workbook_pages (workbook_id, section_id, parent_id, contact_id, title, content, content_text, excerpt, tags, template_id)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    section_id ?? null,
    parent_id ?? null,
    contact_id ?? null,
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
  const { title, content, tags, section_id, contact_id } = req.body as {
    title?: string;
    content?: unknown;
    tags?: string;
    section_id?: number | null;
    contact_id?: number | null;
    excerpt?: string;
  };

  const existing = db.prepare('SELECT * FROM workbook_pages WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!existing) { res.status(404).json({ error: 'Seite nicht gefunden' }); return; }

  const newTitle = title !== undefined ? title.trim() || 'Unbenannte Seite' : (existing.title as string);
  const newSectionId = section_id !== undefined ? section_id : (existing.section_id as number | null);
  const newContactId = contact_id !== undefined ? contact_id : (existing.contact_id as number | null);
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
     SET title = ?, content = ?, content_text = ?, excerpt = ?, tags = ?, section_id = ?, contact_id = ?,
         updated_at = datetime('now'), updated_by = 'benny'
     WHERE id = ?`
  ).run(newTitle, newContent, newContentText, newExcerpt, newTags, newSectionId, newContactId, id);

  const updated = db.prepare('SELECT * FROM workbook_pages WHERE id = ?').get(id);
  res.json(updated);
});

router.patch('/pages/:id/contact', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { contact_id } = req.body as { contact_id: number | null };
  db.prepare(
    "UPDATE workbook_pages SET contact_id = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(contact_id ?? null, id);
  const page = db.prepare('SELECT * FROM workbook_pages WHERE id = ?').get(id);
  if (!page) { res.status(404).json({ error: 'Seite nicht gefunden' }); return; }
  res.json(page);
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
  const id = Number(req.params.id);
  // FK ON DELETE SET NULL funktioniert nicht bei ALTER TABLE — manuell bereinigen
  db.prepare('UPDATE tasks SET source_page_id = NULL WHERE source_page_id = ?').run(id);
  db.prepare('DELETE FROM workbook_pages WHERE id = ?').run(id);
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
