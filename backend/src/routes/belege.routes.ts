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
import fs from 'fs';
import path from 'path';
import db from '../db/connection';
import { receiptService } from '../services/receiptService';
import { supplierMemoryService } from '../services/supplierMemoryService';
import { taskAutomationService } from '../services/taskAutomationService';
import { aggregateForUstva, type UstvaPeriod } from '../services/taxCalcService';
import { logAudit } from '../services/audit.service';
import { createBackup } from '../db/backup';
import * as belegeMirror from '../lib/belegeMirror';
import { eurFromCents, hoursDecimal, plainDecimal, buildCsv } from '../lib/csvExport';
import uploadRouter from './belege.upload.routes';
import type { Receipt } from '../types/receipt';
import type { AuthenticatedRequest } from '../middleware/auth';

const router = Router();

// Volle deutsche Monatsnamen mit echten Umlauten (Memory-Regel feedback_umlauts) —
// Index 0 = Januar, passt direkt zu bucketIdx bei period === 'monat' (month - 1).
const MONAT_NAMEN_LANG = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];

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
 * POST /api/belege/run-task-automation
 *
 * Manueller Trigger fuer den Task-Automation-Sweep. Erstellt Tasks fuer
 * offene Belege, deren Faelligkeit innerhalb des Lead-Days-Fensters liegt
 * (siehe app_settings.payment_task_lead_days, Default 3).
 *
 * Wird auch beim Server-Start automatisch aufgerufen (server.ts).
 *
 * MUSS vor `/:id` stehen — sonst matched Express `/:id` mit
 * id="run-task-automation" (NaN → 400).
 *
 * Response: { scanned, tasksCreated, createdReceiptIds }
 */
router.post('/run-task-automation', (_req, res) => {
  const result = taskAutomationService.checkOpenPayments();
  res.json(result);
});

/**
 * GET /api/belege/areas
 *
 * Liefert alle nicht-archivierten Areas (Bereiche) sortiert nach sort_order/Name.
 * Wird von der Belege-Upload-UI (Plan 04-09) genutzt, um den Bereichs-Picker
 * zu fuellen. Eine vollwertige CRUD-API fuer Areas kommt in Plan 04-10
 * (Settings) — hier nur Read-Only.
 *
 * MUSS vor `/:id` stehen — sonst matched Express `/:id` mit id="areas".
 */
router.get('/areas', (_req, res) => {
  res.json(
    db
      .prepare(
        `SELECT * FROM areas WHERE archived = 0 ORDER BY sort_order, name`,
      )
      .all(),
  );
});

/**
 * GET /api/belege/tax-categories
 *
 * Liefert alle nicht-archivierten Steuer-Kategorien sortiert nach
 * sort_order/Name. Wird von der Belege-Upload-UI (Plan 04-09) als Picker-
 * Quelle genutzt. CRUD kommt in Plan 04-10 (Settings).
 *
 * MUSS vor `/:id` stehen — sonst matched Express `/:id` mit id="tax-categories".
 */
router.get('/tax-categories', (_req, res) => {
  res.json(
    db
      .prepare(
        `SELECT * FROM tax_categories WHERE archived = 0 ORDER BY sort_order, name`,
      )
      .all(),
  );
});

/**
 * GET /api/belege/ustva?year=2026
 *
 * Liefert UStVA-Buckets fuer das angegebene Jahr. Layout abhaengig vom Setting
 * `app_settings.ustva_zeitraum`:
 *  - 'keine'   → leeres Buckets-Array (UI rendert Hinweis)
 *  - 'jahr'    → 1 Bucket (Jahres-Aggregation)
 *  - 'quartal' → 4 Buckets (Q1-Q4)
 *  - 'monat'   → 12 Buckets (Jan-Dez)
 *
 * Aggregations-Service: taxCalcService.aggregateForUstva (Plan 04-02).
 *
 * MUSS vor `/:id` stehen — sonst matched Express `/:id` mit id="ustva" (NaN → 400).
 */
router.get('/ustva', (req, res) => {
  const yearRaw = req.query.year ?? new Date().getFullYear();
  const year = parseInt(String(yearRaw), 10);
  if (!Number.isFinite(year)) {
    res.status(400).json({ error: 'year query param required' });
    return;
  }
  const periodSetting =
    (db
      .prepare(`SELECT value FROM app_settings WHERE key = 'ustva_zeitraum'`)
      .get() as { value: string } | undefined)?.value || 'keine';

  if (periodSetting === 'keine') {
    res.json({ year, period: 'keine', buckets: [] });
    return;
  }
  const period = periodSetting as UstvaPeriod;
  const buckets = aggregateForUstva(year, period);
  res.json({ year, period, buckets });
});

/**
 * GET /api/belege/ustva-drill?year=2026&period_index=2
 *
 * Drilldown-Liste fuer einen UStVA-Bucket. Liefert die zugrunde liegenden
 * Receipts (steuerrelevant=1, status='bezahlt'/'teilbezahlt', payment_date im Bucket-Zeitraum).
 *
 * `period_index`:
 *  - bei period='jahr' → ignoriert (alle 12 Monate)
 *  - bei period='quartal' → 1..4
 *  - bei period='monat'   → 1..12
 *
 * MUSS vor `/:id` stehen.
 */
router.get('/ustva-drill', (req, res) => {
  const yearRaw = req.query.year ?? new Date().getFullYear();
  const year = parseInt(String(yearRaw), 10);
  if (!Number.isFinite(year)) {
    res.status(400).json({ error: 'year query param required' });
    return;
  }
  const periodSetting =
    (db
      .prepare(`SELECT value FROM app_settings WHERE key = 'ustva_zeitraum'`)
      .get() as { value: string } | undefined)?.value || 'jahr';
  const idx = parseInt(String(req.query.period_index ?? 0), 10);

  let months: string[];
  if (periodSetting === 'jahr') {
    months = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
  } else if (periodSetting === 'quartal') {
    if (!Number.isFinite(idx) || idx < 1 || idx > 4) {
      res.status(400).json({ error: 'period_index must be 1..4 for quartal' });
      return;
    }
    months = [(idx - 1) * 3 + 1, (idx - 1) * 3 + 2, (idx - 1) * 3 + 3].map((m) =>
      String(m).padStart(2, '0'),
    );
  } else {
    // monat
    if (!Number.isFinite(idx) || idx < 1 || idx > 12) {
      res.status(400).json({ error: 'period_index must be 1..12 for monat' });
      return;
    }
    months = [String(idx).padStart(2, '0')];
  }

  const placeholders = months.map(() => '?').join(',');
  const rows = db
    .prepare(
      `
      SELECT * FROM receipts
      WHERE steuerrelevant = 1
        AND status IN ('bezahlt','teilbezahlt')
        AND payment_date IS NOT NULL
        AND strftime('%Y', payment_date) = ?
        AND strftime('%m', payment_date) IN (${placeholders})
      ORDER BY payment_date DESC, id DESC
    `,
    )
    .all(String(year), ...months);
  res.json(rows);
});

/**
 * GET /api/belege/export-csv?year=2026&area=DJ&tax_category_id=3
 *
 * CSV-Export der Belege mit optionalen Filtern (Jahr, Bereich, Kategorie) im
 * deutschen Euro-Format (Semikolon-getrennt, Komma-Dezimal, UTF-8 mit BOM,
 * echte Umlaute). Enthaelt ALLE Beleg-Typen (inkl. fahrt/quittung/spesen/
 * sonstiges) mit lesbarem Typ-Label — der Nutzer filtert selbst ueber
 * Bereich/Kategorie. Spalten identisch zum Steuerberater-`belege`-Export.
 * Antwort:
 *  - Content-Type: text/csv; charset=utf-8
 *  - Content-Disposition: attachment; filename="belege-<year>.csv"
 *  - BOM (﻿) als erstes Byte → Excel erkennt UTF-8 korrekt
 *
 * SQL-Injection-Schutz: Alle WHERE-Werte gehen ueber Placeholder; year wird per
 * strftime verglichen (kein String-Concat). Reine Lese-Operation → KEIN Backup.
 *
 * MUSS vor `/:id` stehen — sonst matched `/:id` mit id="export-csv".
 */
router.get('/export-csv', (req, res) => {
  const { year, area, tax_category_id } = req.query as Record<string, string | undefined>;
  const where: string[] = [];
  const params: unknown[] = [];
  if (year) {
    where.push(`strftime('%Y', r.receipt_date) = ?`);
    params.push(String(year));
  }
  if (tax_category_id) {
    const tcId = parseInt(tax_category_id, 10);
    if (Number.isFinite(tcId)) {
      where.push(`r.tax_category_id = ?`);
      params.push(tcId);
    }
  }

  // Gezieltes SELECT (keine *_cents/id-Rohspalten) + inline PRIMARY-AREA-Subquery
  // — identisch zum Steuerberater-`belege`-Zweig, aber OHNE `type IN (...)` (alle Typen).
  const selectFields = `
    r.receipt_date, r.type, r.supplier_name,
    COALESCE(r.receipt_number, r.supplier_invoice_number) AS beleg_nr,
    r.amount_net_cents, r.vat_amount_cents, r.amount_gross_cents, r.vat_rate, r.status,
    (SELECT a2.name FROM receipt_area_links ral2
       JOIN areas a2 ON a2.id = ral2.area_id
       WHERE ral2.receipt_id = r.id
       ORDER BY ral2.is_primary DESC, a2.name ASC LIMIT 1) AS primary_area
  `;

  let sql: string;
  if (area) {
    sql = `
      SELECT DISTINCT ${selectFields} FROM receipts r
      INNER JOIN receipt_area_links ral ON ral.receipt_id = r.id
      INNER JOIN areas a ON a.id = ral.area_id
      WHERE a.name = ? ${where.length ? 'AND ' + where.join(' AND ') : ''}
      ORDER BY r.receipt_date, r.id
    `;
    params.unshift(area);
  } else {
    sql = `
      SELECT ${selectFields} FROM receipts r
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY r.receipt_date, r.id
    `;
  }
  const rows = db.prepare(sql).all(...params) as Array<{
    receipt_date: string;
    type: string;
    supplier_name: string | null;
    beleg_nr: string | null;
    amount_net_cents: number | null;
    vat_amount_cents: number | null;
    amount_gross_cents: number | null;
    vat_rate: number | null;
    status: string | null;
    primary_area: string | null;
  }>;

  // Deutsches Typ-Label (echte Umlaute) — alle 7 Enum-Werte, Fallback = Rohwert.
  const typLabel = (t: string): string =>
    t === 'ausgangsrechnung'
      ? 'Ausgangsrechnung'
      : t === 'eingangsrechnung'
      ? 'Eingangsrechnung'
      : t === 'fahrt'
      ? 'Fahrt'
      : t === 'beleg'
      ? 'Beleg'
      : t === 'quittung'
      ? 'Quittung'
      : t === 'spesen'
      ? 'Spesen'
      : t === 'sonstiges'
      ? 'Sonstiges'
      : t;

  const headers = [
    'Datum',
    'Typ',
    'Lieferant/Kunde',
    'Beleg-/Rechnungsnr',
    'Netto (EUR)',
    'USt (EUR)',
    'Brutto (EUR)',
    'Steuersatz (%)',
    'Bereich',
    'Status',
  ];
  const csvRows = rows.map((r) => [
    r.receipt_date,
    typLabel(r.type),
    r.supplier_name ?? '',
    r.beleg_nr ?? '',
    eurFromCents(r.amount_net_cents),
    eurFromCents(r.vat_amount_cents),
    eurFromCents(r.amount_gross_cents),
    String(r.vat_rate ?? 0),
    r.primary_area ?? '',
    r.status ?? '',
  ]);

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="belege-${year || 'all'}.csv"`,
  );
  res.send(buildCsv(headers, csvRows)); // buildCsv stellt das BOM voran
});

/**
 * GET /api/belege/export/:type.csv?year=2026
 *
 * Steuerberater-freundliche CSV-Exporte im deutschen Format (Semikolon-getrennt,
 * Komma-Dezimal, UTF-8 mit BOM, echte Umlaute). Reine Lese-Operation → KEIN Backup.
 *
 * type ∈ {'fahrten','abwesenheitspauschalen','belege'}:
 *  - fahrten                → alle trips des Jahres, mit Grundwerten (km einfach, €/km, km Hin+Rück) + Betrag
 *  - abwesenheitspauschalen → trips mit meal_allowance_cents > 0, mit Abwesenheit (Std) + angewandtem Satz + Betrag
 *  - belege                 → receipts (nur Aus-/Eingangsrechnungen — Fahrt-Belege werden NICHT gedoppelt)
 *
 * MUSS vor `/:id` stehen (sonst matched Express `/:id` mit id="export").
 */
router.get('/export/:type.csv', (req, res) => {
  const type = req.params.type;
  const year = parseInt(String(req.query.year), 10);
  if (!Number.isFinite(year)) {
    return res.status(400).json({ error: 'Ungültiges oder fehlendes Jahr.' });
  }
  const yearStr = String(year);

  let headers: string[];
  let rows: string[][];
  let filename: string;

  if (type === 'fahrten') {
    // CSV 1 — FAHRTEN: Grundwerte + Sätze getrennt sichtbar, Betrag ist bereits Rundreise.
    const trips = db
      .prepare(
        `SELECT t.expense_date, COALESCE(a.name, t.area_slug) AS bereich,
           COALESCE(t.reference,
             (SELECT number FROM dj_invoices WHERE event_id=t.linked_event_id AND number IS NOT NULL AND is_cancellation=0 ORDER BY id DESC LIMIT 1),
             (SELECT number FROM dj_quotes   WHERE event_id=t.linked_event_id AND number IS NOT NULL ORDER BY id DESC LIMIT 1)
           ) AS referenz,
           t.start_location, t.end_location, t.distance_km, t.rate_per_km_cents, t.amount_cents
         FROM trips t
         LEFT JOIN areas a ON a.slug = t.area_slug
         WHERE strftime('%Y', t.expense_date) = ?
         ORDER BY t.expense_date, t.id`,
      )
      .all(yearStr) as Array<{
      expense_date: string;
      bereich: string | null;
      referenz: string | null;
      start_location: string | null;
      end_location: string | null;
      distance_km: number | null;
      rate_per_km_cents: number | null;
      amount_cents: number | null;
    }>;

    headers = ['Datum', 'Bereich', 'Referenz', 'Von', 'Nach', 'km (einfach)', '€/km', 'km (Hin+Rück)', 'Betrag (EUR)'];
    rows = trips.map((t) => [
      t.expense_date,
      t.bereich ?? '',
      t.referenz ?? '',
      t.start_location ?? '',
      t.end_location ?? '',
      String(t.distance_km ?? 0),
      plainDecimal((t.rate_per_km_cents ?? 0) / 100, 2),
      String((t.distance_km ?? 0) * 2),
      eurFromCents(t.amount_cents),
    ]);
    filename = `fahrten-${year}.csv`;
  } else if (type === 'abwesenheitspauschalen') {
    // CSV 2 — ABWESENHEITSPAUSCHALEN: nur trips mit gespeicherter Pauschale.
    const trips = db
      .prepare(
        `SELECT t.expense_date, COALESCE(e.title, t.purpose) AS anlass,
           t.departure_time, t.return_time, t.meal_allowance_cents
         FROM trips t
         LEFT JOIN dj_events e ON e.id = t.linked_event_id
         WHERE t.meal_allowance_cents > 0 AND strftime('%Y', t.expense_date) = ?
         ORDER BY t.expense_date, t.id`,
      )
      .all(yearStr) as Array<{
      expense_date: string;
      anlass: string | null;
      departure_time: string | null;
      return_time: string | null;
      meal_allowance_cents: number | null;
    }>;

    // Sätze EINMALIG aus dj_settings 'tax' lesen (KEINE 14/28-Hardcodes) — so bleibt die
    // Spalte „Satz (EUR)" konsistent zum gespeicherten „Betrag", auch wenn Benny die Sätze
    // in den DJ-Steuer-Einstellungen ändert. Fallback 14/28 nur wenn das Feld fehlt.
    // (Verbindliche Betrags-Berechnung erfolgt beim Erfassen via computeMealAllowanceCents.)
    const taxRow = db.prepare("SELECT value FROM dj_settings WHERE key = 'tax'").get() as
      | { value: string }
      | undefined;
    const tax = taxRow ? JSON.parse(taxRow.value) : {};
    const rate8 = Number(tax?.meal_allowance_8h) || 14;
    const rate24 = Number(tax?.meal_allowance_24h) || 28;

    // "HH:MM" → Minuten seit Mitternacht; ungültig/fehlend → null.
    const toMinutes = (hhmm: string | null): number | null => {
      if (!hhmm) return null;
      const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
      if (!m) return null;
      return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
    };

    headers = ['Datum', 'Anlass', 'Abfahrt', 'Rückkehr', 'Abwesenheit (Std)', 'Satz (EUR)', 'Betrag (EUR)'];
    rows = trips.map((t) => {
      const dep = toMinutes(t.departure_time);
      const ret = toMinutes(t.return_time);
      let hours = 0;
      if (dep !== null && ret !== null) {
        let durationMin = ret - dep;
        if (durationMin <= 0) durationMin += 24 * 60; // Folgetag-Logik (analog mealAllowance.ts)
        hours = durationMin / 60;
      }
      const satz = hours >= 24 ? rate24 : hours >= 8 ? rate8 : 0;
      return [
        t.expense_date,
        t.anlass ?? '',
        t.departure_time ?? '',
        t.return_time ?? '',
        hoursDecimal(hours),
        plainDecimal(satz, 2),
        eurFromCents(t.meal_allowance_cents),
      ];
    });
    filename = `abwesenheitspauschalen-${year}.csv`;
  } else if (type === 'belege') {
    // CSV 3 — BELEGE/RECHNUNGEN: nur Aus-/Eingangsrechnungen, damit Fahrt-Belege NICHT
    // doppelt auftauchen (die stecken in der Fahrten-CSV). Netto/USt/Brutto getrennt.
    // PRIMARY_AREA_SUBQUERY hier inline dupliziert — die Modul-Konstante steht weiter
    // unten im File (nach dieser Route), daher nicht referenzierbar.
    const receipts = db
      .prepare(
        `SELECT r.receipt_date, r.type, r.supplier_name,
           COALESCE(r.receipt_number, r.supplier_invoice_number) AS beleg_nr,
           r.amount_net_cents, r.vat_amount_cents, r.amount_gross_cents, r.vat_rate, r.status,
           (SELECT a2.name FROM receipt_area_links ral2
              JOIN areas a2 ON a2.id = ral2.area_id
              WHERE ral2.receipt_id = r.id
              ORDER BY ral2.is_primary DESC, a2.name ASC LIMIT 1) AS primary_area
         FROM receipts r
         WHERE r.type IN ('ausgangsrechnung','eingangsrechnung')
           AND strftime('%Y', r.receipt_date) = ?
         ORDER BY r.receipt_date, r.id`,
      )
      .all(yearStr) as Array<{
      receipt_date: string;
      type: string;
      supplier_name: string | null;
      beleg_nr: string | null;
      amount_net_cents: number | null;
      vat_amount_cents: number | null;
      amount_gross_cents: number | null;
      vat_rate: number | null;
      status: string | null;
      primary_area: string | null;
    }>;

    const typLabel = (t: string): string =>
      t === 'ausgangsrechnung' ? 'Ausgangsrechnung' : t === 'eingangsrechnung' ? 'Eingangsrechnung' : t;

    headers = [
      'Datum',
      'Typ',
      'Lieferant/Kunde',
      'Beleg-/Rechnungsnr',
      'Netto (EUR)',
      'USt (EUR)',
      'Brutto (EUR)',
      'Steuersatz (%)',
      'Bereich',
      'Status',
    ];
    rows = receipts.map((r) => [
      r.receipt_date,
      typLabel(r.type),
      r.supplier_name ?? '',
      r.beleg_nr ?? '',
      eurFromCents(r.amount_net_cents),
      eurFromCents(r.vat_amount_cents),
      eurFromCents(r.amount_gross_cents),
      String(r.vat_rate ?? 0),
      r.primary_area ?? '',
      r.status ?? '',
    ]);
    filename = `belege-${year}.csv`;
  } else {
    return res.status(400).json({ error: 'Unbekannter Export-Typ.' });
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buildCsv(headers, rows)); // buildCsv stellt das BOM voran
});

/**
 * GET /api/belege/settings
 *
 * Liefert die 10 Belege-spezifischen Settings als Key-Value-Objekt:
 *  - ustva_zeitraum, ist_versteuerung, payment_task_lead_days
 *  - max_upload_size_mb, ocr_confidence_threshold, ocr_engine
 *  - mileage_rate_default_per_km, mileage_rate_above_20km_per_km
 *  - belege_storage_path
 *  - reverse_charge_enabled
 *  - belege_mirror_path (Finder-Spiegel-Pfad, siehe lib/belegeMirror.ts)
 *
 * MUSS vor `/:id` stehen.
 */
router.get('/settings', (_req, res) => {
  const keys = [
    'ustva_zeitraum',
    'ist_versteuerung',
    'payment_task_lead_days',
    'max_upload_size_mb',
    'ocr_confidence_threshold',
    'ocr_engine',
    'mileage_rate_default_per_km',
    'mileage_rate_above_20km_per_km',
    'belege_storage_path',
    'reverse_charge_enabled',
    'belege_mirror_path',
  ];
  const result: Record<string, string> = {};
  for (const k of keys) {
    const r = db
      .prepare(`SELECT value FROM app_settings WHERE key = ?`)
      .get(k) as { value: string } | undefined;
    result[k] = r?.value ?? '';
  }
  res.json(result);
});

/**
 * PATCH /api/belege/settings
 *
 * Bulk-Update der Belege-Settings. Body: Record<string, string>.
 * Nur die im Body enthaltenen Keys werden geschrieben (UPSERT). Loggt jeden
 * Key einzeln in audit_log (entity_type='app_setting').
 *
 * MUSS vor `/:id` stehen.
 */
router.patch('/settings', (req, res) => {
  const updates = (req.body ?? {}) as Record<string, unknown>;
  if (typeof updates !== 'object' || updates === null) {
    res.status(400).json({ error: 'body must be a key-value object' });
    return;
  }
  const tx = db.transaction(() => {
    for (const [k, v] of Object.entries(updates)) {
      const value = String(v ?? '');
      db.prepare(
        `INSERT INTO app_settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
      ).run(k, value);
      logAudit(req, 'app_setting', 0, 'update', undefined, { key: k, value });
    }
  });
  tx();
  res.json({ ok: true });
});

/**
 * POST /api/belege/areas
 *
 * Erstellt einen neuen Bereich (Area). Body: { name, color?, icon? }.
 * Slug wird aus dem Namen generiert (lowercase + nicht-alphanum → '-').
 * sort_order automatisch ans Ende (max + 10).
 *
 * MUSS vor `/:id` stehen.
 */
router.post('/areas', (req, res) => {
  const { name, color, icon } = (req.body ?? {}) as {
    name?: string;
    color?: string;
    icon?: string;
  };
  if (!name?.trim()) {
    res.status(400).json({ error: 'name required' });
    return;
  }
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  try {
    const result = db
      .prepare(
        `INSERT INTO areas (name, slug, color, icon, sort_order)
         VALUES (?, ?, ?, ?, COALESCE((SELECT MAX(sort_order) FROM areas), 0) + 10)`,
      )
      .run(name.trim(), slug, color ?? '#94aaff', icon ?? 'category');
    const id = Number(result.lastInsertRowid);
    logAudit(req, 'area', id, 'create', undefined, { name, color, icon });
    const created = db.prepare(`SELECT * FROM areas WHERE id = ?`).get(id);
    res.status(201).json(created);
  } catch (err) {
    const msg = (err as Error).message ?? '';
    if (msg.includes('UNIQUE')) {
      res.status(409).json({ error: 'name oder slug bereits vorhanden' });
      return;
    }
    res.status(500).json({ error: msg });
  }
});

/**
 * PATCH /api/belege/areas/:id
 *
 * Partial-Update eines Bereichs. Felder: name, color, icon, archived, sort_order.
 * COALESCE-Pattern: undefined-Felder bleiben unveraendert.
 *
 * MUSS vor `/:id` stehen.
 */
router.patch('/areas/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'Ungueltige id' });
    return;
  }
  const existing = db.prepare(`SELECT * FROM areas WHERE id = ?`).get(id);
  if (!existing) {
    res.status(404).end();
    return;
  }
  const { name, color, icon, archived, sort_order } = (req.body ?? {}) as {
    name?: string;
    color?: string;
    icon?: string;
    archived?: number;
    sort_order?: number;
  };
  try {
    db.prepare(
      `UPDATE areas SET
         name = COALESCE(?, name),
         color = COALESCE(?, color),
         icon = COALESCE(?, icon),
         archived = COALESCE(?, archived),
         sort_order = COALESCE(?, sort_order),
         updated_at = datetime('now')
       WHERE id = ?`,
    ).run(
      name ?? null,
      color ?? null,
      icon ?? null,
      archived ?? null,
      sort_order ?? null,
      id,
    );
    logAudit(req, 'area', id, 'update', existing, req.body);
    res.json(db.prepare(`SELECT * FROM areas WHERE id = ?`).get(id));
  } catch (err) {
    const msg = (err as Error).message ?? '';
    if (msg.includes('UNIQUE')) {
      res.status(409).json({ error: 'name oder slug bereits vorhanden' });
      return;
    }
    res.status(500).json({ error: msg });
  }
});

/**
 * DELETE /api/belege/areas/:id
 *
 * Loescht einen Bereich — mit Link-Guard: Ist der Bereich noch mit Belegen
 * verknuepft (receipt_area_links), wird das Loeschen mit 409 + Anzahl geblockt.
 * areas hat kein Schutz-/is_default-Flag, daher genuegt der Link-Guard.
 *
 * MUSS vor `/:id` stehen.
 */
router.delete('/areas/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'Ungueltige id' });
    return;
  }
  const existing = db.prepare(`SELECT * FROM areas WHERE id = ?`).get(id);
  if (!existing) {
    res.status(404).json({ error: 'Bereich nicht gefunden' });
    return;
  }
  const { c } = db
    .prepare(`SELECT COUNT(*) AS c FROM receipt_area_links WHERE area_id = ?`)
    .get(id) as { c: number };
  if (c > 0) {
    res.status(409).json({ error: 'Bereich hat verknuepfte Belege', count: c });
    return;
  }
  db.prepare(`DELETE FROM areas WHERE id = ?`).run(id);
  logAudit(req, 'area', id, 'delete', existing, undefined);
  res.status(200).json({ ok: true });
});

/**
 * POST /api/belege/tax-categories
 *
 * Erstellt eine neue Steuer-Kategorie. Body: { name, kind, default_vat_rate?, default_input_tax_deductible? }.
 * Kind muss 'einnahme' | 'ausgabe' | 'beides' sein. Slug aus dem Namen generiert.
 *
 * MUSS vor `/:id` stehen.
 */
router.post('/tax-categories', (req, res) => {
  const { name, kind, default_vat_rate, default_input_tax_deductible } = (req.body ?? {}) as {
    name?: string;
    kind?: 'einnahme' | 'ausgabe' | 'beides';
    default_vat_rate?: number;
    default_input_tax_deductible?: number;
  };
  if (!name?.trim() || !kind) {
    res.status(400).json({ error: 'name and kind required' });
    return;
  }
  if (!['einnahme', 'ausgabe', 'beides'].includes(kind)) {
    res.status(400).json({ error: "kind must be 'einnahme' | 'ausgabe' | 'beides'" });
    return;
  }
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  try {
    const result = db
      .prepare(
        `INSERT INTO tax_categories
           (name, slug, kind, default_vat_rate, default_input_tax_deductible, sort_order)
         VALUES (?, ?, ?, ?, ?, COALESCE((SELECT MAX(sort_order) FROM tax_categories), 0) + 10)`,
      )
      .run(
        name.trim(),
        slug,
        kind,
        default_vat_rate ?? null,
        default_input_tax_deductible ?? 1,
      );
    const id = Number(result.lastInsertRowid);
    logAudit(req, 'tax_category', id, 'create', undefined, req.body);
    const created = db
      .prepare(`SELECT * FROM tax_categories WHERE id = ?`)
      .get(id);
    res.status(201).json(created);
  } catch (err) {
    const msg = (err as Error).message ?? '';
    if (msg.includes('UNIQUE')) {
      res.status(409).json({ error: 'name oder slug bereits vorhanden' });
      return;
    }
    res.status(500).json({ error: msg });
  }
});

/**
 * PATCH /api/belege/tax-categories/:id
 *
 * Partial-Update einer Steuer-Kategorie.
 *
 * MUSS vor `/:id` stehen.
 */
router.patch('/tax-categories/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'Ungueltige id' });
    return;
  }
  const existing = db
    .prepare(`SELECT * FROM tax_categories WHERE id = ?`)
    .get(id);
  if (!existing) {
    res.status(404).end();
    return;
  }
  const {
    name,
    kind,
    default_vat_rate,
    default_input_tax_deductible,
    archived,
    sort_order,
  } = (req.body ?? {}) as {
    name?: string;
    kind?: string;
    default_vat_rate?: number | null;
    default_input_tax_deductible?: number;
    archived?: number;
    sort_order?: number;
  };
  if (kind !== undefined && !['einnahme', 'ausgabe', 'beides'].includes(kind)) {
    res.status(400).json({ error: "kind must be 'einnahme' | 'ausgabe' | 'beides'" });
    return;
  }
  try {
    db.prepare(
      `UPDATE tax_categories SET
         name = COALESCE(?, name),
         kind = COALESCE(?, kind),
         default_vat_rate = COALESCE(?, default_vat_rate),
         default_input_tax_deductible = COALESCE(?, default_input_tax_deductible),
         archived = COALESCE(?, archived),
         sort_order = COALESCE(?, sort_order),
         updated_at = datetime('now')
       WHERE id = ?`,
    ).run(
      name ?? null,
      kind ?? null,
      default_vat_rate ?? null,
      default_input_tax_deductible ?? null,
      archived ?? null,
      sort_order ?? null,
      id,
    );
    logAudit(req, 'tax_category', id, 'update', existing, req.body);
    res.json(db.prepare(`SELECT * FROM tax_categories WHERE id = ?`).get(id));
  } catch (err) {
    const msg = (err as Error).message ?? '';
    if (msg.includes('UNIQUE')) {
      res.status(409).json({ error: 'name oder slug bereits vorhanden' });
      return;
    }
    res.status(500).json({ error: msg });
  }
});

/**
 * POST /api/belege/db-backup
 *
 * Manueller Trigger fuer ein DB-Backup (createBackup-Helper aus db/backup.ts).
 * Single-User-App, kein Rate-Limiting noetig (siehe Threat T-04-SETTINGS-02).
 *
 * MUSS vor `/:id` stehen.
 */
router.post('/db-backup', (_req, res) => {
  try {
    const path = createBackup('manual-belege-settings');
    if (!path) {
      res.status(500).json({ error: 'Backup-Erstellung fehlgeschlagen' });
      return;
    }
    res.json({ ok: true, path });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/**
 * POST /api/belege/mirror-rebuild
 *
 * Leert den Finder-Spiegel (Belege/) und baut ihn komplett aus DB + App-Speicher
 * neu auf (deckt auch Bereichs-Umbenennungen ab). Best-effort — scheitert nie
 * hart, siehe belegeMirror.rebuildMirror.
 *
 * MUSS vor `/:id` stehen.
 */
router.post('/mirror-rebuild', (_req, res) => {
  belegeMirror.rebuildMirror();
  res.json({ ok: true });
});

/**
 * POST /api/belege/manual
 *
 * Legt einen Beleg OHNE Datei an (Eigenbeleg / Bar-Quittung / verlorener Beleg).
 * Es gibt sonst KEINEN fileless-create-Endpoint — /upload braucht eine Datei,
 * /:id/korrektur braucht ein Original. Netto/USt werden aus Brutto+Satz vom
 * receiptService (recomputeAmounts) abgeleitet — hier NUR gross+rate schicken.
 *
 * Body: { type, receipt_date, supplier_name?, supplier_invoice_number?,
 *         amount_gross_cents, vat_rate?, area_id?, steuerrelevant?, notes? }
 *
 * KEIN createBackup — EINZELnes create (CLAUDE.md: Backup nur bei Bulk).
 * receiptService.create schreibt bereits einen audit_log-Eintrag.
 *
 * MUSS vor `/:id` stehen — sonst matched Express `/:id` mit id="manual" (NaN → 400).
 */
router.post('/manual', (req, res) => {
  const {
    type,
    receipt_date,
    supplier_name,
    supplier_invoice_number,
    amount_gross_cents,
    vat_rate,
    area_id,
    steuerrelevant,
    notes,
  } = (req.body ?? {}) as {
    type?: string;
    receipt_date?: string;
    supplier_name?: string;
    supplier_invoice_number?: string;
    amount_gross_cents?: number;
    vat_rate?: number;
    area_id?: number | null;
    steuerrelevant?: boolean | number;
    notes?: string;
  };

  // Nur manuell erlaubte Typen (KEIN 'fahrt' — Fahrten kommen aus dem Trip-Sync).
  const allowedTypes = ['eingangsrechnung', 'ausgangsrechnung', 'quittung', 'sonstiges'];
  if (!type || !allowedTypes.includes(type)) {
    res.status(400).json({ error: 'Ungültiger Belegtyp.' });
    return;
  }
  if (typeof receipt_date !== 'string' || !receipt_date.trim()) {
    res.status(400).json({ error: 'Datum ist Pflicht.' });
    return;
  }
  const grossCents = Number(amount_gross_cents);
  if (!Number.isFinite(grossCents) || grossCents < 0) {
    res.status(400).json({ error: 'Betrag ist ungültig.' });
    return;
  }
  // vat_rate auf erlaubte Sätze erzwingen; Default 19.
  const rateNum = Number(vat_rate);
  const rate = [0, 7, 19].includes(rateNum) ? rateNum : 19;

  // Bereich (optional) — wenn gesetzt, muss die Area existieren.
  let areaIdNum: number | null = null;
  if (area_id !== undefined && area_id !== null && String(area_id) !== '') {
    areaIdNum = Number(area_id);
    if (!Number.isFinite(areaIdNum)) {
      res.status(400).json({ error: 'Bereich ist ungültig.' });
      return;
    }
    const area = db.prepare(`SELECT id FROM areas WHERE id = ?`).get(areaIdNum);
    if (!area) {
      res.status(404).json({ error: 'Bereich nicht gefunden.' });
      return;
    }
  }

  const trimOrNull = (v: unknown): string | null => {
    const s = typeof v === 'string' ? v.trim() : '';
    return s ? s : null;
  };

  const created = receiptService.create(req, {
    type: type as
      | 'eingangsrechnung'
      | 'ausgangsrechnung'
      | 'quittung'
      | 'sonstiges',
    receipt_date: receipt_date.trim(),
    supplier_name: trimOrNull(supplier_name),
    supplier_invoice_number: trimOrNull(supplier_invoice_number),
    amount_gross_cents: grossCents,
    vat_rate: rate,
    steuerrelevant: steuerrelevant === false || steuerrelevant === 0 ? 0 : 1,
    status: 'zu_pruefen',
    source: 'manual_upload',
    created_via: 'manual_form',
    notes: trimOrNull(notes),
  });

  // Bereich verknuepfen (is_primary=1) — receiptService.create legt keine Links an.
  if (areaIdNum !== null) {
    db.prepare(
      `INSERT INTO receipt_area_links (receipt_id, area_id, is_primary, share_percent)
       VALUES (?, ?, 1, 100)`,
    ).run(created.id, areaIdNum);
  }

  // Finder-Spiegel best-effort (fileless → irrelevant, aber harmlos wie andere Routen).
  belegeMirror.syncReceipt(created.id);

  res.status(201).json(created);
});

/**
 * POST /api/belege/dj-pdf-backfill
 *
 * Einmaliger Backfill: erzeugt PDFs fuer alle bereits finalisierten DJ-Rechnungen,
 * deren gespiegelter Beleg noch keine Datei hat (CLAUDE.md-Regel: Backup vor
 * Massen-Insert via createBackup).
 *
 * MUSS vor `/:id` stehen.
 */
router.post('/dj-pdf-backfill', async (_req, res) => {
  createBackup('dj-pdf-backfill');
  const r = await belegeMirror.backfillDjPdfs();
  res.json({ ok: true, generated: r.generated });
});

/** Primaerer Bereichsname je Beleg (is_primary zuerst) — fuer die Bereich-Spalte der Liste. */
const PRIMARY_AREA_SUBQUERY = `(
  SELECT a2.name FROM receipt_area_links ral2
  JOIN areas a2 ON a2.id = ral2.area_id
  WHERE ral2.receipt_id = r.id
  ORDER BY ral2.is_primary DESC, a2.name ASC
  LIMIT 1
) AS primary_area`;

/**
 * GET /api/belege?area=DJ&status=offen&type=eingangsrechnung&from=YYYY-MM-DD&to=YYYY-MM-DD&search=...
 *
 * Wenn `area` gesetzt ist, wird ueber receipt_area_links gejoined.
 */
router.get('/', (req, res) => {
  const { area, status, from, to, type, search, steuerrelevant } = req.query as Record<string, string | undefined>;
  const where: string[] = [];
  const params: unknown[] = [];

  if (status) {
    where.push(`r.status = ?`);
    params.push(status);
  }
  if (steuerrelevant === '1' || steuerrelevant === '0') {
    where.push(`r.steuerrelevant = ?`);
    params.push(Number(steuerrelevant));
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
      SELECT DISTINCT r.*, ${PRIMARY_AREA_SUBQUERY} FROM receipts r
      INNER JOIN receipt_area_links ral ON ral.receipt_id = r.id
      INNER JOIN areas a ON a.id = ral.area_id
      WHERE a.name = ? ${where.length ? 'AND ' + where.join(' AND ') : ''}
      ORDER BY r.receipt_date DESC, r.id DESC
      LIMIT 500
    `;
    params.unshift(area);
  } else {
    sql = `
      SELECT r.*, ${PRIMARY_AREA_SUBQUERY} FROM receipts r
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY r.receipt_date DESC, r.id DESC
      LIMIT 500
    `;
  }
  res.json(db.prepare(sql).all(...params));
});

/**
 * GET /api/belege/overview-kpis
 *
 * Liefert die 6 KPI-Werte fuer die Belege-Uebersichtsseite (Plan 04-07):
 *  - neueBelege7d: Anzahl Belege der letzten 7 Tage (created_at)
 *  - zuPruefen: Anzahl Belege mit status='zu_pruefen'
 *  - offeneZahlungen: Anzahl + Restbetrags-Summe (status IN offen,teilbezahlt)
 *  - ueberfaellig: Anzahl ueberfaelliger Zahlungen (due_date < heute)
 *  - steuerzahllastCurrentPeriodCents: Zahllast fuer den aktuellen UStVA-Zeitraum
 *    (null wenn ustva_zeitraum='keine' — UI blendet KPI dann aus)
 *  - steuerrelevantThisYearCents: Brutto-Summe steuerrelevanter Belege im laufenden Jahr
 *  - ustvaZeitraum: aktueller Setting-Wert fuer Conditional-Rendering im UI
 *
 * MUSS vor `/:id` stehen — sonst matched Express `/:id` mit
 * id="overview-kpis" (NaN → 400).
 */

/**
 * GET /api/belege/years
 *
 * Liefert die verfuegbaren Jahre (DESC) fuer den Year-Dropdown auf der
 * Uebersichts-Page. Vereint receipt_date- und payment_date-Jahre, damit
 * sowohl Belegjahre als auch reine Zahljahre abgedeckt sind.
 *
 * MUSS vor `/:id` stehen.
 */
router.get('/years', (_req, res) => {
  const rows = db
    .prepare(
      `
      SELECT DISTINCT y FROM (
        SELECT strftime('%Y', receipt_date) AS y FROM receipts WHERE receipt_date IS NOT NULL
        UNION
        SELECT strftime('%Y', payment_date) AS y FROM receipts WHERE payment_date IS NOT NULL
      )
      WHERE y IS NOT NULL AND y != ''
      ORDER BY y DESC
      `,
    )
    .all() as Array<{ y: string }>;
  res.json(rows.map((r) => Number(r.y)).filter((n) => Number.isFinite(n)));
});

router.get('/overview-kpis', (req, res) => {
  const ustvaSetting =
    (db
      .prepare(`SELECT value FROM app_settings WHERE key = 'ustva_zeitraum'`)
      .get() as { value: string } | undefined)?.value || 'keine';

  // Year-Filter: ?year=2026 oder ?year=all (jahresuebergreifend)
  const yearParam = String(req.query.year ?? '');
  const yearFiltered = yearParam !== '' && yearParam !== 'all';
  const year = yearFiltered ? Number(yearParam) : new Date().getFullYear();

  const neueBelege7d = (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM receipts WHERE created_at >= datetime('now','-7 days')`,
      )
      .get() as { c: number }
  ).c;

  const zuPruefen = (
    db
      .prepare(`SELECT COUNT(*) AS c FROM receipts WHERE status = 'zu_pruefen'`)
      .get() as { c: number }
  ).c;

  const offen = db
    .prepare(
      `
      SELECT COUNT(*) AS c, COALESCE(SUM(amount_gross_cents - paid_amount_cents), 0) AS sum_cents
      FROM receipts WHERE status IN ('offen','teilbezahlt')
    `,
    )
    .get() as { c: number; sum_cents: number };

  const ueberfaellig = (
    db
      .prepare(
        `
        SELECT COUNT(*) AS c FROM receipts
        WHERE status IN ('offen','teilbezahlt')
          AND due_date IS NOT NULL
          AND date(due_date) < date('now')
      `,
      )
      .get() as { c: number }
  ).c;

  // Steuerzahllast: nur fuer konkrete Jahre sinnvoll (UStVA-Aggregation pro Jahr).
  // Bei year=all blenden wir den KPI aus (null).
  let steuerzahllast: number | null = null;
  let periodLabel: string | null = null;
  if (ustvaSetting !== 'keine' && yearParam !== 'all') {
    const period = ustvaSetting as UstvaPeriod;
    const buckets = aggregateForUstva(year, period);
    const month = new Date().getMonth() + 1;
    let bucketIdx = 0;
    if (period === 'monat') {
      bucketIdx = month - 1;
    } else if (period === 'quartal') {
      bucketIdx = Math.floor((month - 1) / 3);
    } else {
      bucketIdx = 0;
    }
    steuerzahllast = buckets[bucketIdx]?.zahllast_cents ?? 0;
    if (period === 'monat') {
      periodLabel = `${MONAT_NAMEN_LANG[bucketIdx]} ${year}`;
    } else if (period === 'quartal') {
      periodLabel = `Q${bucketIdx + 1} ${year}`;
    } else {
      periodLabel = String(year);
    }
  }

  // Steuerrelevant fuer das ausgewaehlte Jahr (oder gesamt bei year=all).
  const steuerrelevant = yearParam === 'all'
    ? (
        db
          .prepare(
            `SELECT COALESCE(SUM(amount_gross_cents), 0) AS sum_cents
             FROM receipts WHERE steuerrelevant = 1`,
          )
          .get() as { sum_cents: number }
      ).sum_cents
    : (
        db
          .prepare(
            `SELECT COALESCE(SUM(amount_gross_cents), 0) AS sum_cents
             FROM receipts
             WHERE steuerrelevant = 1 AND strftime('%Y', receipt_date) = ?`,
          )
          .get(String(year)) as { sum_cents: number }
      ).sum_cents;

  res.json({
    year: yearParam === 'all' ? null : year,
    neueBelege7d,
    zuPruefen,
    offeneZahlungen: offen.c,
    offeneZahlungenSumCents: offen.sum_cents,
    ueberfaellig,
    steuerzahllastCurrentPeriodCents: steuerzahllast,
    periodLabel,
    steuerrelevantThisYearCents: steuerrelevant,
    ustvaZeitraum: ustvaSetting,
  });
});

/**
 * GET /api/belege/:id/file/:fileId
 *
 * Streamt eine Beleg-Datei (PDF oder Bild) inline zur Anzeige in der UI
 * (BelegeDetailPage / PdfPreview).
 *
 * Sicherheit:
 *  - storage_path stammt aus DB (Plan 04-03 multer rename), niemals aus User-Input
 *    → kein Path-Traversal moeglich (Threat T-04-UI-LIST-01)
 *  - fs.existsSync-Check vor dem Stream verhindert leere Antwort + Crash
 *  - verifyToken-Guard ist global vor /api/belege im app.ts gemounted
 *
 * MUSS vor `/:id` stehen — sonst matched Express `/:id` mit id="<num>/file/<num>"
 * (NaN → 400) bzw. Express versteht `:id` als nur den ersten Segment.
 * Da diese Route ein zusaetzliches Sub-Pfad-Segment hat, matched Express
 * spezifischer-zuerst → Reihenfolge in der Datei ist hier nicht kritisch,
 * aber wir platzieren sie aus Lesbarkeit vor `/:id`.
 */
router.get('/:id/file/:fileId', (req, res) => {
  const id = Number(req.params.id);
  const fileId = Number(req.params.fileId);
  if (!Number.isFinite(id) || !Number.isFinite(fileId)) {
    res.status(400).json({ error: 'Ungueltige id' });
    return;
  }
  const r = db
    .prepare(
      `SELECT storage_path, mime_type, original_filename
       FROM receipt_files
       WHERE id = ? AND receipt_id = ?`,
    )
    .get(fileId, id) as
    | { storage_path: string; mime_type: string | null; original_filename: string }
    | undefined;
  if (!r) {
    res.status(404).end();
    return;
  }
  if (!fs.existsSync(r.storage_path)) {
    res.status(404).json({ error: 'Datei fehlt im Storage.' });
    return;
  }
  res.setHeader('Content-Type', r.mime_type || 'application/octet-stream');
  res.setHeader(
    'Content-Disposition',
    `inline; filename="${path.basename(r.original_filename)}"`,
  );
  fs.createReadStream(r.storage_path).pipe(res);
});

/**
 * POST /api/belege/:id/korrektur
 *
 * Erstellt einen Korrekturbeleg (Storno) zu einem (typischerweise freigegebenen)
 * Originalbeleg. Der neue Beleg
 *  - hat negative Cents-Beträge (storniert die Original-Werte)
 *  - referenziert das Original via `corrects_receipt_id`
 *  - status='zu_pruefen' (User muss den Korrekturbeleg pruefen + freigeben)
 *
 * Anschliessend wird im Original `corrected_by_receipt_id` gesetzt.
 * Die Spalte ist NICHT im GoBD-Lock-Trigger (siehe Migration 040 Trigger
 * trg_receipts_no_update_after_freigabe), darf also auf freigegebenen Belegen
 * gesetzt werden — es ist eine Verkettungs-Information, keine Werte-Aenderung.
 */
router.post('/:id/korrektur', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    res.status(400).json({ error: 'Ungueltige id' });
    return;
  }
  const orig = db
    .prepare(
      `SELECT id, type, supplier_name, supplier_invoice_number, receipt_date,
              amount_gross_cents, amount_net_cents, vat_rate, vat_amount_cents,
              currency, tax_category_id, contract_id
       FROM receipts WHERE id = ?`,
    )
    .get(id) as
    | {
        id: number;
        type: string;
        supplier_name: string | null;
        supplier_invoice_number: string | null;
        receipt_date: string;
        amount_gross_cents: number;
        amount_net_cents: number;
        vat_rate: number;
        vat_amount_cents: number;
        currency: string;
        tax_category_id: number | null;
        contract_id: number | null;
      }
    | undefined;
  if (!orig) {
    res.status(404).end();
    return;
  }

  const result = db
    .prepare(
      `INSERT INTO receipts (
         type, source, supplier_name, supplier_invoice_number, receipt_date,
         currency, amount_gross_cents, amount_net_cents, vat_rate, vat_amount_cents,
         amount_gross_eur_cents, status, corrects_receipt_id, tax_category_id, notes, title, contract_id
       ) VALUES (
         ?, 'manual_upload', ?, ?, date('now'),
         ?, ?, ?, ?, ?,
         ?, 'zu_pruefen', ?, ?, ?, ?, ?
       )`,
    )
    .run(
      orig.type,
      orig.supplier_name,
      orig.supplier_invoice_number,
      orig.currency,
      -orig.amount_gross_cents,
      -orig.amount_net_cents,
      orig.vat_rate,
      -orig.vat_amount_cents,
      -orig.amount_gross_cents, // amount_gross_eur_cents (kein FX-Bezug; spiegel Brutto)
      id,
      orig.tax_category_id,
      `Korrekturbeleg zu Beleg #${id}`,
      `Korrektur: ${orig.supplier_name ?? `Beleg #${id}`}`,
      orig.contract_id,
    );
  const newId = Number(result.lastInsertRowid);

  // Original verkettet auf neuen Beleg (corrected_by_receipt_id ist NICHT im GoBD-Trigger)
  db.prepare(
    `UPDATE receipts SET corrected_by_receipt_id = ? WHERE id = ?`,
  ).run(newId, id);

  logAudit(req, 'receipt', newId, 'create', undefined, {
    korrektur_zu: id,
    amount_gross_cents: -orig.amount_gross_cents,
  });
  logAudit(req, 'receipt', id, 'update', undefined, {
    corrected_by_receipt_id: newId,
  });

  const created = db.prepare(`SELECT * FROM receipts WHERE id = ?`).get(newId);
  belegeMirror.syncReceipt(newId);
  res.status(201).json(created);
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

  // Vertrags-Kurzinfo (Feature 3, Plan quick-260702-vz7) — nur nachladen wenn verknuepft.
  const contract = receipt.contract_id
    ? db
        .prepare(
          `SELECT id, title, cost_interval, reminder_date FROM contracts_and_deadlines WHERE id = ?`,
        )
        .get(receipt.contract_id) ?? null
    : null;

  res.json({ ...receipt, files, area_links: areaLinks, ocr_results: ocr, audit_log: audit, contract });
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

  // contract_id-Validierung + Vertrags-Activity-Log (Feature 3, Plan quick-260702-vz7).
  // Vor receiptService.update pruefen, damit ein ungueltiger Vertrag einen
  // sprechenden 400/404 liefert statt eines rohen FK-Fehlers.
  const body = (req.body ?? {}) as { contract_id?: unknown };
  let newContractId: number | null | undefined;
  if ('contract_id' in body) {
    if (body.contract_id === null) {
      newContractId = null;
    } else {
      const cid = Number(body.contract_id);
      if (!Number.isFinite(cid)) {
        res.status(400).json({ error: 'contract_id muss eine Zahl oder null sein' });
        return;
      }
      const contractExists = db
        .prepare(`SELECT id FROM contracts_and_deadlines WHERE id = ?`)
        .get(cid);
      if (!contractExists) {
        res.status(404).json({ error: 'Vertrag nicht gefunden' });
        return;
      }
      newContractId = cid;
    }
  }
  const oldContractId = newContractId !== undefined
    ? ((db.prepare(`SELECT contract_id FROM receipts WHERE id = ?`).get(id) as { contract_id: number | null } | undefined)?.contract_id ?? null)
    : undefined;

  try {
    const updated = receiptService.update(req, id, req.body ?? {});

    if (newContractId !== undefined && newContractId !== oldContractId) {
      if (newContractId !== null) {
        db.prepare(
          `INSERT INTO contracts_and_deadlines_activity_log (item_id, event_type, message) VALUES (?, ?, ?)`,
        ).run(newContractId, 'receipt_linked', `Beleg #${id} verknüpft`);
      }
      if (oldContractId) {
        db.prepare(
          `INSERT INTO contracts_and_deadlines_activity_log (item_id, event_type, message) VALUES (?, ?, ?)`,
        ).run(oldContractId, 'receipt_unlinked', `Beleg #${id} entfernt`);
      }
    }

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

    belegeMirror.syncReceipt(id);
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

  belegeMirror.syncReceipt(id);
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
    belegeMirror.syncReceipt(id);
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
 *
 * Loescht zusaetzlich die physischen Storage-Dateien — receipt_files-Rows
 * werden via ON DELETE CASCADE entfernt, aber die Dateien auf der Disk
 * waeren sonst Orphans. fs.unlink-Fehler werden geschluckt: DB-State ist
 * entscheidend, eine fehlende Datei darf den Loesch-Vorgang nicht blocken.
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
  const filePaths = db
    .prepare(`SELECT storage_path, mirror_path FROM receipt_files WHERE receipt_id = ?`)
    .all(id) as Array<{ storage_path: string; mirror_path: string | null }>;
  logAudit(req, 'receipt', id, 'delete');
  db.prepare(`DELETE FROM receipts WHERE id = ?`).run(id);
  for (const { storage_path } of filePaths) {
    try {
      if (fs.existsSync(storage_path)) {
        fs.unlinkSync(storage_path);
      }
    } catch (err) {
      console.warn(`[belege:delete] storage cleanup failed for ${storage_path}:`, (err as Error).message);
    }
  }
  belegeMirror.removeMirrorPaths(filePaths.map((f) => f.mirror_path).filter((p): p is string => !!p));
  res.status(204).end();
});

export default router;
