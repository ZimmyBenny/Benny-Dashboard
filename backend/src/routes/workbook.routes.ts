import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import os from 'os';
import fs from 'fs';
import PDFDocument from 'pdfkit';
import db from '../db/connection';
import { todayLocal } from '../lib/dates';
import { createBackup } from '../db/backup';

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
  const sectionIndex = req.query.section_index != null && req.query.section_index !== '' ? Number(req.query.section_index) : null;

  if (format !== 'csv' && format !== 'pdf') {
    res.status(400).json({ error: 'format muss csv oder pdf sein' });
    return;
  }

  // Seiten + Section-Name in einem JOIN laden (nur non-archived)
  let sql = `
    SELECT p.id, p.title, p.content, p.content_text, p.tags, p.created_at, p.updated_at,
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
    content: string | null;
    content_text: string | null;
    tags: string | null;
    created_at: string;
    updated_at: string;
    section_name: string | null;
  }>;

  const ts = todayLocal();
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
    doc.fontSize(12).text('Keine Seiten im gewählten Filter.');
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

    renderPageBody(doc, r.content, r.content_text, sectionIndex);
    // Frei platzierte Bilder gehören zur ganzen Seite, nicht zu einem Bereich —
    // beim Einzel-Bereich-Export daher weglassen.
    const pageImgs = sectionIndex != null ? [] : db.prepare(
      `SELECT a.storage_path FROM workbook_page_images pi
       JOIN workbook_attachments a ON a.id = pi.attachment_id
       WHERE pi.page_id = ? ORDER BY pi.z, pi.id`,
    ).all(r.id) as { storage_path: string }[];
    for (const im of pageImgs) {
      const p = path.join(UPLOADS_DIR, im.storage_path);
      if (fs.existsSync(p)) {
        try {
          doc.moveDown(0.3);
          doc.image(p, { fit: [doc.page.width - doc.page.margins.left - doc.page.margins.right, 400] });
        } catch { /* nicht unterstütztes Format */ }
      }
    }
    doc.moveDown(0.8);
  }

  doc.end();
});

// ── Strukturierter Renderer: Tiptap-JSON -> PDF ───────────────────────────────
type TT = { type?: string; text?: string; content?: TT[]; attrs?: Record<string, unknown>; marks?: { type: string; attrs?: Record<string, unknown> }[] };
type Run = { text: string; bold: boolean; italic: boolean; link?: string };

function fontFor(bold: boolean, italic: boolean): string {
  if (bold && italic) return 'Helvetica-BoldOblique';
  if (bold) return 'Helvetica-Bold';
  if (italic) return 'Helvetica-Oblique';
  return 'Helvetica';
}

// Inline-Inhalt eines Blocks in Text-Runs (mit Marks) zerlegen.
function inlineRuns(node: TT): Run[] {
  const runs: Run[] = [];
  const walk = (n: TT) => {
    if (typeof n.text === 'string') {
      const marks = n.marks ?? [];
      runs.push({
        text: n.text,
        bold: marks.some(m => m.type === 'bold'),
        italic: marks.some(m => m.type === 'italic'),
        link: marks.find(m => m.type === 'link')?.attrs?.href as string | undefined,
      });
    } else if (n.type === 'hardBreak') {
      runs.push({ text: '\n', bold: false, italic: false });
    } else if (n.content) {
      n.content.forEach(walk);
    }
  };
  (node.content ?? []).forEach(walk);
  return runs;
}

// Runs in einer Zeile ausgeben (pdfkit continued-Verkettung für gemischte Marks).
function writeInline(doc: PDFKit.PDFDocument, runs: Run[], size: number, forceBold = false, indent = 0) {
  doc.fontSize(size);
  if (runs.length === 0) { doc.font('Helvetica').fillColor('black').text('', { indent }); return; }
  runs.forEach((r, i) => {
    const last = i === runs.length - 1;
    doc.font(fontFor(forceBold || r.bold, r.italic));
    doc.fillColor(r.link ? '#1a56db' : 'black');
    doc.text(r.text, { continued: !last, underline: !!r.link, indent: i === 0 ? indent : undefined });
  });
  doc.font('Helvetica').fillColor('black');
}

function plainText(node: TT): string {
  if (typeof node.text === 'string') return node.text;
  if (node.type === 'hardBreak') return '\n';
  return (node.content ?? []).map(plainText).join('');
}

function renderListItem(doc: PDFKit.PDFDocument, li: TT, prefix: string) {
  const runs: Run[] = [];
  (li.content ?? []).forEach(child => { runs.push(...inlineRuns(child)); });
  writeInline(doc, [{ text: prefix, bold: false, italic: false }, ...runs], 11, false, 8);
}

function renderBlocks(doc: PDFKit.PDFDocument, nodes: TT[]) {
  for (const node of nodes) {
    switch (node.type) {
      case 'heading': {
        const level = Number(node.attrs?.level ?? 1);
        const size = level === 1 ? 16 : level === 2 ? 13.5 : 12;
        doc.moveDown(0.35);
        writeInline(doc, inlineRuns(node), size, true);
        doc.moveDown(0.15);
        break;
      }
      case 'paragraph':
        writeInline(doc, inlineRuns(node), 11);
        doc.moveDown(0.35);
        break;
      case 'bulletList':
        (node.content ?? []).forEach(li => renderListItem(doc, li, '•  '));
        doc.moveDown(0.2);
        break;
      case 'orderedList':
        (node.content ?? []).forEach((li, idx) => renderListItem(doc, li, `${idx + 1}.  `));
        doc.moveDown(0.2);
        break;
      case 'taskList':
        (node.content ?? []).forEach(ti => {
          const checked = ti.attrs?.checked === true || ti.attrs?.checked === 'true';
          renderListItem(doc, ti, checked ? '[x]  ' : '[ ]  ');
        });
        doc.moveDown(0.2);
        break;
      case 'blockquote':
        doc.fillColor('#555');
        renderBlocks(doc, node.content ?? []);
        doc.fillColor('black');
        break;
      case 'codeBlock':
        doc.font('Courier').fontSize(10).fillColor('#333').text(plainText(node), { indent: 8 });
        doc.font('Helvetica').fillColor('black');
        doc.moveDown(0.3);
        break;
      case 'horizontalRule':
        doc.moveDown(0.2);
        doc.strokeColor('#ccc').lineWidth(0.5).moveTo(doc.x, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();
        doc.strokeColor('black').moveDown(0.4);
        break;
      case 'emailCard': {
        const a = node.attrs ?? {};
        doc.fontSize(10).fillColor('#444').font('Helvetica-Bold')
          .text(`E-Mail: ${String(a.subject ?? '')}${a.from ? ' — ' + String(a.from) : ''}`);
        if (a.fileName) doc.font('Helvetica').fillColor('#888').text(`Anhang: ${String(a.fileName)}`);
        doc.font('Helvetica').fillColor('black').moveDown(0.3);
        break;
      }
      case 'imageAttachment': {
        const attId = Number(node.attrs?.attachmentId);
        if (Number.isInteger(attId)) {
          const att = db.prepare('SELECT storage_path FROM workbook_attachments WHERE id = ?').get(attId) as { storage_path: string } | undefined;
          if (att) {
            const p = path.join(UPLOADS_DIR, att.storage_path);
            if (fs.existsSync(p)) {
              try {
                const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
                doc.moveDown(0.2);
                doc.image(p, { fit: [contentWidth, 400] }); // pdfkit: nur PNG/JPEG, links (Default)
                doc.moveDown(0.4);
              } catch { /* nicht unterstütztes Bildformat -> überspringen */ }
            }
          }
        }
        break;
      }
      case 'sectionBlock': {
        const a = node.attrs ?? {};
        doc.moveDown(0.4);
        doc.fontSize(13).fillColor('#111').font('Helvetica-Bold').text(String(a.title ?? 'Bereich'));
        if (a.sentAt) {
          const d = new Date(Number(a.sentAt) * 1000).toLocaleDateString('de-DE');
          doc.fontSize(9).fillColor('#16a34a').font('Helvetica').text(`Gesendet am ${d}${a.sentNote ? ' — ' + String(a.sentNote) : ''}`);
        }
        doc.fillColor('black').font('Helvetica').moveDown(0.2);
        renderBlocks(doc, node.content ?? []);
        doc.moveDown(0.35);
        break;
      }
      default:
        if (node.content) renderBlocks(doc, node.content);
    }
  }
}

// Seiten-Body rendern; Fallback auf platten Text, wenn JSON leer/kaputt.
function renderPageBody(doc: PDFKit.PDFDocument, contentJson: string | null, contentText: string | null, sectionIndex?: number | null) {
  let root: TT | null = null;
  try { root = contentJson ? (JSON.parse(contentJson) as TT) : null; } catch { root = null; }
  const blocks = root?.content ?? [];

  // Nur einen bestimmten Bereich (sectionBlock) exportieren?
  if (sectionIndex != null && sectionIndex >= 0) {
    const sections = blocks.filter((b) => b.type === 'sectionBlock');
    const target = sections[sectionIndex];
    if (target) { renderBlocks(doc, [target]); return; }
    doc.font('Helvetica').fontSize(11).fillColor('black').text('(Bereich nicht gefunden)');
    return;
  }

  if (blocks.length === 0) {
    const fallback = (contentText ?? '').trim();
    doc.font('Helvetica').fontSize(11).fillColor('black').text(fallback || '(leer)');
    return;
  }
  renderBlocks(doc, blocks);
}

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

router.put('/sections/reorder', (req: Request, res: Response) => {
  const { ids } = req.body as { ids?: number[] };
  if (!Array.isArray(ids)) { res.status(400).json({ error: 'ids muss ein Array sein' }); return; }
  const stmt = db.prepare("UPDATE workbook_sections SET sort_order = ?, updated_at = datetime('now') WHERE id = ?");
  db.transaction((orderedIds: number[]) => { orderedIds.forEach((id, i) => stmt.run(i + 1, id)); })(ids);
  res.json({ ok: true });
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

  sql += ' ORDER BY sort_order ASC, is_pinned DESC, updated_at DESC';

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

// ── Duplizieren (Seite / Bereich) ───────────────────────────────────────────────
// Kopiert eine Seite komplett (Text, Anhänge inkl. Dateien, freie Bilder, Annotationen)
// in einen Zielbereich. Gibt die neue Seiten-Id zurück.
type AnyRow = Record<string, unknown>;
function duplicatePageInto(srcId: number, targetSectionId: number | null, titleSuffix: string): number | null {
  const src = db.prepare('SELECT * FROM workbook_pages WHERE id = ?').get(srcId) as AnyRow | undefined;
  if (!src) return null;
  const ins = db.prepare(
    `INSERT INTO workbook_pages (workbook_id, section_id, parent_id, contact_id, title, content, content_text, excerpt, tags, template_id)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    targetSectionId, null, src.contact_id ?? null,
    `${(src.title as string) || 'Seite'}${titleSuffix}`,
    src.content, src.content_text, src.excerpt ?? null, src.tags ?? null, src.template_id ?? null,
  );
  const newPageId = Number(ins.lastInsertRowid);

  // Anhänge: Datei kopieren + Zeile anlegen; alte->neue Id merken.
  const atts = db.prepare('SELECT * FROM workbook_attachments WHERE page_id = ?').all(srcId) as AnyRow[];
  const attMap = new Map<number, number>();
  for (const a of atts) {
    let newStorage = a.storage_path as string;
    try {
      const ext = path.extname(newStorage);
      const dest = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
      fs.copyFileSync(path.join(UPLOADS_DIR, newStorage), path.join(UPLOADS_DIR, dest));
      newStorage = dest;
    } catch { /* Originaldatei fehlt -> Verweis wiederverwenden */ }
    const r = db.prepare(
      'INSERT INTO workbook_attachments (page_id, file_name, file_type, file_size, storage_path) VALUES (?, ?, ?, ?, ?)'
    ).run(newPageId, a.file_name, a.file_type, a.file_size, newStorage);
    attMap.set(a.id as number, Number(r.lastInsertRowid));
  }

  // Frei platzierte Bilder (mit neuer attachment_id).
  const imgs = db.prepare('SELECT * FROM workbook_page_images WHERE page_id = ?').all(srcId) as AnyRow[];
  for (const im of imgs) {
    const newAtt = attMap.get(im.attachment_id as number);
    if (!newAtt) continue;
    db.prepare(
      'INSERT INTO workbook_page_images (page_id, attachment_id, x, y, width, height, z, rotation) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(newPageId, newAtt, im.x, im.y, im.width, im.height, im.z, im.rotation ?? 0);
  }

  // Annotationen.
  const annos = db.prepare('SELECT * FROM workbook_page_annotations WHERE page_id = ?').all(srcId) as AnyRow[];
  for (const an of annos) {
    db.prepare(
      'INSERT INTO workbook_page_annotations (page_id, kind, x1, y1, x2, y2, text, color, size, z) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(newPageId, an.kind, an.x1, an.y1, an.x2, an.y2, an.text, an.color, an.size, an.z);
  }
  return newPageId;
}

// Seite duplizieren (in denselben Bereich).
router.post('/pages/:id/duplicate', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const src = db.prepare('SELECT section_id FROM workbook_pages WHERE id = ?').get(id) as { section_id: number | null } | undefined;
  if (!src) { res.status(404).json({ error: 'not found' }); return; }
  const newId = duplicatePageInto(id, src.section_id ?? null, ' (Kopie)');
  if (!newId) { res.status(404).json({ error: 'not found' }); return; }
  res.status(201).json(db.prepare('SELECT * FROM workbook_pages WHERE id = ?').get(newId));
});

// Bereich duplizieren (neuer Bereich + alle Seiten). Massen-Insert -> Backup zuerst.
router.post('/sections/:id/duplicate', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const src = db.prepare('SELECT * FROM workbook_sections WHERE id = ?').get(id) as AnyRow | undefined;
  if (!src) { res.status(404).json({ error: 'not found' }); return; }
  createBackup('workbook-bereich-duplizieren');
  const secIns = db.prepare(
    'INSERT INTO workbook_sections (workbook_id, name, icon, color) VALUES (1, ?, ?, ?)'
  ).run(`${(src.name as string) || 'Bereich'} (Kopie)`, src.icon ?? 'folder', src.color ?? null);
  const newSectionId = Number(secIns.lastInsertRowid);
  const pages = db.prepare('SELECT id FROM workbook_pages WHERE section_id = ? AND is_archived = 0 ORDER BY sort_order, id').all(id) as { id: number }[];
  for (const p of pages) duplicatePageInto(p.id, newSectionId, '');
  res.status(201).json(db.prepare('SELECT * FROM workbook_sections WHERE id = ?').get(newSectionId));
});

// "An Herstellerin gesendet"-Markierung setzen/ändern/entfernen.
router.patch('/pages/:id/sent', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const cur = db.prepare('SELECT * FROM workbook_pages WHERE id = ?').get(id) as AnyRow | undefined;
  if (!cur) { res.status(404).json({ error: 'not found' }); return; }
  const b = (req.body ?? {}) as { sent_at?: number | null; sent_note?: string | null };
  const sets: string[] = []; const vals: unknown[] = [];
  if ('sent_at' in b) { sets.push('sent_at = ?'); vals.push(b.sent_at == null ? null : Math.trunc(Number(b.sent_at))); }
  if ('sent_note' in b) { sets.push('sent_note = ?'); vals.push(b.sent_note == null ? null : String(b.sent_note)); }
  if (sets.length) db.prepare(`UPDATE workbook_pages SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
  res.json(db.prepare('SELECT * FROM workbook_pages WHERE id = ?').get(id));
});

router.get('/pages/:id', (req: Request, res: Response) => {
  const page = db.prepare('SELECT * FROM workbook_pages WHERE id = ?').get(Number(req.params.id));
  if (!page) { res.status(404).json({ error: 'Seite nicht gefunden' }); return; }
  res.json(page);
});

router.put('/pages/reorder', (req: Request, res: Response) => {
  const { ids } = req.body as { ids?: number[] };
  if (!Array.isArray(ids)) { res.status(400).json({ error: 'ids muss ein Array sein' }); return; }
  const stmt = db.prepare("UPDATE workbook_pages SET sort_order = ?, updated_at = datetime('now') WHERE id = ?");
  db.transaction((orderedIds: number[]) => { orderedIds.forEach((id, i) => stmt.run(i + 1, id)); })(ids);
  res.json({ ok: true });
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
    file_name: string; file_type: string; storage_path: string;
  } | undefined;
  if (!row) { res.status(404).json({ error: 'Anhang nicht gefunden' }); return; }
  const filePath = path.join(UPLOADS_DIR, row.storage_path);
  if (!fs.existsSync(filePath)) { res.status(404).json({ error: 'Datei nicht gefunden' }); return; }
  // res.download scheitert hier (Express 5/send: 404 trotz existierender Datei) ->
  // stattdessen streamen, wie alle anderen Datei-Routen im Projekt.
  res.setHeader('Content-Type', row.file_type || 'application/octet-stream');
  const ascii = (row.file_name || 'datei').replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
  res.setHeader('Content-Disposition', `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(row.file_name || 'datei')}`);
  fs.createReadStream(filePath).pipe(res);
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

// ── Frei platzierbare Bilder je Seite (Migr. 138) ─────────────────────────────
interface PageImageRow { id: number; page_id: number; attachment_id: number; x: number; y: number; width: number; height: number; z: number; rotation: number; created_at: number }
const num = (v: unknown, d: number) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

router.get('/pages/:id/images', (req: Request, res: Response) => {
  const pageId = Number(req.params.id);
  const rows = db.prepare('SELECT * FROM workbook_page_images WHERE page_id = ? ORDER BY z, id').all(pageId) as PageImageRow[];
  res.json(rows);
});

router.post('/pages/:id/images', (req: Request, res: Response) => {
  const pageId = Number(req.params.id);
  const b = (req.body ?? {}) as Record<string, unknown>;
  const attId = Number(b.attachment_id);
  if (!Number.isInteger(attId)) { res.status(400).json({ error: 'attachment_id fehlt' }); return; }
  const maxZ = (db.prepare('SELECT COALESCE(MAX(z),0) AS m FROM workbook_page_images WHERE page_id = ?').get(pageId) as { m: number }).m;
  const r = db.prepare(
    `INSERT INTO workbook_page_images (page_id, attachment_id, x, y, width, height, z)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(pageId, attId, Math.max(0, num(b.x, 20)), Math.max(0, num(b.y, 20)), Math.max(40, num(b.width, 300)), Math.max(40, num(b.height, 200)), maxZ + 1);
  res.status(201).json(db.prepare('SELECT * FROM workbook_page_images WHERE id = ?').get(r.lastInsertRowid) as PageImageRow);
});

router.patch('/pages/images/:imgId', (req: Request, res: Response) => {
  const id = Number(req.params.imgId);
  const cur = db.prepare('SELECT * FROM workbook_page_images WHERE id = ?').get(id) as PageImageRow | undefined;
  if (!cur) { res.status(404).json({ error: 'not found' }); return; }
  const b = (req.body ?? {}) as Record<string, unknown>;
  const sets: string[] = []; const vals: unknown[] = [];
  if ('x' in b) { sets.push('x = ?'); vals.push(Math.max(0, num(b.x, cur.x))); }
  if ('y' in b) { sets.push('y = ?'); vals.push(Math.max(0, num(b.y, cur.y))); }
  if ('width' in b) { sets.push('width = ?'); vals.push(Math.max(40, num(b.width, cur.width))); }
  if ('height' in b) { sets.push('height = ?'); vals.push(Math.max(40, num(b.height, cur.height))); }
  if ('z' in b) { sets.push('z = ?'); vals.push(Math.trunc(num(b.z, cur.z))); }
  if ('rotation' in b) { sets.push('rotation = ?'); vals.push(((num(b.rotation, cur.rotation) % 360) + 360) % 360); }
  if (sets.length === 0) { res.json(cur); return; }
  db.prepare(`UPDATE workbook_page_images SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
  res.json(db.prepare('SELECT * FROM workbook_page_images WHERE id = ?').get(id) as PageImageRow);
});

// Löscht Bild-Zeile UND den zugehörigen Anhang (Datei + Zeile; page_image cascaded).
router.delete('/pages/images/:imgId', (req: Request, res: Response) => {
  const id = Number(req.params.imgId);
  const img = db.prepare('SELECT attachment_id FROM workbook_page_images WHERE id = ?').get(id) as { attachment_id: number } | undefined;
  if (!img) { res.status(404).json({ error: 'not found' }); return; }
  const att = db.prepare('SELECT storage_path FROM workbook_attachments WHERE id = ?').get(img.attachment_id) as { storage_path: string } | undefined;
  if (att) {
    const fp = path.join(UPLOADS_DIR, att.storage_path);
    if (fs.existsSync(fp)) { try { fs.unlinkSync(fp); } catch { /* schon weg */ } }
  }
  db.prepare('DELETE FROM workbook_attachments WHERE id = ?').run(img.attachment_id); // cascaded page_image
  res.status(204).end();
});

// ── Freie Annotationen: Pfeile & Textlabels (Migr. 139) ───────────────────────
interface AnnotationRow { id: number; page_id: number; kind: string; x1: number; y1: number; x2: number; y2: number; text: string; color: string; size: number; z: number; created_at: number }
const ANNO_KINDS = new Set(['arrow', 'text', 'marker', 'rect', 'x', 'draw', 'bracket']);

router.get('/pages/:id/annotations', (req: Request, res: Response) => {
  const pageId = Number(req.params.id);
  res.json(db.prepare('SELECT * FROM workbook_page_annotations WHERE page_id = ? ORDER BY z, id').all(pageId) as AnnotationRow[]);
});

router.post('/pages/:id/annotations', (req: Request, res: Response) => {
  const pageId = Number(req.params.id);
  const b = (req.body ?? {}) as Record<string, unknown>;
  const kind = String(b.kind ?? '');
  if (!ANNO_KINDS.has(kind)) { res.status(400).json({ error: 'kind muss arrow oder text sein' }); return; }
  const maxZ = (db.prepare('SELECT COALESCE(MAX(z),0) AS m FROM workbook_page_annotations WHERE page_id = ?').get(pageId) as { m: number }).m;
  const r = db.prepare(
    `INSERT INTO workbook_page_annotations (page_id, kind, x1, y1, x2, y2, text, color, size, z)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    pageId, kind, num(b.x1, 0), num(b.y1, 0), num(b.x2, 0), num(b.y2, 0),
    String(b.text ?? '').slice(0, kind === 'draw' ? 200000 : 2000), String(b.color ?? '#ef4444').slice(0, 20),
    Math.max(1, num(b.size, kind === 'text' ? 16 : 3)), maxZ + 1,
  );
  res.status(201).json(db.prepare('SELECT * FROM workbook_page_annotations WHERE id = ?').get(r.lastInsertRowid) as AnnotationRow);
});

router.patch('/pages/annotations/:aid', (req: Request, res: Response) => {
  const id = Number(req.params.aid);
  const cur = db.prepare('SELECT * FROM workbook_page_annotations WHERE id = ?').get(id) as AnnotationRow | undefined;
  if (!cur) { res.status(404).json({ error: 'not found' }); return; }
  const b = (req.body ?? {}) as Record<string, unknown>;
  const sets: string[] = []; const vals: unknown[] = [];
  for (const f of ['x1', 'y1', 'x2', 'y2'] as const) if (f in b) { sets.push(`${f} = ?`); vals.push(num(b[f], cur[f])); }
  if ('text' in b) { sets.push('text = ?'); vals.push(String(b.text ?? '').slice(0, 2000)); }
  if ('color' in b) { sets.push('color = ?'); vals.push(String(b.color ?? '').slice(0, 20)); }
  if ('size' in b) { sets.push('size = ?'); vals.push(Math.max(1, num(b.size, cur.size))); }
  if ('z' in b) { sets.push('z = ?'); vals.push(Math.trunc(num(b.z, cur.z))); }
  if (sets.length === 0) { res.json(cur); return; }
  db.prepare(`UPDATE workbook_page_annotations SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id);
  res.json(db.prepare('SELECT * FROM workbook_page_annotations WHERE id = ?').get(id) as AnnotationRow);
});

router.delete('/pages/annotations/:aid', (req: Request, res: Response) => {
  const id = Number(req.params.aid);
  db.prepare('DELETE FROM workbook_page_annotations WHERE id = ?').run(id);
  res.status(204).end();
});

export default router;
