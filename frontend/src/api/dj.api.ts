import apiClient from './client';

// ── Typen ──────────────────────────────────────────────────────────────────────

export type EventType = 'hochzeit' | 'firmen_event' | 'club_bar' | 'geburtstag' | 'festival' | 'sonstige';
export type EventStatus = 'neu' | 'vorgespraech_vereinbart' | 'angebot_gesendet' | 'bestaetigt' | 'abgeschlossen' | 'abgesagt';
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
  created_at: string;
  updated_at: string;
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

export interface DjOverview {
  year: string;
  total_events: number;
  open_requests: number;
  pending_quotes: number;
  confirmed_events: number;
  completed_events: number;
  revenue_year: number;
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

export const fetchDjEvent = (id: number): Promise<DjEvent> =>
  apiClient.get(`/dj/events/${id}`).then(r => r.data);

export const createDjEvent = (data: Partial<DjEvent>): Promise<DjEvent> =>
  apiClient.post('/dj/events', data).then(r => r.data);

export const updateDjEvent = (id: number, data: Partial<DjEvent>): Promise<DjEvent> =>
  apiClient.patch(`/dj/events/${id}`, data).then(r => r.data);

export const deleteDjEvent = (id: number): Promise<void> =>
  apiClient.delete(`/dj/events/${id}`).then(() => undefined);

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

export const fetchDjTrips = (year?: number) =>
  apiClient.get('/dj/accounting/trips', { params: { year } }).then(r => r.data);

// Einstellungen
export const fetchDjSettings = () =>
  apiClient.get('/dj/settings').then(r => r.data);

export const updateDjSetting = (key: string, value: unknown) =>
  apiClient.patch(`/dj/settings/${key}`, value).then(r => r.data);
