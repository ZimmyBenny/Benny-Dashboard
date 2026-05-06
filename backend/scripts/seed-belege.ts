/**
 * Seed-Skript für Phase 4 — 5 Beispiel-Belege + Kontakte + Event + Trip.
 *
 * Run: cd backend && npx tsx scripts/seed-belege.ts
 *
 * Idempotent: Bestehende Kontakte/Belege/Events/Trips werden nicht doppelt
 * angelegt — Lookups uber unique-Felder (organization_name, supplier_invoice_number,
 * dj_invoice number, trip purpose+expense_date) skippen Duplikate.
 *
 * WICHTIG: createBackup laeuft VOR allen Inserts, damit fehlerhafte Seeds
 * keine bestehenden Daten beschaedigen.
 *
 * Plan-Abweichungen:
 *  - contacts-Spalten: contact_kind / organization_name / first_name / last_name
 *    (NICHT display_name + company + kind wie das Plan-Snippet annahm — Migration 015
 *    nutzt CHECK contact_kind IN ('person','organization'); display_name + company
 *    + kind existieren nicht). Pattern uebernommen aus Plan 04-06.
 *  - dj_events erfordert event_type (CHECK 'hochzeit'|'firmen_event'|...) und
 *    event_date (NOT NULL); title ist optional.
 */
import 'dotenv/config';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import db from '../src/db/connection';
import { createBackup } from '../src/db/backup';
import { mirrorInvoiceToReceipts } from '../src/services/djSyncService';
import { mirrorTripToReceipts } from '../src/services/tripSyncService';

interface ContactExtra {
  first_name?: string;
  last_name?: string;
  area?: string;
}

/**
 * Findet einen bestehenden Kontakt anhand des organization_name (fuer Firmen)
 * oder first_name+last_name (fuer Personen). Liefert id oder null.
 */
function findContact(
  kind: 'organization' | 'person',
  name: string,
  extra: ContactExtra,
): number | null {
  if (kind === 'organization') {
    const r = db
      .prepare(`SELECT id FROM contacts WHERE organization_name = ? LIMIT 1`)
      .get(name) as { id: number } | undefined;
    return r?.id ?? null;
  }
  // person: matche first+last
  const r = db
    .prepare(
      `SELECT id FROM contacts
       WHERE contact_kind = 'person'
         AND first_name = ?
         AND last_name = ?
       LIMIT 1`,
    )
    .get(extra.first_name ?? '', extra.last_name ?? '') as
    | { id: number }
    | undefined;
  return r?.id ?? null;
}

/**
 * Inserted einen Kontakt oder gibt die bestehende ID zurueck.
 *
 * Spalten gemaess Migration 015_contacts.sql:
 *  - contact_kind (CHECK 'person'|'organization')
 *  - organization_name (fuer Firmen)
 *  - first_name + last_name (fuer Personen)
 *  - area (TEXT, default 'Sonstiges')
 *  - type (TEXT, default 'Sonstiges')
 */
function getOrInsertContact(
  kind: 'organization' | 'person',
  name: string,
  extra: ContactExtra = {},
): number {
  const existing = findContact(kind, name, extra);
  if (existing) return existing;

  const r = db
    .prepare(
      `INSERT INTO contacts (contact_kind, type, area, organization_name, first_name, last_name)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      kind,
      'Sonstiges',
      extra.area ?? 'Sonstiges',
      kind === 'organization' ? name : null,
      extra.first_name ?? null,
      extra.last_name ?? null,
    );
  return Number(r.lastInsertRowid);
}

function getAreaIdBySlug(slug: string): number {
  const r = db.prepare(`SELECT id FROM areas WHERE slug = ?`).get(slug) as
    | { id: number }
    | undefined;
  if (!r) {
    throw new Error(
      `Area '${slug}' not found — Migration 040_belege.sql nicht angewandt?`,
    );
  }
  return r.id;
}

function getTaxCatIdBySlug(slug: string): number {
  const r = db
    .prepare(`SELECT id FROM tax_categories WHERE slug = ?`)
    .get(slug) as { id: number } | undefined;
  if (!r) {
    throw new Error(`Tax-Category '${slug}' not found`);
  }
  return r.id;
}

function linkArea(receiptId: number, areaId: number): void {
  db.prepare(
    `INSERT OR IGNORE INTO receipt_area_links (receipt_id, area_id, is_primary, share_percent)
     VALUES (?, ?, 1, 100)`,
  ).run(receiptId, areaId);
}

/**
 * Sucht einen Receipt mit gegebener supplier_invoice_number — Idempotenz-Anker
 * fuer Re-Runs des Seeds (5 Belege haben jeweils eine eindeutige Rechnungsnummer).
 */
function receiptExists(invoiceNumber: string): number | null {
  const r = db
    .prepare(
      `SELECT id FROM receipts WHERE supplier_invoice_number = ? LIMIT 1`,
    )
    .get(invoiceNumber) as { id: number } | undefined;
  return r?.id ?? null;
}

function djInvoiceExists(number: string): number | null {
  const r = db
    .prepare(`SELECT id FROM dj_invoices WHERE number = ? LIMIT 1`)
    .get(number) as { id: number } | undefined;
  return r?.id ?? null;
}

function tripExists(purpose: string, expenseDate: string): number | null {
  const r = db
    .prepare(
      `SELECT id FROM trips WHERE purpose = ? AND expense_date = ? LIMIT 1`,
    )
    .get(purpose, expenseDate) as { id: number } | undefined;
  return r?.id ?? null;
}

function djEventExists(
  customerId: number,
  eventDate: string,
  eventType: string,
): number | null {
  const r = db
    .prepare(
      `SELECT id FROM dj_events
       WHERE customer_id = ? AND event_date = ? AND event_type = ?
       LIMIT 1`,
    )
    .get(customerId, eventDate, eventType) as { id: number } | undefined;
  return r?.id ?? null;
}

function main(): void {
  console.log('=== Phase 4 Seed: Belege ===');

  const backup = createBackup('phase-04-plan-12-seed');
  console.log(`Backup created: ${backup}`);

  const tx = db.transaction(() => {
    // ========================================================================
    // 1) Kontakte
    // ========================================================================
    const alibaba = getOrInsertContact('organization', 'Alibaba Supplier', {
      area: 'Amazon FBA',
    });
    const thomann = getOrInsertContact('organization', 'Thomann GmbH', {
      area: 'DJ',
    });
    const eon = getOrInsertContact(
      'organization',
      'E.ON Energie Deutschland GmbH',
      { area: 'Privat' },
    );
    const google = getOrInsertContact(
      'organization',
      'Google Ireland Limited',
      { area: 'Amazon FBA' },
    );
    const mueller = getOrInsertContact('person', 'Müller', {
      first_name: 'Hans',
      last_name: 'Müller',
      area: 'DJ',
    });

    const areaAmazon = getAreaIdBySlug('amazon-fba');
    const areaDj = getAreaIdBySlug('dj');
    const areaPrivat = getAreaIdBySlug('privat');

    const catWaren = getTaxCatIdBySlug('wareneinkauf');
    const catSoftware = getTaxCatIdBySlug('software-tools');
    const catStrom = getTaxCatIdBySlug('strom-energie');
    const catEust = getTaxCatIdBySlug('eust-zoll');

    // ========================================================================
    // 2) Beleg 1 — Alibaba (USD 238, EUSt, status zu_pruefen)
    // ========================================================================
    if (!receiptExists('ALIB-2026-001')) {
      const r1 = db
        .prepare(
          `INSERT INTO receipts (
            type, source, supplier_name, supplier_contact_id, supplier_invoice_number,
            receipt_date, due_date, currency, exchange_rate,
            amount_gross_cents, amount_net_cents, vat_rate, vat_amount_cents, amount_gross_eur_cents,
            tax_category_id, tax_category, status,
            steuerrelevant, input_tax_deductible, reverse_charge, import_eust,
            title, notes
          ) VALUES (
            'eingangsrechnung','manual_upload', 'Alibaba Supplier', ?, 'ALIB-2026-001',
            '2026-04-15', '2026-05-15', 'USD', 0.92,
            23800, 23800, 0, 0, 21896,
            ?, 'EUSt/Zoll', 'zu_pruefen',
            1, 1, 0, 1,
            'Alibaba Wareneinkauf Bettschutzgitter', 'Aus China — EUSt zieht als Vorsteuer'
          )`,
        )
        .run(alibaba, catEust);
      linkArea(Number(r1.lastInsertRowid), areaAmazon);
      console.log(`  [1] Alibaba (Eingang USD) -> receipt id=${r1.lastInsertRowid}`);
    } else {
      console.log('  [1] Alibaba — bereits vorhanden, skip');
    }

    // ========================================================================
    // 3) Beleg 2 — Thomann (DJ, 499 EUR, bezahlt, USt 19%)
    // ========================================================================
    if (!receiptExists('TH-260415-001')) {
      const r2 = db
        .prepare(
          `INSERT INTO receipts (
            type, source, supplier_name, supplier_contact_id, supplier_invoice_number,
            receipt_date, due_date, payment_date, currency,
            amount_gross_cents, amount_net_cents, vat_rate, vat_amount_cents,
            tax_category_id, tax_category, status,
            steuerrelevant, input_tax_deductible, reverse_charge,
            payment_method, paid_amount_cents,
            title, notes
          ) VALUES (
            'eingangsrechnung','manual_upload', 'Thomann GmbH', ?, 'TH-260415-001',
            '2026-04-15', '2026-04-30', '2026-04-25', 'EUR',
            49900, 41933, 19, 7967,
            ?, 'Wareneinkauf', 'bezahlt',
            1, 1, 0,
            'ueberweisung', 49900,
            'Pioneer DJ-Mixer', NULL
          )`,
        )
        .run(thomann, catWaren);
      linkArea(Number(r2.lastInsertRowid), areaDj);
      console.log(`  [2] Thomann (Eingang EUR bezahlt) -> receipt id=${r2.lastInsertRowid}`);
    } else {
      console.log('  [2] Thomann — bereits vorhanden, skip');
    }

    // ========================================================================
    // 4) Beleg 3 — E.ON (Strom, Privat 70%, 119 EUR, offen)
    // ========================================================================
    if (!receiptExists('EON-2026-Q1')) {
      const r3 = db
        .prepare(
          `INSERT INTO receipts (
            type, source, supplier_name, supplier_contact_id, supplier_invoice_number,
            receipt_date, due_date, currency,
            amount_gross_cents, amount_net_cents, vat_rate, vat_amount_cents,
            tax_category_id, tax_category, status,
            steuerrelevant, input_tax_deductible, reverse_charge,
            private_share_percent,
            title, notes
          ) VALUES (
            'eingangsrechnung','manual_upload', 'E.ON Energie Deutschland GmbH', ?, 'EON-2026-Q1',
            '2026-04-01', '2026-04-30', 'EUR',
            11900, 10000, 19, 1900,
            ?, 'Strom/Energie', 'offen',
            1, 1, 0,
            70,
            'Stromabschlag Q1 2026', 'Heimbüro 30% absetzbar'
          )`,
        )
        .run(eon, catStrom);
      linkArea(Number(r3.lastInsertRowid), areaPrivat);
      console.log(`  [3] E.ON (Eingang Privat 70%) -> receipt id=${r3.lastInsertRowid}`);
    } else {
      console.log('  [3] E.ON — bereits vorhanden, skip');
    }

    // ========================================================================
    // 5) Beleg 4 — Google Ireland (Reverse Charge §13b, 24,99 EUR, bezahlt)
    // ========================================================================
    if (!receiptExists('GIRE-2026-04-01')) {
      const r4 = db
        .prepare(
          `INSERT INTO receipts (
            type, source, supplier_name, supplier_contact_id, supplier_invoice_number,
            receipt_date, due_date, payment_date, currency,
            amount_gross_cents, amount_net_cents, vat_rate, vat_amount_cents,
            tax_category_id, tax_category, status,
            steuerrelevant, input_tax_deductible, reverse_charge,
            payment_method, paid_amount_cents,
            title, notes
          ) VALUES (
            'eingangsrechnung','manual_upload', 'Google Ireland Limited', ?, 'GIRE-2026-04-01',
            '2026-04-01', '2026-04-15', '2026-04-10', 'EUR',
            2499, 2499, 0, 475,
            ?, 'Software/Tools', 'bezahlt',
            1, 1, 1,
            'lastschrift', 2499,
            'Google Workspace Business', '§13b Reverse Charge — als Empfaenger USt-Schuld + Vorsteuer'
          )`,
        )
        .run(google, catSoftware);
      linkArea(Number(r4.lastInsertRowid), areaAmazon);
      console.log(`  [4] Google Ireland (Reverse Charge) -> receipt id=${r4.lastInsertRowid}`);
    } else {
      console.log('  [4] Google Ireland — bereits vorhanden, skip');
    }

    // ========================================================================
    // 6) Beleg 5 — Hochzeit Mueller (DJ-Invoice + Mirror)
    //    a) dj_event anlegen
    //    b) dj_invoice anlegen + finalisieren
    //    c) mirrorInvoiceToReceipts spiegelt in receipts
    // ========================================================================
    let eventId = djEventExists(mueller, '2026-06-15', 'hochzeit');
    if (!eventId) {
      const eventRes = db
        .prepare(
          `INSERT INTO dj_events (customer_id, event_date, event_type, status, title)
           VALUES (?, '2026-06-15', 'hochzeit', 'bestaetigt', 'Hochzeit Familie Müller')`,
        )
        .run(mueller);
      eventId = Number(eventRes.lastInsertRowid);
      console.log(`  [5a] DJ-Event Hochzeit Müller -> id=${eventId}`);
    } else {
      console.log('  [5a] DJ-Event Hochzeit Müller — bereits vorhanden, skip');
    }

    let invId = djInvoiceExists('RE-2026-0042');
    if (!invId) {
      const invRes = db
        .prepare(
          `INSERT INTO dj_invoices (
            customer_id, event_id, number, status, invoice_date, due_date,
            subtotal_net, tax_total, total_gross, finalized_at
          ) VALUES (?, ?, 'RE-2026-0042', 'offen', '2026-05-15', '2026-06-30',
            1008.40, 191.60, 1200.00, '2026-05-15 12:00:00')`,
        )
        .run(mueller, eventId);
      invId = Number(invRes.lastInsertRowid);
      console.log(`  [5b] DJ-Invoice RE-2026-0042 -> id=${invId}`);
    } else {
      console.log('  [5b] DJ-Invoice RE-2026-0042 — bereits vorhanden, skip');
    }

    // Mirror in receipts via Service (idempotent)
    const mirroredId = mirrorInvoiceToReceipts(invId);
    console.log(`  [5c] Mirror Hochzeit Müller -> receipt id=${mirroredId}`);

    // ========================================================================
    // 7) Trip — Fahrt zur Hochzeit Müller, 87 km
    // ========================================================================
    let tripId = tripExists('Fahrt zur Hochzeit Müller', '2026-06-15');
    if (!tripId) {
      const tripRes = db
        .prepare(
          `INSERT INTO trips (
            start_location, end_location, distance_km, rate_per_km_cents, amount_cents,
            purpose, linked_event_id, expense_date, notes
          ) VALUES (
            'Heimat', 'Hochzeitslocation Müller', 87, 30, 2610,
            'Fahrt zur Hochzeit Müller', ?, '2026-06-15',
            'Hin- und Rückfahrt zusammen 87 km'
          )`,
        )
        .run(eventId);
      tripId = Number(tripRes.lastInsertRowid);
      console.log(`  [6] Trip Hochzeit Müller -> id=${tripId}`);
    } else {
      console.log('  [6] Trip Hochzeit Müller — bereits vorhanden, skip');
    }
    const tripMirroredId = mirrorTripToReceipts(tripId);
    console.log(`  [6b] Mirror Trip -> receipt id=${tripMirroredId}`);
  });

  tx();

  // ==========================================================================
  // Sanity-Check: Wie viele Belege sind jetzt da?
  // ==========================================================================
  const allCount = db
    .prepare(
      `SELECT COUNT(*) as c FROM receipts WHERE source IN ('manual_upload','dj_invoice_sync','dj_trip_sync')`,
    )
    .get() as { c: number };
  console.log(`\nTotal receipts (manual + dj sync + trip sync): ${allCount.c}`);

  const seedCount = db
    .prepare(
      `SELECT COUNT(*) as c FROM receipts
       WHERE supplier_name LIKE '%Alibaba%'
          OR supplier_name LIKE '%Thomann%'
          OR supplier_name LIKE '%E.ON%'
          OR supplier_name LIKE '%Google%'
          OR supplier_name LIKE '%Müller%'
          OR supplier_name LIKE '%Mueller%'
          OR supplier_name LIKE '%Fahrt%'`,
    )
    .get() as { c: number };
  console.log(`Seeded receipts (Alibaba/Thomann/E.ON/Google/Müller/Fahrt): ${seedCount.c}`);

  const byArea = db
    .prepare(
      `SELECT a.name, COUNT(*) as c FROM receipt_area_links ral
       INNER JOIN areas a ON a.id = ral.area_id
       GROUP BY a.name
       ORDER BY a.name`,
    )
    .all() as Array<{ name: string; c: number }>;
  console.log('By area:', byArea);

  console.log('\n=== Seed complete ===');
}

main();
