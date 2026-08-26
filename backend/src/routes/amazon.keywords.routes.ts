import { Router, type Request, type Response } from 'express';
import db from '../db/connection';
import { createBackup } from '../db/backup';

// ── Typen ──
interface KeywordSourceRow {
  id: number; product_id: number; sort_order: number;
  asin: string; url: string; revenue: string;
  created_at: number; updated_at: number;
}
interface KeywordRow {
  id: number; product_id: number; phrase: string;
  search_volume: number | null; source: string; is_main: number;
  target_field: string; sort_order: number;
  created_at: number; updated_at: number;
}

const router = Router();

const MAX_SHORT = 500;    // asin/url/revenue/source
const MAX_PHRASE = 300;   // ein Keyword
const MAX_BULK = 2000;    // Sicherheitslimit pro Massen-Paste
// Erlaubte Ziel-Felder für die Feld-Zuordnung (leer = keine Zuordnung).
const TARGET_FIELDS = new Set(['', 'title', 'bullet_1', 'bullet_2', 'bullet_3', 'bullet_4', 'bullet_5', 'backend']);

function ensureProduct(id: number): boolean {
  return db.prepare(`SELECT 1 FROM amazon_products WHERE id = ?`).get(id) !== undefined;
}
function loadSource(productId: number, sid: number): KeywordSourceRow | undefined {
  return db.prepare(`SELECT * FROM amazon_keyword_sources WHERE id = ? AND product_id = ?`).get(sid, productId) as KeywordSourceRow | undefined;
}
function loadKeyword(productId: number, kid: number): KeywordRow | undefined {
  return db.prepare(`SELECT * FROM amazon_keywords WHERE id = ? AND product_id = ?`).get(kid, productId) as KeywordRow | undefined;
}
function clampVolume(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.trunc(n));
}
// Keywords inkl. Abdeckung: coverage = wie viele Quellen-ASINs für das Keyword ranken,
// coverage_total = Anzahl Quellen des Produkts gesamt (für die Anzeige „5 / 7").
function listKeywords(productId: number): (KeywordRow & { coverage: number; coverage_total: number })[] {
  const total = (db.prepare(`SELECT COUNT(*) AS c FROM amazon_keyword_sources WHERE product_id = ?`).get(productId) as { c: number }).c;
  const rows = db.prepare(
    `SELECT k.*, (SELECT COUNT(*) FROM amazon_keyword_source_links l WHERE l.keyword_id = k.id) AS coverage
     FROM amazon_keywords k WHERE k.product_id = ? ORDER BY k.is_main DESC, k.sort_order, k.id`,
  ).all(productId) as (KeywordRow & { coverage: number })[];
  return rows.map(r => ({ ...r, coverage_total: total }));
}

// ═══════════════════════ Quellen ═══════════════════════

// ── GET Quellen ──
router.get('/products/:id/keyword-sources', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) { res.status(404).json({ error: 'not found' }); return; }
  const rows = db.prepare(`SELECT * FROM amazon_keyword_sources WHERE product_id = ? ORDER BY sort_order, id`).all(id) as KeywordSourceRow[];
  res.json({ sources: rows });
});

// ── POST leere Quelle ──
router.post('/products/:id/keyword-sources', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) { res.status(404).json({ error: 'not found' }); return; }
  const maxOrder = (db.prepare(`SELECT COALESCE(MAX(sort_order),0) AS m FROM amazon_keyword_sources WHERE product_id = ?`).get(id) as { m: number }).m;
  const r = db.prepare(`INSERT INTO amazon_keyword_sources (product_id, sort_order) VALUES (?, ?)`).run(id, maxOrder + 1);
  res.status(201).json({ source: db.prepare(`SELECT * FROM amazon_keyword_sources WHERE id = ?`).get(r.lastInsertRowid) as KeywordSourceRow });
});

// ── POST Import aus Mitbewerbern (Massen-Insert -> Backup) ──
router.post('/products/:id/keyword-sources/import-competitors', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) { res.status(404).json({ error: 'not found' }); return; }
  const competitors = db.prepare(
    `SELECT asin, url FROM amazon_competitors WHERE product_id = ? AND TRIM(asin) <> '' ORDER BY is_main DESC, sort_order, id`,
  ).all(id) as { asin: string; url: string }[];
  const existing = new Set(
    (db.prepare(`SELECT asin FROM amazon_keyword_sources WHERE product_id = ?`).all(id) as { asin: string }[])
      .map(r => r.asin.trim().toLowerCase()).filter(Boolean),
  );
  const toAdd = competitors.filter(c => !existing.has(c.asin.trim().toLowerCase()));
  if (toAdd.length === 0) { res.json({ added: 0, sources: db.prepare(`SELECT * FROM amazon_keyword_sources WHERE product_id = ? ORDER BY sort_order, id`).all(id) }); return; }

  createBackup('keywords-import-competitors');
  let order = (db.prepare(`SELECT COALESCE(MAX(sort_order),0) AS m FROM amazon_keyword_sources WHERE product_id = ?`).get(id) as { m: number }).m;
  const ins = db.prepare(`INSERT INTO amazon_keyword_sources (product_id, sort_order, asin, url) VALUES (?, ?, ?, ?)`);
  const tx = db.transaction((rows: { asin: string; url: string }[]) => {
    for (const c of rows) ins.run(id, ++order, c.asin.slice(0, MAX_SHORT), (c.url ?? '').slice(0, MAX_SHORT));
  });
  tx(toAdd);
  res.json({ added: toAdd.length, sources: db.prepare(`SELECT * FROM amazon_keyword_sources WHERE product_id = ? ORDER BY sort_order, id`).all(id) as KeywordSourceRow[] });
});

// ── PATCH Quelle ──
const SOURCE_FIELDS = ['asin', 'url', 'revenue'] as const;
router.patch('/products/:id/keyword-sources/:sid', (req: Request, res: Response) => {
  const id = Number(req.params.id); const sid = Number(req.params.sid);
  if (!Number.isInteger(id) || !Number.isInteger(sid) || !loadSource(id, sid)) { res.status(404).json({ error: 'not found' }); return; }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const sets: string[] = []; const vals: unknown[] = [];
  for (const f of SOURCE_FIELDS) {
    if (f in body) { sets.push(`${f} = ?`); vals.push(String(body[f] ?? '').slice(0, MAX_SHORT)); }
  }
  if (sets.length === 0) { res.json({ source: loadSource(id, sid) }); return; }
  sets.push('updated_at = unixepoch()');
  db.prepare(`UPDATE amazon_keyword_sources SET ${sets.join(', ')} WHERE id = ?`).run(...vals, sid);
  res.json({ source: loadSource(id, sid) });
});

// ── DELETE Quelle ──
router.delete('/products/:id/keyword-sources/:sid', (req: Request, res: Response) => {
  const id = Number(req.params.id); const sid = Number(req.params.sid);
  if (!Number.isInteger(id) || !Number.isInteger(sid) || !loadSource(id, sid)) { res.status(404).json({ error: 'not found' }); return; }
  db.prepare(`DELETE FROM amazon_keyword_sources WHERE id = ?`).run(sid);
  res.status(204).end();
});

// ═══════════════════════ Keywords ═══════════════════════

// ── GET Keywords ──
router.get('/products/:id/keywords', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) { res.status(404).json({ error: 'not found' }); return; }
  res.json({ keywords: listKeywords(id) });
});

// ── POST einzelnes Keyword (INSERT OR IGNORE -> Dedup) ──
router.post('/products/:id/keywords', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) { res.status(404).json({ error: 'not found' }); return; }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const phrase = String(body.phrase ?? '').trim().slice(0, MAX_PHRASE);
  if (!phrase) { res.status(400).json({ error: 'phrase fehlt' }); return; }
  const source = String(body.source ?? '').slice(0, MAX_SHORT);
  const maxOrder = (db.prepare(`SELECT COALESCE(MAX(sort_order),0) AS m FROM amazon_keywords WHERE product_id = ?`).get(id) as { m: number }).m;
  db.prepare(`INSERT OR IGNORE INTO amazon_keywords (product_id, phrase, source, sort_order) VALUES (?, ?, ?, ?)`).run(id, phrase, source, maxOrder + 1);
  const row = db.prepare(`SELECT * FROM amazon_keywords WHERE product_id = ? AND phrase = ? COLLATE NOCASE`).get(id, phrase) as KeywordRow | undefined;
  res.status(201).json({ keyword: row });
});

// ── POST Massen-Paste (Massen-Insert -> Backup) ──
router.post('/products/:id/keywords/bulk', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) { res.status(404).json({ error: 'not found' }); return; }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const source = String(body.source ?? '').slice(0, MAX_SHORT);
  // phrases als Array ODER text (mit Zeilenumbrüchen) akzeptieren.
  let raw: string[];
  if (Array.isArray(body.phrases)) raw = body.phrases.map(v => String(v));
  else raw = String(body.text ?? body.phrases ?? '').split(/\r?\n/);
  // trimmen, leere raus, batch-intern deduplizieren (case-insensitive), Limit.
  const seen = new Set<string>();
  const phrases: string[] = [];
  for (const line of raw) {
    const p = line.trim().slice(0, MAX_PHRASE);
    if (!p) continue;
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    phrases.push(p);
    if (phrases.length >= MAX_BULK) break;
  }
  if (phrases.length === 0) { res.json({ added: 0, keywords: listKeywords(id) }); return; }

  createBackup('keywords-bulk-import');
  let order = (db.prepare(`SELECT COALESCE(MAX(sort_order),0) AS m FROM amazon_keywords WHERE product_id = ?`).get(id) as { m: number }).m;
  const ins = db.prepare(`INSERT OR IGNORE INTO amazon_keywords (product_id, phrase, source, sort_order) VALUES (?, ?, ?, ?)`);
  let added = 0;
  const tx = db.transaction((list: string[]) => {
    for (const p of list) { const r = ins.run(id, p, source, ++order); if (r.changes > 0) added++; }
  });
  tx(phrases);
  res.json({ added, keywords: listKeywords(id) });
});

// ── PATCH Keyword ──
router.patch('/products/:id/keywords/:kid', (req: Request, res: Response) => {
  const id = Number(req.params.id); const kid = Number(req.params.kid);
  if (!Number.isInteger(id) || !Number.isInteger(kid) || !loadKeyword(id, kid)) { res.status(404).json({ error: 'not found' }); return; }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const sets: string[] = []; const vals: unknown[] = [];
  if ('phrase' in body) {
    const p = String(body.phrase ?? '').trim().slice(0, MAX_PHRASE);
    if (!p) { res.status(400).json({ error: 'phrase leer' }); return; }
    sets.push('phrase = ?'); vals.push(p);
  }
  if ('source' in body) { sets.push('source = ?'); vals.push(String(body.source ?? '').slice(0, MAX_SHORT)); }
  if ('search_volume' in body) { sets.push('search_volume = ?'); vals.push(clampVolume(body.search_volume)); }
  if ('is_main' in body) { sets.push('is_main = ?'); vals.push(body.is_main ? 1 : 0); }
  if ('target_field' in body) {
    const tf = String(body.target_field ?? '');
    sets.push('target_field = ?'); vals.push(TARGET_FIELDS.has(tf) ? tf : '');
  }
  if (sets.length === 0) { res.json({ keyword: loadKeyword(id, kid) }); return; }
  sets.push('updated_at = unixepoch()');
  try {
    db.prepare(`UPDATE amazon_keywords SET ${sets.join(', ')} WHERE id = ?`).run(...vals, kid);
  } catch (e) {
    // Unique-Index verletzt (phrase-Dublette) -> sauberer 409 statt 500.
    if (e instanceof Error && /UNIQUE/.test(e.message)) { res.status(409).json({ error: 'Keyword existiert bereits' }); return; }
    throw e;
  }
  res.json({ keyword: loadKeyword(id, kid) });
});

// ── DELETE Keyword ──
router.delete('/products/:id/keywords/:kid', (req: Request, res: Response) => {
  const id = Number(req.params.id); const kid = Number(req.params.kid);
  if (!Number.isInteger(id) || !Number.isInteger(kid) || !loadKeyword(id, kid)) { res.status(404).json({ error: 'not found' }); return; }
  db.prepare(`DELETE FROM amazon_keywords WHERE id = ?`).run(kid);
  res.status(204).end();
});

// ── Helium-10-Import (Massen-Schreiben -> Backup) ──
// Body: { source_label, min_volume, rows: [{ phrase, search_volume, asins[] }] }
// - vorhandene Keywords: Suchvolumen aktualisieren + Links ergänzen (immer)
// - neue Keywords: nur ab min_volume anlegen, dann Volumen + Links
interface ImportRow { phrase: string; search_volume: number | null; asins: string[] }
router.post('/products/:id/keywords/import', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) { res.status(404).json({ error: 'not found' }); return; }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const sourceLabel = String(body.source_label ?? 'Helium 10').slice(0, MAX_SHORT);
  const minVolume = Math.max(0, Math.trunc(Number(body.min_volume) || 0));
  const rawRows = Array.isArray(body.rows) ? (body.rows as unknown[]) : [];
  if (rawRows.length === 0) { res.json({ updated: 0, added: 0, linked: 0, keywords: listKeywords(id) }); return; }
  if (rawRows.length > 20000) { res.status(400).json({ error: 'zu viele Zeilen (max. 20000)' }); return; }

  // Quellen des Produkts nach ASIN (kleingeschrieben) -> source_id.
  const sourceByAsin = new Map<string, number>();
  for (const s of db.prepare(`SELECT id, asin FROM amazon_keyword_sources WHERE product_id = ?`).all(id) as { id: number; asin: string }[]) {
    const a = s.asin.trim().toLowerCase();
    if (a) sourceByAsin.set(a, s.id);
  }

  createBackup('keywords-helium10-import');
  const findKw = db.prepare(`SELECT id FROM amazon_keywords WHERE product_id = ? AND phrase = ? COLLATE NOCASE`);
  const updVol = db.prepare(`UPDATE amazon_keywords SET search_volume = ?, updated_at = unixepoch() WHERE id = ?`);
  const insKw = db.prepare(`INSERT OR IGNORE INTO amazon_keywords (product_id, phrase, search_volume, source, sort_order) VALUES (?, ?, ?, ?, ?)`);
  const insLink = db.prepare(`INSERT OR IGNORE INTO amazon_keyword_source_links (keyword_id, source_id) VALUES (?, ?)`);
  let order = (db.prepare(`SELECT COALESCE(MAX(sort_order),0) AS m FROM amazon_keywords WHERE product_id = ?`).get(id) as { m: number }).m;
  let updated = 0, added = 0, linked = 0;

  const tx = db.transaction((rows: ImportRow[]) => {
    for (const r of rows) {
      const phrase = String(r.phrase ?? '').trim().slice(0, MAX_PHRASE);
      if (!phrase) continue;
      const vol = r.search_volume == null ? null : Math.max(0, Math.trunc(Number(r.search_volume) || 0));
      const sourceIds = (Array.isArray(r.asins) ? r.asins : [])
        .map(a => sourceByAsin.get(String(a).trim().toLowerCase()))
        .filter((x): x is number => typeof x === 'number');

      const existing = findKw.get(id, phrase) as { id: number } | undefined;
      let kid: number;
      if (existing) {
        kid = existing.id;
        if (vol != null) updVol.run(vol, kid);
        updated++;
      } else {
        if (vol == null || vol < minVolume) continue; // neue nur ab Schwelle
        const info = insKw.run(id, phrase, vol, sourceLabel, ++order);
        // INSERT OR IGNORE könnte bei paralleler Dublette nichts einfügen -> id nachschlagen
        kid = info.changes > 0 ? Number(info.lastInsertRowid) : (findKw.get(id, phrase) as { id: number }).id;
        added++;
      }
      for (const sid of sourceIds) { if (insLink.run(kid, sid).changes > 0) linked++; }
    }
  });
  tx(rawRows as ImportRow[]);

  res.json({ updated, added, linked, keywords: listKeywords(id) });
});

export default router;
