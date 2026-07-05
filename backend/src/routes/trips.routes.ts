import { Router } from 'express';
import db from '../db/connection';
import { mirrorTripToReceipts } from '../services/tripSyncService';
import { logAudit } from '../services/audit.service';
import { computeMealAllowanceCents } from '../lib/mealAllowance';

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

/** Normalisiert einen area_slug gegen die areas-Tabelle; leer/unbekannt/archiviert → 'dj'. */
function normalizeAreaSlug(raw: unknown): string {
  const slug = typeof raw === 'string' ? raw.trim() : '';
  if (!slug) return 'dj';
  const hit = db
    .prepare(`SELECT 1 FROM areas WHERE slug = ? AND archived = 0 LIMIT 1`)
    .get(slug);
  return hit ? slug : 'dj';
}

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
    area_slug,
    reference,
    departure_time,
    return_time,
  } = req.body as Record<string, unknown>;

  if (!expense_date) {
    res.status(400).json({ error: 'expense_date erforderlich' });
    return;
  }

  const distance = Number(distance_km) || 0;
  const ratePerKm = Number(rate_per_km_cents) || 30;
  // Rundreise (Hin+Rück): distance_km ist einfache Strecke → *2
  const amount = distance * 2 * ratePerKm;
  const areaSlug = normalizeAreaSlug(area_slug);
  const referenceValue =
    typeof reference === 'string' && reference.trim() ? reference.trim() : null;

  const departureTime =
    typeof departure_time === 'string' && departure_time.trim()
      ? departure_time.trim()
      : null;
  const returnTime =
    typeof return_time === 'string' && return_time.trim()
      ? return_time.trim()
      : null;
  const mealCents = computeMealAllowanceCents(departureTime, returnTime);

  const result = db
    .prepare(
      `INSERT INTO trips
         (start_location, end_location, distance_km, purpose,
          rate_per_km_cents, amount_cents, linked_event_id, expense_date, notes, area_slug, reference,
          departure_time, return_time, meal_allowance_cents)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      areaSlug,
      referenceValue,
      departureTime,
      returnTime,
      mealCents,
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
    area_slug,
    reference,
    departure_time,
    return_time,
  } = req.body as Record<string, unknown>;

  const distance = distance_km !== undefined ? Number(distance_km) : null;
  const ratePerKm =
    rate_per_km_cents !== undefined ? Number(rate_per_km_cents) : null;
  const areaSlug = area_slug !== undefined ? normalizeAreaSlug(area_slug) : null;

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
       area_slug = COALESCE(?, area_slug),
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
    areaSlug,
    id,
  );

  // reference wird per direkter Zuweisung gesetzt (kein COALESCE) — so laesst
  // sich eine gesetzte Referenz auch wieder leeren (undefined = unveraendert lassen).
  if (reference !== undefined) {
    const referenceValue = String(reference).trim() || null;
    db.prepare(`UPDATE trips SET reference = ? WHERE id = ?`).run(
      referenceValue,
      id,
    );
  }

  // Recompute amount_cents wenn distance_km oder rate_per_km_cents geändert wurden
  // Rundreise (Hin+Rück): distance_km ist einfache Strecke → *2
  db.prepare(
    `UPDATE trips SET amount_cents = distance_km * 2 * rate_per_km_cents WHERE id = ?`,
  ).run(id);

  // Abwesenheitspauschale: nur bei gesendeten Zeitwerten aktualisieren.
  // Direkte Zuweisung (kein COALESCE) — leerer/nuller Wert loescht die Pauschale
  // (Schalter aus + Speichern). meal_allowance_cents wird serverseitig berechnet.
  if (departure_time !== undefined || return_time !== undefined) {
    const dep =
      typeof departure_time === 'string' && departure_time.trim()
        ? departure_time.trim()
        : null;
    const ret =
      typeof return_time === 'string' && return_time.trim()
        ? return_time.trim()
        : null;
    const mealCents = computeMealAllowanceCents(dep, ret);
    db.prepare(
      `UPDATE trips SET departure_time = ?, return_time = ?, meal_allowance_cents = ? WHERE id = ?`,
    ).run(dep, ret, mealCents, id);
  }

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
