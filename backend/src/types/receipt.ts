/**
 * Zentrale Typen für das Belege-Modul.
 *
 * Wird von receiptService, taxCalcService, duplicateCheckService und
 * den Belege-Routes (Plan 03+) gemeinsam verwendet.
 *
 * Money-Convention: ALLE Geld-Felder sind INTEGER in Cents.
 */

export type ReceiptType =
  | 'eingangsrechnung'
  | 'ausgangsrechnung'
  | 'beleg'
  | 'fahrt'
  | 'quittung'
  | 'spesen'
  | 'sonstiges';

export type ReceiptSource =
  | 'manual_upload'
  | 'dj_invoice_sync'
  | 'dj_trip_sync'
  | 'email_import'
  | 'api_import';

export type ReceiptStatus =
  | 'ocr_pending'
  | 'zu_pruefen'
  | 'offen'
  | 'teilbezahlt'
  | 'bezahlt'
  | 'ueberfaellig'
  | 'freigegeben'
  | 'archiviert'
  | 'nicht_relevant'
  | 'storniert';

/** Vollständige Receipt-Row, wie sie aus der DB kommt. */
export interface Receipt {
  id: number;
  type: ReceiptType;
  source: ReceiptSource;
  created_via: string | null;
  supplier_name: string | null;
  supplier_contact_id: number | null;
  supplier_invoice_number: string | null;
  receipt_number: string | null;
  receipt_date: string;
  due_date: string | null;
  payment_date: string | null;
  currency: string;
  amount_gross_cents: number;
  amount_net_cents: number;
  vat_rate: number;
  vat_amount_cents: number;
  exchange_rate: number;
  amount_gross_eur_cents: number;
  tax_category_id: number | null;
  tax_category: string | null;
  steuerrelevant: 0 | 1;
  input_tax_deductible: 0 | 1;
  reverse_charge: 0 | 1;
  import_eust: 0 | 1;
  private_share_percent: number;
  status: ReceiptStatus;
  freigegeben_at: string | null;
  freigegeben_by: string | null;
  payment_method: string | null;
  payment_account_ref: string | null;
  paid_amount_cents: number;
  file_hash_sha256: string | null;
  original_filename: string | null;
  corrects_receipt_id: number | null;
  corrected_by_receipt_id: number | null;
  linked_invoice_id: number | null;
  linked_trip_id: number | null;
  title: string | null;
  notes: string | null;
  tags: string | null;
  created_at: string;
  updated_at: string;
}

/** Eingabe für receiptService.create. Pflicht: type + receipt_date. */
export interface CreateReceiptInput {
  type: ReceiptType;
  source?: ReceiptSource;
  created_via?: string | null;
  supplier_name?: string | null;
  supplier_contact_id?: number | null;
  supplier_invoice_number?: string | null;
  receipt_number?: string | null;
  receipt_date: string;
  due_date?: string | null;
  payment_date?: string | null;
  currency?: string;
  amount_gross_cents?: number;
  amount_net_cents?: number;
  vat_rate?: number;
  vat_amount_cents?: number;
  tax_category_id?: number | null;
  tax_category?: string | null;
  steuerrelevant?: 0 | 1;
  input_tax_deductible?: 0 | 1;
  reverse_charge?: 0 | 1;
  import_eust?: 0 | 1;
  private_share_percent?: number;
  status?: ReceiptStatus;
  payment_method?: string | null;
  payment_account_ref?: string | null;
  paid_amount_cents?: number;
  file_hash_sha256?: string | null;
  original_filename?: string | null;
  linked_invoice_id?: number | null;
  linked_trip_id?: number | null;
  title?: string | null;
  notes?: string | null;
  tags?: string | null;
}

/** Generisches Parsed-Field-Wrapper für OCR-Ergebnisse mit Konfidenz. */
export interface ParsedField<T> {
  value: T | null;
  confidence: number;
}

/** Aus OCR-Text extrahierte Strukturdaten (Plan 03 receiptParserService). */
export interface ParsedReceipt {
  supplier_name: ParsedField<string>;
  supplier_invoice_number: ParsedField<string>;
  receipt_date: ParsedField<string>;
  amount_gross_cents: ParsedField<number>;
  amount_net_cents: ParsedField<number>;
  vat_amount_cents: ParsedField<number>;
  vat_rate: ParsedField<number>;
  iban: ParsedField<string>;
  reverse_charge: ParsedField<boolean>;
}

/** Roh-OCR-Output (Plan 03 ocrService). */
export interface OcrResult {
  text: string;
  confidence: number;
  engine: 'tesseract' | 'mock';
  languages: string;
}
