import apiClient from './client';
import type { Task } from './tasks.api';
import type { TimeEntry } from './zeiterfassung.api';

export interface Contact {
  id: number;
  contact_kind: 'person' | 'organization';
  type: string;
  area: string;
  customer_number: string | null;
  salutation: string | null;
  title: string | null;
  first_name: string | null;
  last_name: string | null;
  suffix: string | null;
  organization_name: string | null;
  position: string | null;
  debtor_number: string | null;
  creditor_number: string | null;
  e_invoice_default: number;
  iban: string | null;
  bic: string | null;
  vat_id: string | null;
  tax_number: string | null;
  discount_days: number | null;
  discount_percent: number | null;
  payment_term_days: number | null;
  customer_discount: number | null;
  birthday: string | null;
  description: string | null;
  tags: string | null;
  is_archived: number;
  created_at: string;
  updated_at: string;
  // Joined fields (Liste)
  primary_email?: string;
  primary_phone?: string;
  primary_city?: string;
  distance_km?: number | null;
}

export interface ContactAddress {
  id: number;
  contact_id: number;
  street: string | null;
  postal_code: string | null;
  city: string | null;
  country: string;
  label: string;
  is_primary: number;
  latitude: number | null;
  longitude: number | null;
}

export interface ContactEmail {
  id: number;
  contact_id: number;
  email: string;
  label: string;
  is_primary: number;
}

export interface ContactPhone {
  id: number;
  contact_id: number;
  phone: string;
  label: string;
  is_primary: number;
}

export interface ContactWebsite {
  id: number;
  contact_id: number;
  url: string;
  label: string;
  is_primary: number;
}

export interface ContactNote {
  id: number;
  contact_id: number;
  content: string;
  created_at: string;
  updated_at: string;
}

export interface ActivityLogEntry {
  id: number;
  contact_id: number;
  event_type: string;
  message: string;
  related_entity_type: string | null;
  related_entity_id: number | null;
  created_at: string;
}

export interface ContactDetail extends Contact {
  addresses: ContactAddress[];
  emails: ContactEmail[];
  phones: ContactPhone[];
  websites: ContactWebsite[];
  notes: ContactNote[];
  activity_log: ActivityLogEntry[];
}

export interface ContactListResponse {
  data: Contact[];
  total: number;
  page: number;
  limit: number;
}

export interface ContactImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

// ---------------------------------------------------------------------------
// API-Funktionen
// ---------------------------------------------------------------------------

export async function fetchContacts(params?: Record<string, string | number>): Promise<ContactListResponse> {
  return apiClient.get<ContactListResponse>('/contacts', { params }).then(r => r.data);
}

export async function fetchContact(id: number): Promise<ContactDetail> {
  return apiClient.get<ContactDetail>(`/contacts/${id}`).then(r => r.data);
}

export async function createContact(data: Partial<ContactDetail>): Promise<ContactDetail> {
  return apiClient.post<ContactDetail>('/contacts', data).then(r => r.data);
}

export async function updateContact(id: number, data: Partial<ContactDetail>): Promise<ContactDetail> {
  return apiClient.put<ContactDetail>(`/contacts/${id}`, data).then(r => r.data);
}

export async function deleteContact(id: number): Promise<void> {
  await apiClient.delete(`/contacts/${id}`);
}

export async function archiveContact(id: number, archived: boolean): Promise<void> {
  await apiClient.post(`/contacts/${id}/archive`, { archived });
}

export async function fetchNextNumber(): Promise<string> {
  return apiClient.get<{ next_number: string }>('/contacts/next-number').then(r => r.data.next_number);
}

// Notizen
export async function addNote(contactId: number, content: string): Promise<ContactNote> {
  return apiClient.post<ContactNote>(`/contacts/${contactId}/notes`, { content }).then(r => r.data);
}

export async function updateNote(contactId: number, noteId: number, content: string): Promise<ContactNote> {
  return apiClient.put<ContactNote>(`/contacts/${contactId}/notes/${noteId}`, { content }).then(r => r.data);
}

export async function deleteNote(contactId: number, noteId: number): Promise<void> {
  await apiClient.delete(`/contacts/${contactId}/notes/${noteId}`);
}

// Adressen
export async function addAddress(contactId: number, data: Partial<ContactAddress>): Promise<ContactAddress> {
  return apiClient.post<ContactAddress>(`/contacts/${contactId}/addresses`, data).then(r => r.data);
}

export async function updateAddress(contactId: number, addrId: number, data: Partial<ContactAddress>): Promise<ContactAddress> {
  return apiClient.put<ContactAddress>(`/contacts/${contactId}/addresses/${addrId}`, data).then(r => r.data);
}

export async function deleteAddress(contactId: number, addrId: number): Promise<void> {
  await apiClient.delete(`/contacts/${contactId}/addresses/${addrId}`);
}

// CSV-Import
export async function importCsv(file: File): Promise<ContactImportResult> {
  const formData = new FormData();
  formData.append('file', file);
  // Content-Type NICHT manuell setzen — axios setzt automatisch multipart/form-data
  // inkl. korrektem boundary-Parameter. Manuelles Setzen entfernt den boundary → Multer-Fehler.
  return apiClient.post<ContactImportResult>('/contacts/import/csv', formData, {
    headers: { 'Content-Type': undefined },
  }).then(r => r.data);
}

// CSV-Export (Blob)
export async function exportCsv(params?: Record<string, string>): Promise<Blob> {
  return apiClient.get('/contacts/export/csv', { params, responseType: 'blob' }).then(r => r.data as Blob);
}

// PDF-Export (Blob)
export async function exportContactPdf(id: number): Promise<Blob> {
  return apiClient.get(`/contacts/${id}/export/pdf`, { responseType: 'blob' }).then(r => r.data as Blob);
}

// App-Settings
export async function fetchAppSettings(): Promise<Record<string, string>> {
  return apiClient.get<Record<string, string>>('/app-settings').then(r => r.data);
}

export async function updateAppSettings(settings: Record<string, string>): Promise<Record<string, string>> {
  return apiClient.put<Record<string, string>>('/app-settings', settings).then(r => r.data);
}

// Aufgaben eines Kontakts
export async function fetchContactTasks(contactId: number): Promise<Task[]> {
  return apiClient.get<Task[]>(`/contacts/${contactId}/tasks`).then(r => r.data);
}

// Zeiteintraege eines Kontakts
export async function fetchContactTimeEntries(contactId: number): Promise<TimeEntry[]> {
  return apiClient.get<TimeEntry[]>(`/contacts/${contactId}/time-entries`).then(r => r.data);
}

// Hilfsfunktion: Blob-Download triggern
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
