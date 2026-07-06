import { Router, type Request, type Response } from 'express';
import db from '../db/connection';

const router = Router();

type AmazonProductStatus = 'interessant' | 'warteliste' | 'aktiv' | 'bestehend' | 'verworfen';

interface Counts {
  interessant: number;
  warteliste: number;
  aktiv: number;
  bestehend: number;
  verworfen: number;
}

interface ActiveProduct {
  id: number;
  name: string;
  has_image: boolean;
  checklist: { done: number; total: number };
  sourcing: { done: number; total: number };
}

// GET /api/amazon/dashboard — rein lesend: Status-Counts + aktive Produkte mit Fortschritt.
// Kein createBackup (siehe CLAUDE.md Datensicherheit — Backup nur vor Bulk-Schreibvorgaengen).
router.get('/dashboard', (_req: Request, res: Response) => {
  // 1. Status-Counts
  const counts: Counts = { interessant: 0, warteliste: 0, aktiv: 0, bestehend: 0, verworfen: 0 };
  const countRows = db
    .prepare(`SELECT status, COUNT(*) AS c FROM amazon_products GROUP BY status`)
    .all() as { status: AmazonProductStatus; c: number }[];
  for (const row of countRows) {
    if (row.status in counts) counts[row.status] = row.c;
  }

  // 2. Aktive Produkte
  const activeRows = db
    .prepare(
      `SELECT id, name, image_path FROM amazon_products
        WHERE status = 'aktiv'
        ORDER BY created_at DESC, id DESC`
    )
    .all() as { id: number; name: string; image_path: string | null }[];

  const checklistStmt = db.prepare(
    `SELECT COUNT(*) AS total, COALESCE(SUM(i.is_done), 0) AS done
       FROM amazon_checklist_product_items i
       JOIN amazon_checklist_product_sections s ON s.id = i.section_id
      WHERE s.product_id = ?`
  );
  const sourcingStmt = db.prepare(
    `SELECT (
        COALESCE(cp_hersteller_gefiltert, 0) +
        COALESCE(cp_anforderungen_kommuniziert, 0) +
        COALESCE(cp_erste_preise_erhalten, 0) +
        COALESCE(cp_usp_geprueft, 0) +
        COALESCE(cp_samples_angefragt, 0) +
        COALESCE(cp_sample_analyse, 0) +
        COALESCE(cp_vergleichstabelle, 0) +
        COALESCE(cp_finale_verhandlung, 0) +
        COALESCE(cp_zahlungsziel, 0)
      ) AS done
      FROM amazon_sourcing WHERE product_id = ?`
  );

  const active: ActiveProduct[] = activeRows.map((p) => {
    const cl = checklistStmt.get(p.id) as { total: number; done: number };
    const srcRow = sourcingStmt.get(p.id) as { done: number } | undefined;
    return {
      id: p.id,
      name: p.name,
      has_image: p.image_path !== null,
      checklist: { done: cl.done, total: cl.total },
      sourcing: { done: srcRow?.done ?? 0, total: 9 },
    };
  });

  res.json({ counts, active });
});

// GET /api/amazon/appointments — rein lesend: naechste Termine aus Amazon-Kalendern
// (calendar_name enthaelt 'amazon', z.B. "Amazon FBA"), aus den bereits gespiegelten
// calendar_events. Loest KEINEN Apple-Sync aus (nur DB-Lesen).
router.get('/appointments', (_req: Request, res: Response) => {
  const nowIso = new Date().toISOString();
  const rows = db
    .prepare(
      `SELECT id, title, start_at, end_at, is_all_day, location, calendar_name
         FROM calendar_events
        WHERE lower(calendar_name) LIKE '%amazon%' AND start_at >= ?
        ORDER BY start_at ASC
        LIMIT 6`
    )
    .all(nowIso);
  res.json(rows);
});

export default router;
