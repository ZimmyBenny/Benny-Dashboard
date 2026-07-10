import { Router, type Request, type Response } from 'express';
import db from '../db/connection';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const router = Router();

const MAX_NOTES = 20000;
const MAX_MFR_FIELD = 500;
const MAX_ITEM_NAME = 300;
const MAX_ITEM_TEXT = 2000;

function ensureProduct(id: number): boolean {
  return db.prepare(`SELECT 1 FROM amazon_products WHERE id = ?`).get(id) !== undefined;
}

// ── Typen ──
interface PackagingRow {
  product_id: number;
  single_w: number | null; single_h: number | null; single_d: number | null;
  single_weight_kg: number | null;
  master_w: number | null; master_h: number | null; master_d: number | null;
  units_per_master: number | null;
  master_tare_kg: number | null;
  order_qty: number | null;
  single_final: number; master_final: number;
  mfr_name: string | null; mfr_address: string | null; mfr_contact: string | null;
  notes: string;
  created_at: number; updated_at: number;
}
interface CheckItemRow {
  id: number; product_id: number | null; box_type: 'single' | 'master';
  category: string; name: string; description: string | null; requirement: string | null;
  severity: 'pflicht' | 'empfohlen' | 'optional'; sort_order: number;
  status: 'erledigt' | 'nicht_zutreffend' | null;
}

const PACKAGING_DEFAULTS: Omit<PackagingRow, 'product_id' | 'created_at' | 'updated_at'> = {
  single_w: null, single_h: null, single_d: null, single_weight_kg: null,
  master_w: null, master_h: null, master_d: null, units_per_master: null, master_tare_kg: null,
  order_qty: null, single_final: 0, master_final: 0,
  mfr_name: null, mfr_address: null, mfr_contact: null, notes: '',
};

function loadPackaging(productId: number): PackagingRow {
  const row = db.prepare(`SELECT * FROM amazon_packaging WHERE product_id = ?`).get(productId) as PackagingRow | undefined;
  if (row) return row;
  return { product_id: productId, ...PACKAGING_DEFAULTS, created_at: 0, updated_at: 0 };
}

function loadItemsWithStatus(productId: number): CheckItemRow[] {
  return db.prepare(`
    SELECT i.*, s.status AS status
    FROM amazon_packaging_check_items i
    LEFT JOIN amazon_packaging_check_status s ON s.item_id = i.id AND s.product_id = ?
    WHERE i.product_id IS NULL OR i.product_id = ?
    ORDER BY i.box_type, i.sort_order, i.id
  `).all(productId, productId) as CheckItemRow[];
}

function toNumOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function toIntOrNull(v: unknown): number | null {
  const n = toNumOrNull(v);
  return n === null ? null : Math.trunc(n);
}

// ── Größenklassen-Logik (identisch zum Frontend) ──
type SizeClass = 'Standard' | 'Oversize' | 'Special Oversize' | null;
function computeSizeClass(w: number | null, h: number | null, d: number | null, weightKg: number | null): SizeClass {
  if (w == null || h == null || d == null || weightKg == null) return null;
  const dims = [w, h, d].sort((a, b) => b - a);
  const isStandard = dims[0] <= 45.72 && dims[1] <= 35.56 && dims[2] <= 20.32 && weightKg <= 9.07;
  if (isStandard) return 'Standard';
  if (weightKg <= 68) return 'Oversize';
  return 'Special Oversize';
}

function fmtDe(n: number | null, digits = 1): string {
  if (n === null) return '—';
  return n.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

function getGpsrResponsible(): { name: string; address: string; email: string; phone: string } {
  const row = db.prepare(`SELECT value FROM app_settings WHERE key = ?`).get('gpsr_responsible') as { value: string } | undefined;
  if (!row) return { name: '', address: '', email: '', phone: '' };
  try {
    const parsed = JSON.parse(row.value) as Partial<{ name: string; address: string; email: string; phone: string }>;
    return { name: parsed.name ?? '', address: parsed.address ?? '', email: parsed.email ?? '', phone: parsed.phone ?? '' };
  } catch {
    return { name: '', address: '', email: '', phone: '' };
  }
}

// ════════════════════════════════════════════════════════════════════════════
// GPSR — literaler Pfad, eigenständig registriert.
// Router ist unter /api/amazon gemountet → hier NUR '/gpsr' (kein /amazon-Prefix).
// ════════════════════════════════════════════════════════════════════════════

router.get('/gpsr', (_req: Request, res: Response) => {
  res.json(getGpsrResponsible());
});

router.put('/gpsr', (req: Request, res: Response) => {
  const current = getGpsrResponsible();
  const body = (req.body ?? {}) as { name?: unknown; address?: unknown; email?: unknown; phone?: unknown };
  const next = {
    name: typeof body.name === 'string' ? body.name.trim().slice(0, MAX_MFR_FIELD) : current.name,
    address: typeof body.address === 'string' ? body.address.trim().slice(0, MAX_MFR_FIELD) : current.address,
    email: typeof body.email === 'string' ? body.email.trim().slice(0, MAX_MFR_FIELD) : current.email,
    phone: typeof body.phone === 'string' ? body.phone.trim().slice(0, MAX_MFR_FIELD) : current.phone,
  };
  db.prepare(`INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES ('gpsr_responsible', ?, datetime('now'))`)
    .run(JSON.stringify(next));
  res.json(next);
});

// ════════════════════════════════════════════════════════════════════════════
// Produkt-Packaging — literale Segmente (checks, final, items, briefing.pdf) VOR :itemId.
// ════════════════════════════════════════════════════════════════════════════

router.get('/products/:id/packaging', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) { res.status(404).json({ error: 'product not found' }); return; }
  const packaging = loadPackaging(id);
  const items = loadItemsWithStatus(id).map(i => ({ ...i, is_custom: i.product_id === id }));
  const responsible = getGpsrResponsible();
  res.json({
    packaging,
    items,
    gpsr: {
      responsible,
      manufacturer: { name: packaging.mfr_name, address: packaging.mfr_address, contact: packaging.mfr_contact },
    },
  });
});

router.put('/products/:id/packaging', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) { res.status(404).json({ error: 'product not found' }); return; }
  const body = (req.body ?? {}) as Record<string, unknown>;
  const single_w = toNumOrNull(body.single_w);
  const single_h = toNumOrNull(body.single_h);
  const single_d = toNumOrNull(body.single_d);
  const single_weight_kg = toNumOrNull(body.single_weight_kg);
  const master_w = toNumOrNull(body.master_w);
  const master_h = toNumOrNull(body.master_h);
  const master_d = toNumOrNull(body.master_d);
  const units_per_master = toIntOrNull(body.units_per_master);
  const master_tare_kg = toNumOrNull(body.master_tare_kg);
  const order_qty = toIntOrNull(body.order_qty);
  const mfr_name = typeof body.mfr_name === 'string' ? body.mfr_name.trim().slice(0, MAX_MFR_FIELD) : (body.mfr_name === null ? null : undefined);
  const mfr_address = typeof body.mfr_address === 'string' ? body.mfr_address.trim().slice(0, MAX_MFR_FIELD) : (body.mfr_address === null ? null : undefined);
  const mfr_contact = typeof body.mfr_contact === 'string' ? body.mfr_contact.trim().slice(0, MAX_MFR_FIELD) : (body.mfr_contact === null ? null : undefined);
  const notes = typeof body.notes === 'string' ? body.notes.slice(0, MAX_NOTES) : undefined;

  const existing = db.prepare(`SELECT * FROM amazon_packaging WHERE product_id = ?`).get(id) as PackagingRow | undefined;
  const merged = {
    single_w: 'single_w' in body ? single_w : (existing?.single_w ?? null),
    single_h: 'single_h' in body ? single_h : (existing?.single_h ?? null),
    single_d: 'single_d' in body ? single_d : (existing?.single_d ?? null),
    single_weight_kg: 'single_weight_kg' in body ? single_weight_kg : (existing?.single_weight_kg ?? null),
    master_w: 'master_w' in body ? master_w : (existing?.master_w ?? null),
    master_h: 'master_h' in body ? master_h : (existing?.master_h ?? null),
    master_d: 'master_d' in body ? master_d : (existing?.master_d ?? null),
    units_per_master: 'units_per_master' in body ? units_per_master : (existing?.units_per_master ?? null),
    master_tare_kg: 'master_tare_kg' in body ? master_tare_kg : (existing?.master_tare_kg ?? null),
    order_qty: 'order_qty' in body ? order_qty : (existing?.order_qty ?? null),
    mfr_name: mfr_name !== undefined ? mfr_name : (existing?.mfr_name ?? null),
    mfr_address: mfr_address !== undefined ? mfr_address : (existing?.mfr_address ?? null),
    mfr_contact: mfr_contact !== undefined ? mfr_contact : (existing?.mfr_contact ?? null),
    notes: notes !== undefined ? notes : (existing?.notes ?? ''),
    single_final: existing?.single_final ?? 0,
    master_final: existing?.master_final ?? 0,
  };

  db.prepare(`
    INSERT INTO amazon_packaging (
      product_id, single_w, single_h, single_d, single_weight_kg,
      master_w, master_h, master_d, units_per_master, master_tare_kg, order_qty,
      single_final, master_final, mfr_name, mfr_address, mfr_contact, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(product_id) DO UPDATE SET
      single_w = excluded.single_w, single_h = excluded.single_h, single_d = excluded.single_d,
      single_weight_kg = excluded.single_weight_kg,
      master_w = excluded.master_w, master_h = excluded.master_h, master_d = excluded.master_d,
      units_per_master = excluded.units_per_master, master_tare_kg = excluded.master_tare_kg,
      order_qty = excluded.order_qty,
      mfr_name = excluded.mfr_name, mfr_address = excluded.mfr_address, mfr_contact = excluded.mfr_contact,
      notes = excluded.notes,
      updated_at = unixepoch()
  `).run(
    id, merged.single_w, merged.single_h, merged.single_d, merged.single_weight_kg,
    merged.master_w, merged.master_h, merged.master_d, merged.units_per_master, merged.master_tare_kg, merged.order_qty,
    merged.single_final, merged.master_final, merged.mfr_name, merged.mfr_address, merged.mfr_contact, merged.notes,
  );
  res.json(loadPackaging(id));
});

router.patch('/products/:id/packaging/final', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) { res.status(404).json({ error: 'product not found' }); return; }
  const body = (req.body ?? {}) as { box?: unknown; final?: unknown };
  if (body.box !== 'single' && body.box !== 'master') { res.status(400).json({ error: 'invalid box' }); return; }
  if (body.final !== 0 && body.final !== 1) { res.status(400).json({ error: 'invalid final' }); return; }
  const col = body.box === 'single' ? 'single_final' : 'master_final';

  const existing = db.prepare(`SELECT product_id FROM amazon_packaging WHERE product_id = ?`).get(id);
  if (!existing) {
    db.prepare(`INSERT INTO amazon_packaging (product_id) VALUES (?)`).run(id);
  }
  db.prepare(`UPDATE amazon_packaging SET ${col} = ?, updated_at = unixepoch() WHERE product_id = ?`).run(body.final, id);
  res.json({ box: body.box, final: body.final });
});

router.put('/products/:id/packaging/checks/:itemId', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  if (!Number.isInteger(id) || !ensureProduct(id) || !Number.isInteger(itemId)) { res.status(404).json({ error: 'not found' }); return; }
  const item = db.prepare(`SELECT id, product_id FROM amazon_packaging_check_items WHERE id = ?`).get(itemId) as { id: number; product_id: number | null } | undefined;
  if (!item || (item.product_id !== null && item.product_id !== id)) { res.status(404).json({ error: 'not found' }); return; }

  const body = (req.body ?? {}) as { status?: unknown };
  const status = body.status;
  if (status === null || status === undefined || status === 'offen' || status === '') {
    db.prepare(`DELETE FROM amazon_packaging_check_status WHERE product_id = ? AND item_id = ?`).run(id, itemId);
    res.json({ item_id: itemId, status: null });
    return;
  }
  if (status !== 'erledigt' && status !== 'nicht_zutreffend') { res.status(400).json({ error: 'invalid status' }); return; }
  db.prepare(`
    INSERT INTO amazon_packaging_check_status (product_id, item_id, status) VALUES (?, ?, ?)
    ON CONFLICT(product_id, item_id) DO UPDATE SET status = excluded.status
  `).run(id, itemId, status);
  res.json({ item_id: itemId, status });
});

router.post('/products/:id/packaging/items', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) { res.status(404).json({ error: 'product not found' }); return; }
  const body = (req.body ?? {}) as {
    box_type?: unknown; category?: unknown; name?: unknown; description?: unknown; requirement?: unknown; severity?: unknown;
  };
  if (body.box_type !== 'single' && body.box_type !== 'master') { res.status(400).json({ error: 'invalid box_type' }); return; }
  if (body.severity !== 'pflicht' && body.severity !== 'empfohlen' && body.severity !== 'optional') { res.status(400).json({ error: 'invalid severity' }); return; }
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, MAX_ITEM_NAME) : '';
  const category = typeof body.category === 'string' ? body.category.trim().slice(0, MAX_ITEM_NAME) : '';
  if (!name || !category) { res.status(400).json({ error: 'name/category required' }); return; }
  const description = typeof body.description === 'string' ? body.description.trim().slice(0, MAX_ITEM_TEXT) : null;
  const requirement = typeof body.requirement === 'string' ? body.requirement.trim().slice(0, MAX_ITEM_TEXT) : null;

  const maxOrder = (db.prepare(
    `SELECT COALESCE(MAX(sort_order),0) AS m FROM amazon_packaging_check_items WHERE product_id = ? AND box_type = ?`,
  ).get(id, body.box_type) as { m: number }).m;

  const r = db.prepare(`
    INSERT INTO amazon_packaging_check_items (product_id, box_type, category, name, description, requirement, severity, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, body.box_type, category, name, description, requirement, body.severity, maxOrder + 1);

  const item = db.prepare(`SELECT * FROM amazon_packaging_check_items WHERE id = ?`).get(r.lastInsertRowid) as CheckItemRow;
  res.status(201).json({ ...item, status: null, is_custom: true });
});

router.delete('/products/:id/packaging/items/:itemId', (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const itemId = Number(req.params.itemId);
  if (!Number.isInteger(id) || !ensureProduct(id) || !Number.isInteger(itemId)) { res.status(404).json({ error: 'not found' }); return; }
  const item = db.prepare(`SELECT product_id FROM amazon_packaging_check_items WHERE id = ?`).get(itemId) as { product_id: number | null } | undefined;
  if (!item) { res.status(404).json({ error: 'not found' }); return; }
  if (item.product_id === null) { res.status(403).json({ error: 'Standard-Punkte können nicht gelöscht werden.' }); return; }
  if (item.product_id !== id) { res.status(404).json({ error: 'not found' }); return; }
  db.transaction(() => {
    db.prepare(`DELETE FROM amazon_packaging_check_status WHERE item_id = ?`).run(itemId);
    db.prepare(`DELETE FROM amazon_packaging_check_items WHERE id = ?`).run(itemId);
  })();
  res.status(204).end();
});

// ── pdf-lib safeText — behält deutsche Umlaute, Rest → '?' (1:1 aus steuer.routes.ts) ──
function safeText(s: string): string {
  return Array.from(s ?? '').map(ch => {
    const c = ch.codePointAt(0) ?? 0;
    if (c >= 32 && c <= 126) return ch;
    if ('äöüÄÖÜß€'.includes(ch)) return ch;
    return '?';
  }).join('');
}
function sanitizeName(s: string): string {
  const cleaned = (s ?? '').replace(/[/\\:*?"<>| -]/g, '_').replace(/\s+/g, ' ').trim();
  return cleaned.length ? cleaned.slice(0, 120) : 'Unbenannt';
}

router.get('/products/:id/packaging/briefing.pdf', async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || !ensureProduct(id)) { res.status(404).json({ error: 'product not found' }); return; }
  const product = db.prepare(`SELECT name FROM amazon_products WHERE id = ?`).get(id) as { name: string };
  const pkg = loadPackaging(id);
  const items = loadItemsWithStatus(id);
  const responsible = getGpsrResponsible();

  const sizeClass = computeSizeClass(pkg.single_w, pkg.single_h, pkg.single_d, pkg.single_weight_kg);
  const masterWeight = (pkg.units_per_master != null && pkg.single_weight_kg != null)
    ? pkg.units_per_master * pkg.single_weight_kg + (pkg.master_tare_kg ?? 0)
    : null;
  const cbmPerBox = (pkg.master_w != null && pkg.master_h != null && pkg.master_d != null)
    ? (pkg.master_w * pkg.master_h * pkg.master_d) / 1_000_000
    : null;

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

  line('Verpackungs-Briefing', { size: 20, bold: true, gapAfter: 2 });
  line(product.name, { size: 13, gapAfter: 10, color: rgb(0.35, 0.35, 0.35) });

  // ── Maße & Größenklasse ──
  line('Maße & Größenklasse', { size: 14, bold: true, gapBefore: 6, gapAfter: 4 });
  line(`Singlebox: ${fmtDe(pkg.single_w)} x ${fmtDe(pkg.single_h)} x ${fmtDe(pkg.single_d)} cm, Einzelgewicht ${fmtDe(pkg.single_weight_kg, 2)} kg`, { size: 11, x: M + 12 });
  line(`Größenklasse: ${sizeClass ?? '— (nicht bestimmbar)'}`, { size: 11, x: M + 12, bold: true });
  line(`Masterbox: ${fmtDe(pkg.master_w)} x ${fmtDe(pkg.master_h)} x ${fmtDe(pkg.master_d)} cm, ${fmtDe(pkg.units_per_master, 0)} Einheiten/Box`, { size: 11, x: M + 12, gapBefore: 4 });
  line(`Masterbox-Gewicht: ${masterWeight != null ? fmtDe(masterWeight, 2) + ' kg' : '—'}  |  CBM/Box: ${cbmPerBox != null ? fmtDe(cbmPerBox, 3) : '—'}`, { size: 11, x: M + 12 });

  // ── GPSR-Angaben ──
  line('GPSR-Angaben', { size: 14, bold: true, gapBefore: 12, gapAfter: 4 });
  line('EU-Verantwortlicher:', { size: 11, x: M + 12, bold: true });
  line(`${responsible.name || '—'}`, { size: 10, x: M + 24 });
  line(`${responsible.address || '—'}`, { size: 10, x: M + 24 });
  line(`${responsible.email || '—'}  ${responsible.phone || ''}`.trim(), { size: 10, x: M + 24 });
  line('Hersteller:', { size: 11, x: M + 12, bold: true, gapBefore: 4 });
  line(`${pkg.mfr_name || '—'}`, { size: 10, x: M + 24 });
  line(`${pkg.mfr_address || '—'}`, { size: 10, x: M + 24 });
  line(`${pkg.mfr_contact || '—'}`, { size: 10, x: M + 24 });

  // ── Checkliste ──
  line('Checkliste', { size: 14, bold: true, gapBefore: 12, gapAfter: 4 });
  for (const boxType of ['single', 'master'] as const) {
    const boxItems = items.filter(i => i.box_type === boxType && i.status !== 'nicht_zutreffend');
    if (boxItems.length === 0) continue;
    line(boxType === 'single' ? 'Singlebox' : 'Masterbox', { size: 12, bold: true, x: M + 6, gapBefore: 6, color: rgb(0.15, 0.15, 0.15) });
    const categories: string[] = [];
    for (const it of boxItems) if (!categories.includes(it.category)) categories.push(it.category);
    for (const cat of categories) {
      line(cat, { size: 11, bold: true, x: M + 14, gapBefore: 3 });
      for (const it of boxItems.filter(i => i.category === cat)) {
        const doneMark = it.status === 'erledigt' ? '✓ erledigt' : 'offen';
        line(`- ${it.name} (Soll: ${it.requirement ?? '—'}) [${doneMark}]`, { size: 9.5, x: M + 26, color: rgb(0.2, 0.2, 0.2) });
      }
    }
  }

  // ── Notizen ──
  if (pkg.notes && pkg.notes.trim()) {
    line('Notizen', { size: 14, bold: true, gapBefore: 12, gapAfter: 4 });
    for (const noteLine of pkg.notes.split('\n')) line(noteLine, { size: 10, x: M + 12 });
  }

  const bytes = await out.save();
  const pdf = Buffer.from(bytes);
  const filename = `Verpackung-Briefing-${sanitizeName(product.name)}.pdf`;
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_').replace(/"/g, '');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.send(pdf);
});

export default router;
