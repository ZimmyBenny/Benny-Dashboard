/**
 * Routes fuer das Belege-Modul.
 *
 * Mounted unter `/api/belege` (siehe app.ts) — `verifyToken` ist davor
 * registriert, alle Endpunkte sind also auth-protected.
 *
 * Sub-Router:
 *  - belege.upload.routes (POST /upload) — Multi-File-Upload + OCR-Pipeline
 *
 * Eigene Endpoints:
 *  - GET  /supplier-suggest     supplier_memory-Lookup fuer UI (auto-Vorschlag)
 *  - GET  /                     Liste mit Filtern (status/type/area/from/to/search)
 *  - GET  /:id                  Detail inkl. files, area_links, ocr_results, audit_log
 *  - PATCH /:id                 Partial-Update (GoBD-Trigger blockt freigegebene)
 *                               + supplier_memory.recordUsage Hook
 *  - POST  /:id/areas           Area-Links setzen (multi-area mit primary)
 *                               + supplier_memory.recordUsage Hook
 *  - POST  /:id/freigeben       GoBD-Lock setzen
 *  - DELETE /:id                Hard-Delete (nur wenn nicht freigegeben)
 *
 * Hinweise:
 *  - Alle WHERE-Bedingungen verwenden Parameter-Placeholder (kein String-Concat) → SQL-Injection-Schutz.
 *  - Die GET-Liste limitiert auf 500 Treffer; UI nutzt Filter zur Eingrenzung.
 *  - PATCH faengt GoBD-Trigger-Errors als 409 ab (Frontend zeigt user-friendly Hinweis).
 */
import { Router, type Request } from 'express';
import db from '../db/connection';
import { receiptService } from '../services/receiptService';
import { supplierMemoryService } from '../services/supplierMemoryService';
import { logAudit } from '../services/audit.service';
import uploadRouter from './belege.upload.routes';
import type { Receipt } from '../types/receipt';
import type { AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// Mount upload sub-router unter /upload
router.use('/', uploadRouter);

/**
 * GET /api/belege/supplier-suggest?supplier=Thomann
 *
 * Liefert den besten supplier_memory-Vorschlag (area_id, tax_category_id) fuer
 * einen Lieferanten. UI (Plan 09) ruft das beim Tippen im Lieferanten-Feld.
 *
 * MUSS vor `/:id` stehen — sonst matched Express `/:id` mit
 * id="supplier-suggest" (NaN → 400).
 *
 * Response:
 *  - 200 + JSON SupplierSuggestion wenn Memory existiert
 *  - 404 + JSON-Stub mit null-Feldern wenn kein Memory
 *  - 400 wenn supplier-Param fehlt
 */
router.get('/supplier-suggest', (req, res) => {
  const supplier = String(req.query.supplier ?? '').trim();
  if (!supplier) {
    res.status(400).json({ error: 'supplier query param required' });
    return;
  }
  const r = supplierMemoryService.suggest(supplier);
  if (!r) {
    res.status(404).json({
      supplier_normalized: null,
      area_id: null,
      tax_category_id: null,
    });
    return;
  }
  res.json(r);
});

/**
 * GET /api/belege?area=DJ&status=offen&type=eingangsrechnung&from=YYYY-MM-DD&to=YYYY-MM-DD&search=...
 *
 * Wenn `area` gesetzt ist, wird ueber receipt_area_links gejoined.
 */
router.get('/', (req, res) => {
  const { area, status, from, to, type, search } = req.query as Record<string, string | undefined>;
  const where: string[] = [];
  const params: unknown[] = [];

  if (status) {
    where.push(`r.status = ?`);
    params.push(status);
  }
  if (type) {
    where.push(`r.type = ?`);
    params.push(type);
  }
  if (from) {
    where.push(`r.receipt_date >= ?`);
    params.push(from);
  }
  if (to) {
    where.push(`r.receipt_date <= ?`);
    params.push(to);
  }
  if (search) {
    where.push(
      `(r.supplier_name LIKE ? OR r.supplier_invoice_number LIKE ? OR r.title LIKE ? OR r.notes LIKE ?)`,
    );
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }

  let sql: string;
  if (area) {
    // Area-Filter: JOIN ueber receipt_area_links + areas
    sql = `
      SELECT DISTINCT r.* FROM receipts r
      INNER JOIN receipt_area_links ral ON ral.receipt_id = r.id
      INNER JOIN areas a ON a.id = ral.area_id
      WHERE a.name = ? ${where.length ? 'AND ' + where.join(' AND ') : ''}
      ORDER BY r.receipt_date DESC, r.id DESC
      LIMIT 500
    `;
    params.unshift(area);
  } else {
    sql = `
      SELECT r.* FROM receipts r
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY r.receipt_date DESC, r.id DESC
      LIMIT 500
    `;
  }
  res.json(db.prepare(sql).all(...params));
});

/**
 * GET /api/belege/:id
 *
 * Liefert den Beleg inkl. files, area_links, ocr_results und Audit-Log (50 Eintraege).
 */
router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'Ungueltige id' });
    return;
  }
  const receipt = db.prepare(`SELECT * FROM receipts WHERE id = ?`).get(id) as Receipt | undefined;
  if (!receipt) {
    res.status(404).end();
    return;
  }
  const files = db.prepare(`SELECT * FROM receipt_files WHERE receipt_id = ?`).all(id);
  const areaLinks = db
    .prepare(
      `
      SELECT ral.*, a.name AS area_name, a.color AS area_color
      FROM receipt_area_links ral
      INNER JOIN areas a ON a.id = ral.area_id
      WHERE ral.receipt_id = ?
    `,
    )
    .all(id);
  const ocr = db
    .prepare(`SELECT * FROM receipt_ocr_results WHERE receipt_id = ? ORDER BY id DESC`)
    .all(id);
  const audit = db
    .prepare(
      `
      SELECT * FROM audit_log
      WHERE entity_type = 'receipt' AND entity_id = ?
      ORDER BY id DESC LIMIT 50
    `,
    )
    .all(id);
  res.json({ ...receipt, files, area_links: areaLinks, ocr_results: ocr, audit_log: audit });
});

/**
 * PATCH /api/belege/:id
 *
 * Partial-Update. GoBD-Trigger blockt finanzrelevante Felder nach Freigabe → 409.
 *
 * supplier_memory-Hook:
 *   Wenn der Beleg nach dem Update einen supplier_name hat, lernt das System
 *   das Tripel (supplier, primaere area, tax_category). Beim naechsten Upload
 *   eines Belegs vom selben Lieferanten kann die UI die Vorschlaege
 *   automatisch vorbelegen.
 *
 *   Die primaere Area wird ueber receipt_area_links.is_primary=1 gelesen
 *   (kann NULL sein → Memory speichert dann area_id=NULL, was Plan-konform ist).
 */
router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'Ungueltige id' });
    return;
  }
  try {
    const updated = receiptService.update(req, id, req.body ?? {});

    // supplier_memory lernt aus dem aktualisierten Tripel
    if (updated.supplier_name) {
      const primaryArea = (db
        .prepare(
          `SELECT area_id FROM receipt_area_links
             WHERE receipt_id = ? AND is_primary = 1
             LIMIT 1`,
        )
        .get(id) as { area_id: number } | undefined)?.area_id ?? null;
      supplierMemoryService.recordUsage(
        updated.supplier_name,
        primaryArea,
        updated.tax_category_id ?? null,
      );
    }

    res.json(updated);
  } catch (err) {
    const msg = (err as Error).message ?? '';
    if (msg.includes('not found')) {
      res.status(404).end();
      return;
    }
    if (msg.includes('GoBD')) {
      res.status(409).json({ error: msg });
      return;
    }
    res.status(500).json({ error: msg });
  }
});

/**
 * POST /api/belege/:id/areas
 *
 * Setzt die Area-Zuordnung eines Belegs neu (multi-area mit primary).
 * Body: { area_ids: number[]; primary_area_id?: number }
 *
 * Atomar via Transaction: DELETE alte Links + INSERT neue Links. Loggt
 * audit-update. Triggert supplier_memory.recordUsage falls Lieferant +
 * primary_area_id gesetzt sind.
 *
 * GoBD: Bei freigegebenen Belegen ist receipt_area_links nicht durch einen
 * DB-Trigger blockiert (nur receipts/receipt_files sind locked) — die
 * fachliche Entscheidung ist: Area-Zuordnung darf nach Freigabe noch
 * korrigiert werden, sie ist kein finanzrelevantes Feld.
 */
router.post('/:id/areas', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'Ungueltige id' });
    return;
  }

  const body = (req.body ?? {}) as {
    area_ids?: unknown;
    primary_area_id?: unknown;
  };
  const areaIds = Array.isArray(body.area_ids)
    ? body.area_ids.map((v) => Number(v)).filter((n) => Number.isFinite(n))
    : null;
  if (!areaIds) {
    res.status(400).json({ error: 'area_ids array required' });
    return;
  }
  const primaryAreaId =
    typeof body.primary_area_id === 'number' && Number.isFinite(body.primary_area_id)
      ? body.primary_area_id
      : null;

  const exists = db.prepare(`SELECT id FROM receipts WHERE id = ?`).get(id) as
    | { id: number }
    | undefined;
  if (!exists) {
    res.status(404).end();
    return;
  }

  try {
    const tx = db.transaction(() => {
      db.prepare(`DELETE FROM receipt_area_links WHERE receipt_id = ?`).run(id);
      const ins = db.prepare(
        `
        INSERT INTO receipt_area_links (receipt_id, area_id, is_primary, share_percent)
        VALUES (?, ?, ?, 100)
      `,
      );
      for (const aid of areaIds) {
        ins.run(id, aid, aid === primaryAreaId ? 1 : 0);
      }
    });
    tx();
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
    return;
  }

  logAudit(req, 'receipt', id, 'update', undefined, {
    area_ids: areaIds,
    primary_area_id: primaryAreaId,
  });

  // supplier_memory-Hook: lerne Lieferant + primaere Area + tax_category
  const r = db
    .prepare(
      `SELECT supplier_name, tax_category_id FROM receipts WHERE id = ?`,
    )
    .get(id) as
    | { supplier_name: string | null; tax_category_id: number | null }
    | undefined;
  if (r?.supplier_name && primaryAreaId !== null) {
    supplierMemoryService.recordUsage(
      r.supplier_name,
      primaryAreaId,
      r.tax_category_id,
    );
  }

  res.status(204).end();
});

/**
 * POST /api/belege/:id/freigeben
 *
 * Setzt GoBD-Lock. Idempotent — schon freigegebene Belege werden unveraendert zurueckgegeben.
 */
router.post('/:id/freigeben', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'Ungueltige id' });
    return;
  }
  const authReq = req as AuthenticatedRequest;
  const actor = authReq.user?.username ?? 'unknown';
  try {
    const r = receiptService.freigeben(req as Request, id, actor);
    res.json(r);
  } catch (err) {
    const msg = (err as Error).message ?? '';
    if (msg.includes('not found')) {
      res.status(404).end();
      return;
    }
    res.status(500).json({ error: msg });
  }
});

/**
 * DELETE /api/belege/:id
 *
 * Hard-Delete. Nicht erlaubt fuer freigegebene Belege → 409
 * (User muss Korrekturbeleg erzeugen).
 */
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'Ungueltige id' });
    return;
  }
  const r = db
    .prepare(`SELECT freigegeben_at FROM receipts WHERE id = ?`)
    .get(id) as { freigegeben_at: string | null } | undefined;
  if (!r) {
    res.status(404).end();
    return;
  }
  if (r.freigegeben_at) {
    res.status(409).json({
      error: 'Freigegebener Beleg darf nicht geloescht werden. Erstelle einen Korrekturbeleg.',
    });
    return;
  }
  logAudit(req, 'receipt', id, 'delete');
  db.prepare(`DELETE FROM receipts WHERE id = ?`).run(id);
  res.status(204).end();
});

export default router;
