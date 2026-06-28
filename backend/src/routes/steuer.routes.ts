import { Router, type Request, type Response } from 'express';
import db from '../db/connection';
import multer from 'multer';
import path from 'path';
import os from 'os';
import fs from 'fs';
import crypto from 'crypto';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { ZipArchive } from 'archiver';
import { createBackup } from '../db/backup';

const router = Router();
const MAX_NAME = 300;
const MAX_NOTE = 2000;

const FILES_DIR = path.join(os.homedir(), '.local', 'share', 'benny-dashboard', 'steuer-files');
if (!fs.existsSync(FILES_DIR)) fs.mkdirSync(FILES_DIR, { recursive: true });
const fileUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, FILES_DIR),
    filename: (_req, file, cb) => cb(null, `${crypto.randomUUID()}${path.extname(file.originalname) || ''}`),
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
});
function deleteFileFromDisk(filename: string | null | undefined) {
  if (!filename) return;
  const abs = path.resolve(FILES_DIR, filename);
  if (!abs.startsWith(path.resolve(FILES_DIR) + path.sep)) return;
  try { fs.unlinkSync(abs); } catch { /* schon weg */ }
}

interface CategoryRow { id: number; jahr: number; sort_order: number; name: string; created_at: number; updated_at: number; }
interface ItemRow { id: number; category_id: number; sort_order: number; title: string; is_done: number; note: string | null; created_at: number; updated_at: number; }
interface FileRow { id: number; item_id: number; sort_order: number; file_path: string; original_name: string | null; mime: string | null; created_at: number; }

function loadCategory(id: number): CategoryRow | undefined { return db.prepare(`SELECT * FROM steuer_categories WHERE id = ?`).get(id) as CategoryRow | undefined; }
function loadItem(id: number): ItemRow | undefined { return db.prepare(`SELECT * FROM steuer_items WHERE id = ?`).get(id) as ItemRow | undefined; }
function loadFileForItem(itemId: number, fId: number): FileRow | undefined { return db.prepare(`SELECT * FROM steuer_item_files WHERE id = ? AND item_id = ?`).get(fId, itemId) as FileRow | undefined; }
function loadFiles(itemId: number): FileRow[] { return db.prepare(`SELECT * FROM steuer_item_files WHERE item_id = ? ORDER BY sort_order, id`).all(itemId) as FileRow[]; }
function loadItemsWithFiles(catId: number) {
  const items = db.prepare(`SELECT * FROM steuer_items WHERE category_id = ? ORDER BY sort_order, id`).all(catId) as ItemRow[];
  return items.map(it => ({ ...it, files: loadFiles(it.id) }));
}
function loadCategoriesForYear(jahr: number) {
  const cats = db.prepare(`SELECT * FROM steuer_categories WHERE jahr = ? ORDER BY sort_order, id`).all(jahr) as CategoryRow[];
  return cats.map(c => ({ ...c, items: loadItemsWithFiles(c.id) }));
}
function normText(raw: unknown, max: number): { skip: true } | { skip: false; value: string | null } | { error: true } {
  if (raw === undefined) return { skip: true };
  if (raw === null) return { skip: false, value: null };
  if (typeof raw !== 'string') return { error: true };
  const t = raw.trim();
  if (t.length === 0) return { skip: false, value: null };
  if (t.length > max) return { error: true };
  return { skip: false, value: t };
}

// pdf-lib StandardFont (WinAnsi) kann nicht alle Unicode-Zeichen — ASCII + deutsche Umlaute behalten, Rest -> '?'
function safeText(s: string): string {
  return Array.from(s ?? '').map(ch => {
    const c = ch.codePointAt(0) ?? 0;
    if (c >= 32 && c <= 126) return ch;
    if ('äöüÄÖÜß€'.includes(ch)) return ch;
    return '?';
  }).join('');
}

function sanitizeName(s: string): string {
  // nur echte unzulaessige Pfadzeichen + Steuerzeichen ersetzen; Leerzeichen/Bindestriche bleiben erhalten
  const cleaned = (s ?? '').replace(/[/\\:*?"<>| -]/g, '_').replace(/\s+/g, ' ').trim();
  return cleaned.length ? cleaned.slice(0, 120) : 'Unbenannt';
}

async function buildExportPdf(jahr: number, itemIds: number[] | 'all'): Promise<Buffer | null> {
  const cats = db.prepare(`SELECT * FROM steuer_categories WHERE jahr = ? ORDER BY sort_order, id`).all(jahr) as CategoryRow[];
  const wanted = itemIds === 'all' ? null : new Set(itemIds);
  type EntryItem = { title: string; note: string | null; files: string[] };
  type Entry = { categoryName: string; items: EntryItem[] };
  const entries: Entry[] = [];
  for (const c of cats) {
    const items = db.prepare(`SELECT * FROM steuer_items WHERE category_id = ? ORDER BY sort_order, id`).all(c.id) as ItemRow[];
    const eItems: EntryItem[] = [];
    for (const it of items) {
      if (wanted && !wanted.has(it.id)) continue;
      eItems.push({ title: it.title, note: it.note, files: loadFiles(it.id).map(f => f.original_name || 'Datei') });
    }
    if (eItems.length) entries.push({ categoryName: c.name, items: eItems });
  }
  if (entries.length === 0) return null;

  const A4W = 595.28, A4H = 841.89, M = 50;
  const out = await PDFDocument.create();
  const font = await out.embedFont(StandardFonts.Helvetica);
  const fontBold = await out.embedFont(StandardFonts.HelveticaBold);

  let page = out.addPage([A4W, A4H]);
  let y = A4H - M;
  function ensure(space: number) { if (y - space < M) { page = out.addPage([A4W, A4H]); y = A4H - M; } }
  function line(text: string, opts: { size: number; bold?: boolean; x?: number; gapBefore?: number; gapAfter?: number; color?: ReturnType<typeof rgb> }) {
    const x = opts.x ?? M;
    if (opts.gapBefore) y -= opts.gapBefore;
    const f = opts.bold ? fontBold : font;
    const maxW = A4W - M - x;
    const safe = safeText(text);
    const parts: string[] = [];
    let cur = '';
    for (const ch of safe) { const t = cur + ch; if (cur && f.widthOfTextAtSize(t, opts.size) > maxW) { parts.push(cur); cur = ch; } else cur = t; }
    parts.push(cur);
    for (let i = 0; i < parts.length; i++) {
      ensure(opts.size + 4);
      page.drawText(parts[i], { x: i === 0 ? x : x + 8, y: y - opts.size, size: opts.size, font: f, color: opts.color ?? rgb(0, 0, 0) });
      y -= opts.size * 1.35;
    }
    if (opts.gapAfter) y -= opts.gapAfter;
  }

  line(`Steuer-Checkliste ${jahr}`, { size: 20, bold: true, gapAfter: 6 });

  for (const e of entries) {
    line(e.categoryName || 'Überbegriff', { size: 14, bold: true, gapBefore: 10, gapAfter: 2, color: rgb(0.1, 0.1, 0.1) });
    for (const it of e.items) {
      line(it.title || 'Punkt', { size: 11, bold: true, x: M + 12, gapBefore: 4 });
      if (it.note && it.note.trim()) {
        line(`Notiz: ${it.note.trim()}`, { size: 10, x: M + 28, color: rgb(0.45, 0.45, 0.45) });
      }
      if (it.files.length === 0) {
        line('(keine Datei)', { size: 10, x: M + 28, color: rgb(0.55, 0.55, 0.55) });
      } else {
        for (const fn of it.files) line(`- ${fn}`, { size: 10, x: M + 28, color: rgb(0.2, 0.2, 0.2) });
      }
    }
  }
  const bytes = await out.save();
  return Buffer.from(bytes);
}

// Jahre (literal — VOR /:jahr registrieren)
router.get('/jahre', (_req: Request, res: Response) => {
  const rows = db.prepare(`SELECT DISTINCT jahr FROM steuer_categories ORDER BY jahr DESC`).all() as Array<{ jahr: number }>;
  const set = new Set(rows.map(r => r.jahr));
  set.add(new Date().getFullYear());
  res.json({ jahre: Array.from(set).sort((a, b) => b - a) });
});

// copy-year (literal — VOR /:jahr-Familie unkritisch, eigener Pfad)
router.post('/copy-year', (req: Request, res: Response) => {
  const body = (req.body ?? {}) as { from_jahr?: unknown; to_jahr?: unknown };
  const from = Number(body.from_jahr); const to = Number(body.to_jahr);
  if (!Number.isInteger(from) || !Number.isInteger(to)) { res.status(400).json({ error: 'invalid jahr' }); return; }
  const toCount = (db.prepare(`SELECT COUNT(*) AS c FROM steuer_categories WHERE jahr = ?`).get(to) as { c: number }).c;
  if (toCount > 0) { res.status(400).json({ error: 'zieljahr nicht leer' }); return; }
  const cats = db.prepare(`SELECT * FROM steuer_categories WHERE jahr = ? ORDER BY sort_order, id`).all(from) as CategoryRow[];
  db.transaction(() => {
    for (const c of cats) {
      const r = db.prepare(`INSERT INTO steuer_categories (jahr, sort_order, name) VALUES (?, ?, ?)`).run(to, c.sort_order, c.name);
      const newCatId = Number(r.lastInsertRowid);
      const items = db.prepare(`SELECT * FROM steuer_items WHERE category_id = ? ORDER BY sort_order, id`).all(c.id) as ItemRow[];
      for (const it of items) db.prepare(`INSERT INTO steuer_items (category_id, sort_order, title, is_done, note) VALUES (?, ?, ?, 0, ?)`).run(newCatId, it.sort_order, it.title, it.note);
    }
  })();
  res.status(201).json({ categories: loadCategoriesForYear(to) });
});

// sync-year (literal — additiver Abgleich; MUSS vor /:jahr-Familie stehen)
router.post('/sync-year', (req: Request, res: Response) => {
  const body = (req.body ?? {}) as { from_jahr?: unknown; to_jahr?: unknown };
  const from = Number(body.from_jahr); const to = Number(body.to_jahr);
  if (!Number.isInteger(from) || !Number.isInteger(to)) { res.status(400).json({ error: 'invalid jahr' }); return; }
  if (from === to) { res.status(400).json({ error: 'gleiches jahr' }); return; }

  const fromCats = db.prepare(`SELECT * FROM steuer_categories WHERE jahr = ? ORDER BY sort_order, id`).all(from) as CategoryRow[];
  if (fromCats.length === 0) {
    res.status(201).json({ categories: loadCategoriesForYear(to), summary: { addedCategories: 0, addedItems: 0 } });
    return;
  }

  // Datensicherheit — Backup vor der Bulk-Operation (Benutzerwunsch, auch bei reinen Inserts)
  createBackup('steuer-sync-year');

  let addedCategories = 0;
  let addedItems = 0;

  const insCat = db.prepare(`INSERT INTO steuer_categories (jahr, sort_order, name) VALUES (?, ?, ?)`);
  const insItem = db.prepare(`INSERT INTO steuer_items (category_id, sort_order, title, is_done, note) VALUES (?, ?, ?, 0, ?)`);

  db.transaction(() => {
    // Ziel-Kategorien nach getrimmtem Namen indexieren
    const toCats = db.prepare(`SELECT * FROM steuer_categories WHERE jahr = ?`).all(to) as CategoryRow[];
    const toCatByTrimmedName = new Map<string, CategoryRow>();
    for (const c of toCats) toCatByTrimmedName.set(c.name.trim(), c);

    let maxCatOrder = (db.prepare(`SELECT COALESCE(MAX(sort_order),0) AS m FROM steuer_categories WHERE jahr = ?`).get(to) as { m: number }).m;

    for (const fc of fromCats) {
      const key = fc.name.trim();
      let target = toCatByTrimmedName.get(key);

      if (!target) {
        // Fehlende Kategorie hinten anlegen, danach alle Punkte uebernehmen
        maxCatOrder += 1;
        const r = insCat.run(to, maxCatOrder, fc.name);
        const newCatId = Number(r.lastInsertRowid);
        target = { id: newCatId } as CategoryRow;
        toCatByTrimmedName.set(key, target);
        addedCategories++;

        const items = db.prepare(`SELECT * FROM steuer_items WHERE category_id = ? ORDER BY sort_order, id`).all(fc.id) as ItemRow[];
        let order = 0;
        for (const it of items) { order += 1; insItem.run(newCatId, order, it.title, it.note); addedItems++; }
      } else {
        // Bestehende Kategorie: nur fehlende Punkte hinten ergaenzen
        const existing = db.prepare(`SELECT title FROM steuer_items WHERE category_id = ?`).all(target.id) as Array<{ title: string }>;
        const existingTitles = new Set(existing.map(e => e.title.trim()));
        let maxItemOrder = (db.prepare(`SELECT COALESCE(MAX(sort_order),0) AS m FROM steuer_items WHERE category_id = ?`).get(target.id) as { m: number }).m;

        const items = db.prepare(`SELECT * FROM steuer_items WHERE category_id = ? ORDER BY sort_order, id`).all(fc.id) as ItemRow[];
        for (const it of items) {
          const tk = it.title.trim();
          if (existingTitles.has(tk)) continue;
          maxItemOrder += 1;
          insItem.run(target.id, maxItemOrder, it.title, it.note);
          existingTitles.add(tk);
          addedItems++;
        }
      }
    }
  })();

  res.status(201).json({ categories: loadCategoriesForYear(to), summary: { addedCategories, addedItems } });
});

// Kategorie-Reorder (literal-Segment 'reorder' — VOR /categories/:id)
router.patch('/:jahr/categories/reorder', (req: Request, res: Response) => {
  const jahr = Number(req.params.jahr);
  if (!Number.isInteger(jahr)) { res.status(400).json({ error: 'invalid jahr' }); return; }
  const order = (req.body as { order?: unknown })?.order;
  if (!Array.isArray(order) || order.some(x => !Number.isInteger(x))) { res.status(400).json({ error: 'invalid order' }); return; }
  const ownIds = new Set((db.prepare(`SELECT id FROM steuer_categories WHERE jahr = ?`).all(jahr) as Array<{ id: number }>).map(o => o.id));
  if (order.length !== ownIds.size || order.some((x: number) => !ownIds.has(x))) { res.status(400).json({ error: 'order mismatch' }); return; }
  const upd = db.prepare(`UPDATE steuer_categories SET sort_order = ? WHERE id = ?`);
  db.transaction(() => { order.forEach((cid: number, idx: number) => upd.run(idx + 1, cid)); })();
  res.json({ categories: loadCategoriesForYear(jahr) });
});

router.post('/:jahr/categories', (req: Request, res: Response) => {
  const jahr = Number(req.params.jahr);
  if (!Number.isInteger(jahr)) { res.status(400).json({ error: 'invalid jahr' }); return; }
  const nameRaw = (req.body as { name?: unknown })?.name;
  const name = typeof nameRaw === 'string' ? nameRaw.trim().slice(0, MAX_NAME) : '';
  const maxOrder = (db.prepare(`SELECT COALESCE(MAX(sort_order),0) AS m FROM steuer_categories WHERE jahr = ?`).get(jahr) as { m: number }).m;
  const r = db.prepare(`INSERT INTO steuer_categories (jahr, sort_order, name) VALUES (?, ?, ?)`).run(jahr, maxOrder + 1, name);
  const cat = loadCategory(Number(r.lastInsertRowid)) as CategoryRow;
  res.status(201).json({ category: { ...cat, items: [] } });
});

router.post('/:jahr/export', async (req: Request, res: Response) => {
  const jahr = Number(req.params.jahr);
  if (!Number.isInteger(jahr)) { res.status(400).json({ error: 'invalid jahr' }); return; }
  const raw = (req.body as { item_ids?: unknown })?.item_ids;
  let itemIds: number[] | 'all';
  if (raw === 'all') itemIds = 'all';
  else if (Array.isArray(raw) && raw.every(x => Number.isInteger(x))) itemIds = raw as number[];
  else { res.status(400).json({ error: 'invalid item_ids' }); return; }
  const pdf = await buildExportPdf(jahr, itemIds);
  if (!pdf) { res.status(400).json({ error: 'keine dokumente' }); return; }
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Steuer-${jahr}.pdf"`);
  res.send(pdf);
});

router.post('/:jahr/export-zip', async (req: Request, res: Response) => {
  const jahr = Number(req.params.jahr);
  if (!Number.isInteger(jahr)) { res.status(400).json({ error: 'invalid jahr' }); return; }
  const raw = (req.body as { item_ids?: unknown })?.item_ids;
  let itemIds: number[] | 'all';
  if (raw === 'all') itemIds = 'all';
  else if (Array.isArray(raw) && raw.every(x => Number.isInteger(x))) itemIds = raw as number[];
  else { res.status(400).json({ error: 'invalid item_ids' }); return; }

  const cats = db.prepare(`SELECT * FROM steuer_categories WHERE jahr = ? ORDER BY sort_order, id`).all(jahr) as CategoryRow[];
  const wanted = itemIds === 'all' ? null : new Set(itemIds);
  type Entry = { categoryName: string; itemTitle: string; files: FileRow[] };
  const entries: Entry[] = [];
  for (const c of cats) {
    const items = db.prepare(`SELECT * FROM steuer_items WHERE category_id = ? ORDER BY sort_order, id`).all(c.id) as ItemRow[];
    for (const it of items) {
      if (wanted && !wanted.has(it.id)) continue;
      const files = loadFiles(it.id);
      if (files.length === 0) continue;
      entries.push({ categoryName: c.name, itemTitle: it.title, files });
    }
  }
  if (entries.length === 0) { res.status(400).json({ error: 'keine dokumente' }); return; }

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="Steuer-${jahr}.zip"`);
  const archive = new ZipArchive({ zlib: { level: 9 } });
  archive.on('error', () => { try { res.destroy(); } catch { /* ignore */ } });
  archive.pipe(res);
  const used = new Set<string>();
  for (const e of entries) {
    const folder = `${sanitizeName(e.categoryName || 'Überbegriff')}/${sanitizeName(e.itemTitle || 'Punkt')}`;
    for (const f of e.files) {
      const abs = path.resolve(FILES_DIR, f.file_path);
      if (!abs.startsWith(path.resolve(FILES_DIR) + path.sep) || !fs.existsSync(abs)) continue;
      const baseName = sanitizeName(f.original_name || `datei${path.extname(f.file_path) || ''}`);
      let name = `${folder}/${baseName}`;
      if (used.has(name)) {
        const ext = path.extname(baseName); const stem = baseName.slice(0, baseName.length - ext.length);
        let i = 2; while (used.has(`${folder}/${stem} (${i})${ext}`)) i++;
        name = `${folder}/${stem} (${i})${ext}`;
      }
      used.add(name);
      archive.file(abs, { name });
    }
  }
  await archive.finalize();
});

router.patch('/categories/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !loadCategory(id)) { res.status(404).json({ error: 'not found' }); return; }
  const n = normText((req.body as { name?: unknown })?.name, MAX_NAME);
  if ('error' in n) { res.status(400).json({ error: 'invalid name' }); return; }
  if (!n.skip) db.prepare(`UPDATE steuer_categories SET name = ?, updated_at = unixepoch() WHERE id = ?`).run(n.value ?? '', id);
  const cat = loadCategory(id) as CategoryRow;
  res.json({ category: { ...cat, items: loadItemsWithFiles(id) } });
});

router.delete('/categories/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !loadCategory(id)) { res.status(404).json({ error: 'not found' }); return; }
  const itemIds = (db.prepare(`SELECT id FROM steuer_items WHERE category_id = ?`).all(id) as Array<{ id: number }>).map(i => i.id);
  const fileRows = itemIds.flatMap(iid => loadFiles(iid));
  db.transaction(() => {
    if (itemIds.length) {
      db.prepare(`DELETE FROM steuer_item_files WHERE item_id IN (${itemIds.map(() => '?').join(',')})`).run(...itemIds);
      db.prepare(`DELETE FROM steuer_items WHERE category_id = ?`).run(id);
    }
    db.prepare(`DELETE FROM steuer_categories WHERE id = ?`).run(id);
  })();
  fileRows.forEach(f => deleteFileFromDisk(f.file_path));
  res.status(204).end();
});

// Punkt-Reorder (literal 'reorder' VOR /items/:id ist nicht nötig — anderer Pfad — aber sauber halten)
router.patch('/categories/:id/items/reorder', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !loadCategory(id)) { res.status(404).json({ error: 'not found' }); return; }
  const order = (req.body as { order?: unknown })?.order;
  if (!Array.isArray(order) || order.some(x => !Number.isInteger(x))) { res.status(400).json({ error: 'invalid order' }); return; }
  const own = new Set((db.prepare(`SELECT id FROM steuer_items WHERE category_id = ?`).all(id) as Array<{ id: number }>).map(o => o.id));
  if (order.length !== own.size || order.some((x: number) => !own.has(x))) { res.status(400).json({ error: 'order mismatch' }); return; }
  const upd = db.prepare(`UPDATE steuer_items SET sort_order = ? WHERE id = ?`);
  db.transaction(() => { order.forEach((iid: number, idx: number) => upd.run(idx + 1, iid)); })();
  res.json({ items: loadItemsWithFiles(id) });
});

router.post('/categories/:id/items', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !loadCategory(id)) { res.status(404).json({ error: 'not found' }); return; }
  const titleRaw = (req.body as { title?: unknown })?.title;
  const title = typeof titleRaw === 'string' ? titleRaw.trim().slice(0, MAX_NAME) : '';
  const maxOrder = (db.prepare(`SELECT COALESCE(MAX(sort_order),0) AS m FROM steuer_items WHERE category_id = ?`).get(id) as { m: number }).m;
  const r = db.prepare(`INSERT INTO steuer_items (category_id, sort_order, title) VALUES (?, ?, ?)`).run(id, maxOrder + 1, title);
  const it = loadItem(Number(r.lastInsertRowid)) as ItemRow;
  res.status(201).json({ item: { ...it, files: [] } });
});

router.patch('/items/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !loadItem(id)) { res.status(404).json({ error: 'not found' }); return; }
  const body = (req.body ?? {}) as { title?: unknown; is_done?: unknown; note?: unknown };
  const sets: string[] = []; const vals: unknown[] = [];
  if (body.title !== undefined) {
    if (typeof body.title !== 'string' || body.title.trim().length > MAX_NAME) { res.status(400).json({ error: 'invalid title' }); return; }
    sets.push('title = ?'); vals.push(body.title.trim());
  }
  if (body.is_done !== undefined) {
    if (body.is_done !== 0 && body.is_done !== 1) { res.status(400).json({ error: 'invalid is_done' }); return; }
    sets.push('is_done = ?'); vals.push(body.is_done);
  }
  if ('note' in body) {
    const n = normText(body.note, MAX_NOTE);
    if ('error' in n) { res.status(400).json({ error: 'invalid note' }); return; }
    if (!n.skip) { sets.push('note = ?'); vals.push(n.value); }
  }
  if (sets.length) { sets.push('updated_at = unixepoch()'); db.prepare(`UPDATE steuer_items SET ${sets.join(', ')} WHERE id = ?`).run(...vals, id); }
  const it = loadItem(id) as ItemRow;
  res.json({ item: { ...it, files: loadFiles(id) } });
});

router.delete('/items/:id', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !loadItem(id)) { res.status(404).json({ error: 'not found' }); return; }
  const files = loadFiles(id);
  db.transaction(() => {
    db.prepare(`DELETE FROM steuer_item_files WHERE item_id = ?`).run(id);
    db.prepare(`DELETE FROM steuer_items WHERE id = ?`).run(id);
  })();
  files.forEach(f => deleteFileFromDisk(f.file_path));
  res.status(204).end();
});

router.post('/items/:id/files', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !loadItem(id)) { res.status(404).json({ error: 'not found' }); return; }
  fileUpload.single('file')(req, res, (err: unknown) => {
    if (err) { res.status(400).json({ error: err instanceof Error ? err.message : 'upload failed' }); return; }
    const file = (req as Request & { file?: { filename: string; originalname: string; mimetype: string } }).file;
    if (!file) { res.status(400).json({ error: 'no file' }); return; }
    const maxOrder = (db.prepare(`SELECT COALESCE(MAX(sort_order),0) AS m FROM steuer_item_files WHERE item_id = ?`).get(id) as { m: number }).m;
    const r = db.prepare(`INSERT INTO steuer_item_files (item_id, sort_order, file_path, original_name, mime) VALUES (?, ?, ?, ?, ?)`)
      .run(id, maxOrder + 1, file.filename, Buffer.from(file.originalname, 'latin1').toString('utf8').slice(0, 300), file.mimetype.slice(0, 200));
    res.status(201).json({ file: db.prepare(`SELECT * FROM steuer_item_files WHERE id = ?`).get(r.lastInsertRowid) as FileRow });
  });
});

router.get('/items/:id/files/:fId', (req: Request, res: Response) => {
  const id = Number(req.params.id); const fId = Number(req.params.fId);
  if (!Number.isInteger(id) || !Number.isInteger(fId) || !loadItem(id)) { res.status(404).end(); return; }
  const f = loadFileForItem(id, fId);
  if (!f) { res.status(404).end(); return; }
  const abs = path.resolve(FILES_DIR, f.file_path);
  if (!abs.startsWith(path.resolve(FILES_DIR) + path.sep) || !fs.existsSync(abs)) { res.status(404).end(); return; }
  res.setHeader('Content-Type', f.mime || 'application/octet-stream');
  const ascii = (f.original_name ?? 'datei').replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
  res.setHeader('Content-Disposition', `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(f.original_name ?? 'datei')}`);
  fs.createReadStream(abs).pipe(res);
});

router.delete('/items/:id/files/:fId', (req: Request, res: Response) => {
  const id = Number(req.params.id); const fId = Number(req.params.fId);
  if (!Number.isInteger(id) || !Number.isInteger(fId) || !loadItem(id)) { res.status(404).json({ error: 'not found' }); return; }
  const f = loadFileForItem(id, fId);
  if (!f) { res.status(404).json({ error: 'not found' }); return; }
  db.prepare(`DELETE FROM steuer_item_files WHERE id = ?`).run(fId);
  deleteFileFromDisk(f.file_path);
  res.status(204).end();
});

// GET Jahr (param — NACH /jahre und allen literal-Routen registrieren)
router.get('/:jahr', (req: Request, res: Response) => {
  const jahr = Number(req.params.jahr);
  if (!Number.isInteger(jahr)) { res.status(400).json({ error: 'invalid jahr' }); return; }
  res.json({ jahr, categories: loadCategoriesForYear(jahr) });
});

export default router;
