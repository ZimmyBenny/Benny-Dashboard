/**
 * Frontend API-Wrapper fuer das Belege-Modul (Phase 04).
 *
 * Konvention: Geld-Werte kommen vom Backend als INTEGER (Cents) und werden
 * im UI ueber `formatCurrencyFromCents` (siehe lib/format.ts) formatiert.
 *
 * Endpoints (siehe backend/src/routes/belege.routes.ts):
 *  - GET    /api/belege                    Liste mit Filtern
 *  - GET    /api/belege/:id                Detail inkl. files/areas/ocr/audit
 *  - GET    /api/belege/overview-kpis      Aggregat-Werte fuer die Uebersichts-Page (Plan 04-07)
 *  - GET    /api/belege/supplier-suggest   Lieferanten-Vorschlag aus supplier_memory
 *  - POST   /api/belege/upload             Multi-File-Upload + Background-OCR
 *  - PATCH  /api/belege/:id                Partial-Update (GoBD-Trigger blockt freigegebene)
 *  - POST   /api/belege/:id/areas          Area-Links setzen
 *  - POST   /api/belege/:id/freigeben      GoBD-Lock setzen
 */
import apiClient from './client';

// ── Types ─────────────────────────────────────────────────────────────────

/** Listen-Eintrag (entspricht receipts-Spalten ohne Joins). */
export interface ReceiptListItem {
  id: number;
  type: string;
  source: string;
  status: string;
  supplier_name: string | null;
  supplier_invoice_number: string | null;
  receipt_number: string | null;
  receipt_date: string;
  due_date: string | null;
  payment_date: string | null;
  amount_gross_cents: number;
  amount_net_cents: number;
  vat_rate: number;
  vat_amount_cents: number;
  freigegeben_at: string | null;
  file_hash_sha256: string | null;
  original_filename: string | null;
  linked_invoice_id: number | null;
  linked_trip_id: number | null;
  title: string | null;
  notes: string | null;
}

/** Detail-Response inkl. Joins (files / area_links / ocr_results / audit_log). */
export interface ReceiptDetail extends ReceiptListItem {
  files: Array<{
    id: number;
    original_filename: string;
    storage_path: string;
    sha256: string;
    mime_type: string;
    file_size_bytes: number;
  }>;
  area_links: Array<{
    area_id: number;
    area_name: string;
    area_color: string;
    is_primary: number;
    share_percent: number;
  }>;
  ocr_results: Array<{
    id: number;
    engine: string;
    full_text: string;
    overall_confidence: number;
    parsed_fields_json: string;
    applied_at: string;
  }>;
  audit_log: Array<{
    id: number;
    action: string;
    old_value: string | null;
    new_value: string | null;
    actor: string | null;
    created_at: string;
  }>;
}

export interface ReceiptFilter {
  area?: string;
  status?: string;
  type?: string;
  from?: string;
  to?: string;
  search?: string;
}

/** Aggregat-Werte fuer die Belege-Uebersichts-Page (Plan 04-07). */
export interface OverviewKpis {
  /** Anzahl Belege erstellt in den letzten 7 Tagen */
  neueBelege7d: number;
  /** Anzahl Belege mit status='zu_pruefen' */
  zuPruefen: number;
  /** Anzahl offener Zahlungen (status IN offen,teilbezahlt) */
  offeneZahlungen: number;
  /** Summe der offenen Restbetraege in Cents */
  offeneZahlungenSumCents: number;
  /** Anzahl ueberfaelliger Zahlungen (due_date < heute) */
  ueberfaellig: number;
  /**
   * Steuerzahllast fuer den aktuellen UStVA-Zeitraum (Cents).
   * `null` wenn `ustva_zeitraum='keine'` (UI blendet die KPI dann aus).
   */
  steuerzahllastCurrentPeriodCents: number | null;
  /** Summe steuerrelevanter Brutto-Beträge im aktuellen Jahr (Cents) */
  steuerrelevantThisYearCents: number;
  /** Setting `app_settings.ustva_zeitraum` */
  ustvaZeitraum: 'keine' | 'monat' | 'quartal' | 'jahr';
}

export interface SupplierSuggestion {
  supplier_normalized: string | null;
  area_id: number | null;
  tax_category_id: number | null;
}

/** Bereich (areas-Tabelle, nur nicht-archivierte). */
export interface Area {
  id: number;
  name: string;
  slug: string;
  color: string;
  icon: string;
  sort_order: number;
  archived: number;
}

/** Steuer-Kategorie (tax_categories-Tabelle, nur nicht-archivierte). */
export interface TaxCategory {
  id: number;
  name: string;
  slug: string;
  kind: string;
  default_vat_rate: number | null;
  default_input_tax_deductible: number;
  sort_order: number;
}

export interface UploadResult {
  created: Array<{
    id: number;
    original_filename: string;
    sha: string;
    duplicate?: boolean;
    existingId?: number;
  }>;
}

// ── Endpoints ─────────────────────────────────────────────────────────────

export const fetchReceipts = (filter: ReceiptFilter = {}): Promise<ReceiptListItem[]> =>
  apiClient.get('/belege', { params: filter }).then((r) => r.data);

export const fetchReceipt = (id: number): Promise<ReceiptDetail> =>
  apiClient.get(`/belege/${id}`).then((r) => r.data);

export const fetchOverviewKpis = (): Promise<OverviewKpis> =>
  apiClient.get('/belege/overview-kpis').then((r) => r.data);

export const fetchOpenPayments = (): Promise<ReceiptListItem[]> =>
  apiClient.get('/belege', { params: { status: 'offen' } }).then((r) => r.data);

export const fetchSupplierSuggest = (supplier: string): Promise<SupplierSuggestion> =>
  apiClient
    .get('/belege/supplier-suggest', { params: { supplier } })
    .then((r) => r.data);

export const uploadReceipts = (files: File[]): Promise<UploadResult> => {
  const fd = new FormData();
  files.forEach((f) => fd.append('file', f));
  return apiClient
    .post('/belege/upload', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    .then((r) => r.data);
};

export const updateReceipt = (
  id: number,
  data: Partial<ReceiptListItem>,
): Promise<ReceiptListItem> =>
  apiClient.patch(`/belege/${id}`, data).then((r) => r.data);

export const setReceiptAreas = (
  id: number,
  area_ids: number[],
  primary_area_id?: number,
): Promise<void> =>
  apiClient
    .post(`/belege/${id}/areas`, { area_ids, primary_area_id })
    .then(() => undefined);

export const freigebenReceipt = (id: number): Promise<ReceiptDetail> =>
  apiClient.post(`/belege/${id}/freigeben`).then((r) => r.data);

/** GET /api/belege/areas — Picker-Quelle fuer den Upload-Bereichs-Selector (Plan 04-09). */
export const fetchAreas = (): Promise<Area[]> =>
  apiClient.get('/belege/areas').then((r) => r.data);

/** GET /api/belege/tax-categories — Picker-Quelle fuer den Steuer-Kategorie-Selector (Plan 04-09). */
export const fetchTaxCategories = (): Promise<TaxCategory[]> =>
  apiClient.get('/belege/tax-categories').then((r) => r.data);
