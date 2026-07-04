import db from '../db/connection';
import { logAudit } from './audit.service';
import type { Request } from 'express';

/**
 * tripSyncService — spiegelt trips in receipts.
 *
 * Verhalten:
 * - Bei jedem trips INSERT/UPDATE wird mirrorTripToReceipts(tripId) aufgerufen.
 * - Idempotent: existing-Lookup via source='dj_trip_sync' AND linked_trip_id.
 * - Receipt: type='fahrt', vat_rate=0, vat_amount_cents=0, tax_category='Fahrtkosten',
 *   input_tax_deductible=0 (Reisekosten-Pauschale, keine Vorsteuer).
 * - Area-Link: folgt trip.area_slug (Fallback 'dj' bei unbekanntem/leerem Slug).
 */

interface Trip {
  id: number;
  start_location: string | null;
  end_location: string | null;
  distance_km: number;
  purpose: string | null;
  rate_per_km_cents: number;
  amount_cents: number;
  linked_event_id: number | null;
  expense_date: string;
  notes: string | null;
  area_slug: string;
}

/** Loest eine areas.slug auf eine area_id auf; unbekannter/leerer Slug faellt auf 'dj' zurueck. */
function resolveAreaId(slug: string): number | null {
  const bySlug = db
    .prepare(`SELECT id FROM areas WHERE slug = ? LIMIT 1`)
    .get(slug || 'dj') as { id: number } | undefined;
  if (bySlug) return bySlug.id;
  const fallback = db
    .prepare(`SELECT id FROM areas WHERE slug = 'dj' LIMIT 1`)
    .get() as { id: number } | undefined;
  return fallback?.id ?? null;
}

function getFahrtkostenCategoryId(): number | null {
  const r = db
    .prepare(`SELECT id FROM tax_categories WHERE slug = 'fahrtkosten' LIMIT 1`)
    .get() as { id: number } | undefined;
  return r?.id ?? null;
}

/**
 * Spiegelt einen Trip in receipts. Idempotent:
 * - Wenn Mirror existiert (source='dj_trip_sync' AND linked_trip_id=tripId) → UPDATE
 * - Sonst INSERT
 *
 * @returns receiptId des Mirrors oder null wenn trip nicht existiert.
 */
export function mirrorTripToReceipts(
  tripId: number,
  req?: Request,
): number | null {
  const trip = db.prepare(`SELECT * FROM trips WHERE id = ?`).get(tripId) as
    | Trip
    | undefined;
  if (!trip) return null;

  const taxCatId = getFahrtkostenCategoryId();
  const areaId = resolveAreaId(trip.area_slug || 'dj');
  const supplier =
    trip.start_location && trip.end_location
      ? `Fahrt: ${trip.start_location} → ${trip.end_location}`
      : trip.purpose || 'Fahrt';

  const existing = db
    .prepare(
      `SELECT id FROM receipts WHERE source = 'dj_trip_sync' AND linked_trip_id = ?`,
    )
    .get(tripId) as { id: number } | undefined;

  let receiptId: number;
  if (existing) {
    db.prepare(
      `UPDATE receipts SET
         supplier_name = ?, receipt_date = ?,
         amount_gross_cents = ?, amount_net_cents = ?, vat_amount_cents = 0,
         notes = ?, updated_at = datetime('now')
       WHERE id = ?`,
    ).run(
      supplier,
      trip.expense_date,
      trip.amount_cents,
      trip.amount_cents,
      trip.notes,
      existing.id,
    );
    receiptId = existing.id;
  } else {
    const result = db
      .prepare(
        `INSERT INTO receipts (
          type, source, supplier_name,
          receipt_date,
          amount_gross_cents, amount_net_cents, vat_rate, vat_amount_cents,
          tax_category_id, tax_category, status,
          steuerrelevant, input_tax_deductible, reverse_charge,
          linked_trip_id, notes, title
        ) VALUES (
          'fahrt', 'dj_trip_sync', ?,
          ?,
          ?, ?, 0, 0,
          ?, 'Fahrtkosten', 'zu_pruefen',
          1, 0, 0,
          ?, ?, ?
        )`,
      )
      .run(
        supplier,
        trip.expense_date,
        trip.amount_cents,
        trip.amount_cents,
        taxCatId,
        tripId,
        trip.notes,
        `${trip.distance_km} km`,
      );
    receiptId = Number(result.lastInsertRowid);
  }

  if (areaId) {
    // Einzige geaenderte Stelle ggue. der Alt-Version: Bei einem Bereichswechsel
    // (PATCH auf einen anderen area_slug) muss der bisherige Primary-Link entfernt
    // werden, sonst bleibt ein veralteter DJ-Link neben dem neuen Bereich haengen.
    db.prepare(`DELETE FROM receipt_area_links WHERE receipt_id = ?`).run(receiptId);
    db.prepare(
      `INSERT INTO receipt_area_links (receipt_id, area_id, is_primary, share_percent)
       VALUES (?, ?, 1, 100)`,
    ).run(receiptId, areaId);
  }

  if (req) {
    logAudit(req, 'receipt', receiptId, 'mirror_sync', undefined, {
      source: 'dj_trip',
      tripId,
    });
  }

  return receiptId;
}

export const tripSyncService = { mirrorTripToReceipts };
