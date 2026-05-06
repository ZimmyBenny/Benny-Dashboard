import { Router } from 'express';
import db from '../db/connection';
import { mirrorTripToReceipts } from '../services/tripSyncService';
import { logAudit } from '../services/audit.service';

/**
 * CRUD-Endpoint fuer trips (Fahrten).
 *
 * Pattern:
 * - GET / und GET /:id liefern trip-Rows.
 * - POST/PATCH triggern automatisch mirrorTripToReceipts → receipts werden mit-aktualisiert.
 * - DELETE entfernt nur die Trip-Row; verknuepfte Receipts bleiben (GoBD —
 *   Belege duerfen nicht durch DELETE eines Source-Eintrags verschwinden).
 *
 * Mounten unter /api/trips hinter verifyToken (siehe app.ts).
 */
const router = Router();

router.get('/', (_req, res) => {
  res.json(
    db.prepare(`SELECT * FROM trips ORDER BY expense_date DESC, id DESC`).all(),
  );
});

router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: 'Ungültige ID' });
    return;
  }
  const r = db.prepare(`SELECT * FROM trips WHERE id = ?`).get(id);
  if (!r) {
    res.status(404).json({ error: 'Fahrt nicht gefunden' });
    return;
  }
  res.json(r);
});

router.post('/', (req, res) => {
  const {
    start_location,
    end_location,
    distance_km,
    purpose,
    rate_per_km_cents,
    linked_event_id,
    expense_date,
    notes,
  } = req.body as Record<string, unknown>;

  if (!expense_date) {
    res.status(400).json({ error: 'expense_date erforderlich' });
    return;
  }

  const distance = Number(distance_km) || 0;
  const ratePerKm = Number(rate_per_km_cents) || 30;
  const amount = distance * ratePerKm;

  const result = db
    .prepare(
      `INSERT INTO trips
         (start_location, end_location, distance_km, purpose,
          rate_per_km_cents, amount_cents, linked_event_id, expense_date, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      start_location ?? null,
      end_location ?? null,
      distance,
      purpose ?? null,
      ratePerKm,
      amount,
      linked_event_id ?? null,
      expense_date,
      notes ?? null,
    );
  const id = Number(result.lastInsertRowid);

  logAudit(req, 'trip', id, 'create', undefined, req.body);
  mirrorTripToReceipts(id, req);

  res
    .status(201)
    .json(db.prepare(`SELECT * FROM trips WHERE id = ?`).get(id));
});

router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: 'Ungültige ID' });
    return;
  }
  const existing = db
    .prepare(`SELECT * FROM trips WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  if (!existing) {
    res.status(404).json({ error: 'Fahrt nicht gefunden' });
    return;
  }

  const {
    start_location,
    end_location,
    distance_km,
    purpose,
    rate_per_km_cents,
    linked_event_id,
    expense_date,
    notes,
  } = req.body as Record<string, unknown>;

  const distance = distance_km !== undefined ? Number(distance_km) : null;
  const ratePerKm =
    rate_per_km_cents !== undefined ? Number(rate_per_km_cents) : null;

  db.prepare(
    `UPDATE trips SET
       start_location = COALESCE(?, start_location),
       end_location = COALESCE(?, end_location),
       distance_km = COALESCE(?, distance_km),
       purpose = COALESCE(?, purpose),
       rate_per_km_cents = COALESCE(?, rate_per_km_cents),
       linked_event_id = COALESCE(?, linked_event_id),
       expense_date = COALESCE(?, expense_date),
       notes = COALESCE(?, notes),
       updated_at = datetime('now')
     WHERE id = ?`,
  ).run(
    start_location ?? null,
    end_location ?? null,
    distance,
    purpose ?? null,
    ratePerKm,
    linked_event_id ?? null,
    expense_date ?? null,
    notes ?? null,
    id,
  );

  // Recompute amount_cents wenn distance_km oder rate_per_km_cents geändert wurden
  db.prepare(
    `UPDATE trips SET amount_cents = distance_km * rate_per_km_cents WHERE id = ?`,
  ).run(id);

  logAudit(req, 'trip', id, 'update', existing, req.body);
  mirrorTripToReceipts(id, req);

  res.json(db.prepare(`SELECT * FROM trips WHERE id = ?`).get(id));
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: 'Ungültige ID' });
    return;
  }
  // Receipts mit linked_trip_id bleiben (GoBD); Trip-Row wird entfernt.
  // Der FK linked_trip_id ist ON DELETE SET NULL — receipts bleiben erhalten,
  // verlieren nur die Verknuepfung zur urspruenglichen Trip-Row.
  logAudit(req, 'trip', id, 'delete');
  db.prepare(`DELETE FROM trips WHERE id = ?`).run(id);
  res.status(204).end();
});

export default router;
