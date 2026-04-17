import apiClient from './client';

// ── Typen ──────────────────────────────────────────────────────────────────────

export type EventType = 'hochzeit' | 'firmen_event' | 'club_bar' | 'geburtstag' | 'festival' | 'sonstige';
export type EventStatus = 'anfrage' | 'neu' | 'vorgespraech_vereinbart' | 'angebot_gesendet' | 'bestaetigt' | 'abgeschlossen' | 'abgesagt';
export type QuoteStatus = 'entwurf' | 'gesendet' | 'angenommen' | 'abgelehnt' | 'abgelaufen';
export type InvoiceStatus = 'entwurf' | 'offen' | 'teilbezahlt' | 'bezahlt' | 'ueberfaellig' | 'storniert';

export interface DjCustomer {
  id: number;
  contact_kind: string;
  salutation: string | null;
  first_name: string | null;
  last_name: string | null;
  organization_name: string | null;
  customer_number: string | null;
  area: string;
  city: string | null;
  email: string | null;
  phone: string | null;
  event_count?: number;
}

export interface DjEvent {
  id: number;
  customer_id: number | null;
  location_id: number | null;
  title: string | null;
  event_type: EventType;
  event_date: string;
  time_start: string | null;
  time_end: string | null;
  setup_minutes: number;
  teardown_minutes: number;
  guests: number | null;
  status: EventStatus;
  notes: string | null;
  source_channel: string | null;
  venue_name: string | null;
  venue_street: string | null;
  venue_zip: string | null;
  venue_city: string | null;
  created_at: string;
  updated_at: string;
  calendar_uid?: string | null;
  vorgespraech_status?: 'offen' | 'erledigt' | null;
  vorgespraech_datum?: string | null;
  vorgespraech_plz?: string | null;
  vorgespraech_ort?: string | null;
  vorgespraech_notizen?: string | null;
  vorgespraech_km?: number | null;
  vorgespraech_calendar_uid?: string | null;
  // joined
  customer_name?: string;
  customer_org?: string;
  location_name?: string;
  location_city?: string;
}

export interface DjService {
  id: number;
  category: string;
  name: string;
  description: string | null;
  unit: string;
  price_net: number;
  tax_rate: number;
  active: number;
  sort_order: number;
}

export interface DjPackage {
  id: number;
  name: string;
  description: string | null;
  price_net: number;
  tax_rate: number;
  active: number;
  sort_order: number;
  services?: DjService[];
}

export interface DjQuoteItem {
  id?: number;
  position: number;
  service_id: number | null;
  package_id: number | null;
  description: string;
  quantity: number;
  unit: string;
  price_net: number;
  tax_rate: number;
  discount_pct: number;
  total_net: number;
}

export interface DjQuote {
  id: number;
  number: string | null;
  customer_id: number;
  event_id: number | null;
  subject: string | null;
  status: QuoteStatus;
  quote_date: string;
  valid_until: string | null;
  subtotal_net: number;
  tax_total: number;
  total_gross: number;
  finalized_at: string | null;
  created_at: string;
  header_text?: string | null;
  footer_text?: string | null;
  anrede_form?: 'du' | 'sie' | null;
  discount_value?: number | null;
  discount_type?: '%' | '€' | null;
  discount_description?: string | null;
  // joined
  customer_name?: string;
  customer_org?: string;
  items?: DjQuoteItem[];
}

export interface DjInvoiceItem {
  id?: number;
  position: number;
  service_id: number | null;
  package_id: number | null;
  description: string;
  quantity: number;
  unit: string;
  price_net: number;
  tax_rate: number;
  discount_pct: number;
  total_net: number;
}

export interface DjInvoice {
  id: number;
  number: string | null;
  customer_id: number;
  event_id: number | null;
  quote_id: number | null;
  subject: string | null;
  status: InvoiceStatus;
  invoice_date: string;
  due_date: string | null;
  subtotal_net: number;
  tax_total: number;
  total_gross: number;
  paid_amount: number;
  finalized_at: string | null;
  is_cancellation: number;
  cancels_invoice_id: number | null;
  cancelled_by_invoice_id: number | null;
  created_at: string;
  // joined
  customer_name?: string;
  customer_org?: string;
  items?: DjInvoiceItem[];
}

export interface StatusHistoryEntry {
  id: number;
  event_id: number;
  from_status: string | null;
  to_status: string;
  comment: string | null;
  created_at: string;
}

export interface DjEventDetail extends DjEvent {
  statusHistory: StatusHistoryEntry[];
  customer: DjCustomer | null;
  location: object | null;
  quotes: DjQuote[];
  invoices: DjInvoice[];
}

export interface DjExpense {
  id: number;
  expense_date: string;
  category: string;
  description: string;
  amount_gross: number;
  tax_rate: number;
  amount_net: number | null;
  vat_amount: number | null;
  is_recurring: number;
  notes: string | null;
  created_at: string;
}

export interface DjPayment {
  id: number;
  invoice_id: number;
  payment_date: string;
  amount: number;
  method: string | null;
  reference: string | null;
  invoice_number: string | null;
  total_gross: number;
  customer_name: string | null;
  customer_org: string | null;
}

export interface DjTrip {
  source: 'event' | 'manual';
  id: number | null;        // null = Event-basiert, nicht löschbar
  event_id: number | null;
  date: string;
  event_name: string | null;
  start_location: string | null;
  end_location: string | null;
  distance_km: number | null;
  purpose: string | null;
  reimbursement_amount: number;
  mileage_rate: number;
  meal_allowance: number;
}

export interface DjOverview {
  year: string;
  total_events: number;
  open_requests: number;
  pending_quotes: number;
  confirmed_events: number;
  open_vorgespraeche: number;
  completed_events: number;
  revenue_year: number;
  revenue_year_net: number;
  revenue_year_tax: number;
  unpaid_total: number;
  unpaid_count: number;
  confirmed_revenue: number;
  recent_completed: DjEvent[];
}

// ── API-Funktionen ─────────────────────────────────────────────────────────────

export const fetchDjOverview = (year?: number): Promise<DjOverview> =>
  apiClient.get('/dj/overview', { params: { year } }).then(r => r.data);

// Kunden (Kontakte mit area=DJ)
export const fetchDjCustomers = (): Promise<DjCustomer[]> =>
  apiClient.get('/dj/customers').then(r => r.data);

export const searchDjCustomers = (q: string): Promise<DjCustomer[]> =>
  apiClient.get('/dj/customers/search', { params: { q } }).then(r => r.data);

// Events
export const fetchDjEvents = (params?: { year?: number; status?: string; event_type?: string; q?: string }): Promise<DjEvent[]> =>
  apiClient.get('/dj/events', { params }).then(r => r.data);

export const fetchDjEvent = (id: number): Promise<DjEventDetail> =>
  apiClient.get(`/dj/events/${id}`).then(r => r.data);

export const createDjEvent = (data: Partial<DjEvent>): Promise<DjEvent> =>
  apiClient.post('/dj/events', data).then(r => r.data);

export const updateDjEvent = (id: number, data: Partial<DjEvent>): Promise<DjEvent> =>
  apiClient.patch(`/dj/events/${id}`, data).then(r => r.data);

export const deleteDjEvent = (id: number): Promise<void> =>
  apiClient.delete(`/dj/events/${id}`).then(() => undefined);

export const setDjEventVorgespraech = (
  id: number,
  data: { action: 'offen' | 'erledigt'; datum?: string; plz?: string; ort?: string; notizen?: string; km?: number; calendar_uid?: string | null }
): Promise<DjEvent> =>
  apiClient.patch(`/dj/events/${id}/vorgespraech`, data).then(r => r.data);

// Leistungen & Pakete
export const fetchDjServices = (): Promise<DjService[]> =>
  apiClient.get('/dj/services').then(r => r.data);

export const fetchDjPackages = (): Promise<DjPackage[]> =>
  apiClient.get('/dj/services/packages').then(r => r.data);

// Alle Leistungen inkl. inaktive (für Verwaltungsseite)
export const fetchDjServicesAll = (): Promise<DjService[]> =>
  apiClient.get('/dj/services/all').then(r => r.data);

// Leistung anlegen
export const createDjService = (data: Partial<DjService>): Promise<DjService> =>
  apiClient.post('/dj/services', data).then(r => r.data);

// Leistung aktualisieren (inkl. active-Toggle)
export const updateDjService = (id: number, data: Partial<DjService>): Promise<DjService> =>
  apiClient.patch(`/dj/services/${id}`, data).then(r => r.data);

// Leistung deaktivieren (soft-delete via DELETE → setzt active=0)
export const deactivateDjService = (id: number): Promise<{ ok: boolean }> =>
  apiClient.delete(`/dj/services/${id}`).then(r => r.data);

// Paket anlegen
export const createDjPackage = (data: { name: string; description?: string; price_net: number; tax_rate?: number; service_ids?: number[] }): Promise<DjPackage> =>
  apiClient.post('/dj/services/packages', data).then(r => r.data);

// Angebote
export const fetchDjQuotes = (params?: { year?: number; status?: string; customer_id?: number }): Promise<DjQuote[]> =>
  apiClient.get('/dj/quotes', { params }).then(r => r.data);

export const fetchDjQuote = (id: number): Promise<DjQuote> =>
  apiClient.get(`/dj/quotes/${id}`).then(r => r.data);

export const createDjQuote = (data: Partial<DjQuote>): Promise<DjQuote> =>
  apiClient.post('/dj/quotes', data).then(r => r.data);

export const updateDjQuote = (id: number, data: Partial<DjQuote>): Promise<DjQuote> =>
  apiClient.patch(`/dj/quotes/${id}`, data).then(r => r.data);

export const finalizeDjQuote = (id: number): Promise<DjQuote> =>
  apiClient.post(`/dj/quotes/${id}/finalize`).then(r => r.data);

export const deleteDjQuote = (id: number): Promise<void> =>
  apiClient.delete(`/dj/quotes/${id}`).then(() => undefined);

// Rechnungen
export const fetchDjInvoices = (params?: { year?: number; status?: string; customer_id?: number }): Promise<DjInvoice[]> =>
  apiClient.get('/dj/invoices', { params }).then(r => r.data);

export const fetchDjInvoice = (id: number): Promise<DjInvoice> =>
  apiClient.get(`/dj/invoices/${id}`).then(r => r.data);

export const createDjInvoice = (data: Partial<DjInvoice>): Promise<DjInvoice> =>
  apiClient.post('/dj/invoices', data).then(r => r.data);

export const updateDjInvoice = (id: number, data: Partial<DjInvoice>): Promise<DjInvoice> =>
  apiClient.patch(`/dj/invoices/${id}`, data).then(r => r.data);

export const finalizeDjInvoice = (id: number): Promise<DjInvoice> =>
  apiClient.post(`/dj/invoices/${id}/finalize`).then(r => r.data);

export const cancelDjInvoice = (id: number): Promise<DjInvoice> =>
  apiClient.post(`/dj/invoices/${id}/cancel`).then(r => r.data);

export const payDjInvoice = (id: number, data: { payment_date: string; amount: number; method?: string; reference?: string }): Promise<DjInvoice> =>
  apiClient.post(`/dj/invoices/${id}/pay`, data).then(r => r.data);

// Ausgaben
export const fetchDjExpenses = (params?: { year?: number; category?: string }): Promise<DjExpense[]> =>
  apiClient.get('/dj/expenses', { params }).then(r => r.data);

export const createDjExpense = (data: Partial<DjExpense>): Promise<DjExpense> =>
  apiClient.post('/dj/expenses', data).then(r => r.data);

export const updateDjExpense = (id: number, data: Partial<DjExpense>): Promise<DjExpense> =>
  apiClient.patch(`/dj/expenses/${id}`, data).then(r => r.data);

export const deleteDjExpense = (id: number): Promise<void> =>
  apiClient.delete(`/dj/expenses/${id}`).then(() => undefined);

// Buchhaltung
export const fetchDjAccountingSummary = (year?: number) =>
  apiClient.get('/dj/accounting/summary', { params: { year } }).then(r => r.data);

export const fetchDjAccountingPayments = (year?: number): Promise<DjPayment[]> =>
  apiClient.get('/dj/accounting/payments', { params: { year } }).then(r => r.data);

export const fetchDjTrips = (year?: number): Promise<DjTrip[]> =>
  apiClient.get('/dj/accounting/trips', { params: { year } }).then(r => r.data);

export const createDjTrip = (data: {
  expense_date: string;
  start_location: string;
  end_location: string;
  distance_km: number;
  purpose: string;
  rate_per_km: number;
  reimbursement_amount: number;
}): Promise<DjExpense> =>
  apiClient.post('/dj/expenses', {
    expense_date: data.expense_date,
    category: 'fahrzeug',
    description: data.purpose,
    amount_gross: data.reimbursement_amount,
    tax_rate: 0,
    notes: JSON.stringify({
      start_location: data.start_location,
      end_location: data.end_location,
      distance_km: data.distance_km,
      rate_per_km: data.rate_per_km,
    }),
  }).then(r => r.data);

// Einstellungen
export const fetchDjSettings = () =>
  apiClient.get('/dj/settings').then(r => r.data);

export const updateDjSetting = (key: string, value: unknown) =>
  apiClient.patch(`/dj/settings/${key}`, { value }).then(r => r.data);

// ── Settings-Typen ─────────────────────────────────────────────────────────────

export interface DjCompanySettings {
  name: string;
  street: string;
  zip: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  website: string;
  tax_id: string;
  bank_name: string;
  iban: string;
  bic: string;
}

export interface DjTaxSettings {
  vat_rate: number;
  small_business: boolean;
}

export interface DjPaymentTermsSettings {
  days: number;
  note: string;
}

export interface DjNumberSequence {
  id: number;
  prefix: string;
  entity_type: string;
  current_value: number;
  format: string;
}

export const fetchDjSettingByKey = <T>(key: string): Promise<T> =>
  apiClient.get(`/dj/settings/${key}`).then(r => r.data);

export const fetchDjSequences = (): Promise<DjNumberSequence[]> =>
  apiClient.get('/dj/settings/sequences/all').then(r => r.data);

// Logo
export const uploadDjLogo = async (file: File): Promise<{ ok: true; path: string }> => {
  const fd = new FormData();
  fd.append('file', file);
  // fetch statt Axios — Axios-Default-Header 'Content-Type: application/json' würde
  // den multipart/form-data-Header mit boundary überschreiben und multer kaputt machen
  const token = (await import('../store/authStore')).useAuthStore.getState().token;
  const res = await fetch('/api/dj/settings/logo', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: fd,
  });
  if (!res.ok) throw Object.assign(new Error(`Request failed with status code ${res.status}`), { response: { status: res.status } });
  return res.json();
};

export const deleteDjLogo = (): Promise<void> =>
  apiClient.delete('/dj/settings/logo').then(() => undefined);

export const djLogoUrl = (): string =>
  `${apiClient.defaults.baseURL ?? '/api'}/dj/settings/logo`;

export const fetchDjLogoPath = (): Promise<string | null> =>
  fetchDjSettingByKey<string>('logo_path').catch(() => null);

// Default-Textbausteine (legacy)
export const fetchDjDefaultHeaderText = (): Promise<string> =>
  fetchDjSettingByKey<string>('default_header_text').catch(() => '');

export const fetchDjDefaultFooterText = (): Promise<string> =>
  fetchDjSettingByKey<string>('default_footer_text').catch(() => '');

// Default-Textbausteine Du/Sie-Form
export const fetchDjDefaultTexts = async (form: 'du' | 'sie'): Promise<{ header: string; footer: string }> => {
  const [header, footer] = await Promise.all([
    fetchDjSettingByKey<string>(`default_header_text_${form}`).catch(() => ''),
    fetchDjSettingByKey<string>(`default_footer_text_${form}`).catch(() => ''),
  ]);
  return { header: header ?? '', footer: footer ?? '' };
};

// Angebot PDF / Vorschau / Status / Revision
export const previewDjQuote = (id: number): string =>
  `${apiClient.defaults.baseURL ?? '/api'}/dj/quotes/${id}/preview`;

export const downloadDjQuote = (id: number): string =>
  `${apiClient.defaults.baseURL ?? '/api'}/dj/quotes/${id}/pdf`;

export const updateDjQuoteStatus = (id: number, status: string): Promise<DjQuote> =>
  apiClient.patch(`/dj/quotes/${id}/status`, { status }).then(r => r.data);

export const createDjQuoteRevision = (id: number): Promise<DjQuote> =>
  apiClient.post(`/dj/quotes/${id}/revision`).then(r => r.data);
