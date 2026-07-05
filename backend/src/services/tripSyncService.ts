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
  reference: string | null;
}

/**
 * Leitet die Referenz fuer den gespiegelten Fahrt-Beleg ab:
 * 1. Manuelle trip.reference hat Vorrang (nach trim).
 * 2. Sonst, falls linked_event_id gesetzt: RE-Nummer der neuesten
 *    nicht-stornierten Rechnung zu diesem Event.
 * 3. Fallback: AN-Nummer des neuesten Angebots zu diesem Event.
 * 4. Sonst null.
 */
function deriveReference(trip: Trip): string | null {
  const manual = trip.reference?.trim();
  if (manual) return manual;

  if (!trip.linked_event_id) return null;

  const invoice = db
    .prepare(
      `SELECT number FROM dj_invoices
       WHERE event_id = ? AND number IS NOT NULL AND is_cancellation = 0
       ORDER BY id DESC LIMIT 1`,
    )
    .get(trip.linked_event_id) as { number: string } | undefined;
  if (invoice?.number) return invoice.number;

  const quote = db
    .prepare(
      `SELECT number FROM dj_quotes
       WHERE event_id = ? AND number IS NOT NULL
       ORDER BY id DESC LIMIT 1`,
    )
    .get(trip.linked_event_id) as { number: string } | undefined;
  return quote?.number ?? null;
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
      `SELECT id, freigegeben_at FROM receipts WHERE source = 'dj_trip_sync' AND linked_trip_id = ?`,
    )
    .get(tripId) as { id: number; freigegeben_at: string | null } | undefined;

  const referenceValue = deriveReference(trip);

  let receiptId: number;
  if (existing) {
    if (existing.freigegeben_at) {
      // GoBD-Guard: Der Mirror-Beleg wurde bereits freigegeben (freigegeben_at
      // gesetzt). Ein UPDATE wuerde den Lock-Trigger
      // trg_receipts_no_update_after_freigabe ausloesen (RAISE ABORT) und da
      // mirrorTripToReceipts in trips.routes NICHT in try/catch liegt, einen
      // unhandled 500 erzeugen. Daher: UPDATE + Area-Link-Rewrite komplett
      // ueberspringen, der freigegebene Beleg bleibt unangetastet.
      console.warn(
        `[tripSyncService] Mirror-Beleg ${existing.id} fuer Trip ${tripId} ist bereits freigegeben (freigegeben_at=${existing.freigegeben_at}) — UPDATE uebersprungen.`,
      );
      return existing.id;
    }

    db.prepare(
      `UPDATE receipts SET
         supplier_name = ?, receipt_date = ?,
         amount_gross_cents = ?, amount_net_cents = ?, vat_amount_cents = 0,
         supplier_invoice_number = ?,
         notes = ?, updated_at = datetime('now')
       WHERE id = ?`,
    ).run(
      supplier,
      trip.expense_date,
      trip.amount_cents,
      trip.amount_cents,
      referenceValue,
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
          linked_trip_id, notes, title, supplier_invoice_number
        ) VALUES (
          'fahrt', 'dj_trip_sync', ?,
          ?,
          ?, ?, 0, 0,
          ?, 'Fahrtkosten', 'zu_pruefen',
          1, 0, 0,
          ?, ?, ?, ?
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
        referenceValue,
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
