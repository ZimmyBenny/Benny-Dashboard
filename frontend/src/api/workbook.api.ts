import apiClient from './client';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Section {
  id: number;
  workbook_id: number;
  name: string;
  icon: string;
  color?: string | null;
  sort_order: number;
  is_archived: number;
  created_at: string;
  updated_at: string;
}

export interface Page {
  id: number;
  section_id?: number | null;
  workbook_id: number;
  title: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content: any; // TipTap JSON object
  content_text: string;
  excerpt?: string | null;
  tags?: string | null;
  is_pinned: number;
  is_archived: number;
  is_template: number;
  template_id?: number | null;
  sort_order: number;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  parent_id?: number | null;
  contact_id?: number | null;
}

export interface Template {
  id: number;
  name: string;
  description?: string | null;
  content: string;
  is_default: number;
  created_at: string;
  updated_at: string;
}

export interface SearchResult {
  id: number;
  title: string;
  section_id: number | null;
  section_name?: string | null;
  snippet: string;
  rank: number;
}

// ── API Functions ─────────────────────────────────────────────────────────────

// Sections
export async function fetchSections(): Promise<Section[]> {
  const { data } = await apiClient.get<Section[]>('/workbook/sections');
  return data;
}

export async function createSection(data: { name: string; icon?: string; color?: string }): Promise<Section> {
  const { data: result } = await apiClient.post<Section>('/workbook/sections', data);
  return result;
}

export async function updateSection(id: number, data: { name: string; icon?: string; color?: string }): Promise<Section> {
  const { data: result } = await apiClient.put<Section>(`/workbook/sections/${id}`, data);
  return result;
}

export async function archiveSection(id: number): Promise<void> {
  await apiClient.patch(`/workbook/sections/${id}/archive`);
}

export async function deleteSection(id: number): Promise<void> {
  await apiClient.delete(`/workbook/sections/${id}`);
}

// Pages
export async function fetchPages(params?: {
  section_id?: number;
  pinned?: boolean;
  archived?: boolean;
  parent_id?: number | null;
}): Promise<Page[]> {
  const query: Record<string, string> = {};
  if (params?.section_id !== undefined) query.section_id = String(params.section_id);
  if (params?.pinned !== undefined) query.pinned = String(params.pinned);
  if (params?.archived !== undefined) query.archived = String(params.archived);
  if (params?.parent_id !== undefined && params.parent_id !== null) query.parent_id = String(params.parent_id);
  const { data } = await apiClient.get<Page[]>('/workbook/pages', { params: query });
  return data;
}

export async function createPage(data: {
  section_id?: number | null;
  title?: string;
  template_id?: number | null;
  tags?: string;
  parent_id?: number | null;
  contact_id?: number | null;
}): Promise<Page> {
  const { data: result } = await apiClient.post<Page>('/workbook/pages', data);
  return result;
}

export async function fetchPagesByContact(contactId: number): Promise<(Page & { section_name?: string })[]> {
  const { data } = await apiClient.get<(Page & { section_name?: string })[]>('/workbook/pages', { params: { contact_id: String(contactId) } });
  return data;
}

export async function updatePageContact(pageId: number, contactId: number | null): Promise<Page> {
  const { data } = await apiClient.patch<Page>(`/workbook/pages/${pageId}/contact`, { contact_id: contactId });
  return data;
}

export async function fetchPage(id: number): Promise<Page> {
  const { data } = await apiClient.get<Page>(`/workbook/pages/${id}`);
  return data;
}

export async function updatePage(id: number, data: Partial<Page>): Promise<Page> {
  const { data: result } = await apiClient.put<Page>(`/workbook/pages/${id}`, data);
  return result;
}

export async function togglePin(id: number): Promise<Page> {
  const { data } = await apiClient.patch<Page>(`/workbook/pages/${id}/pin`);
  return data;
}

export async function toggleArchive(id: number): Promise<Page> {
  const { data } = await apiClient.patch<Page>(`/workbook/pages/${id}/archive`);
  return data;
}

export async function toggleTemplate(id: number): Promise<Page> {
  const { data } = await apiClient.patch<Page>(`/workbook/pages/${id}/template`);
  return data;
}

export async function deletePage(id: number): Promise<void> {
  await apiClient.delete(`/workbook/pages/${id}`);
}

// Templates
export async function fetchTemplates(): Promise<Template[]> {
  const { data } = await apiClient.get<Template[]>('/workbook/templates');
  return data;
}

// Search
export async function searchWorkbook(q: string): Promise<SearchResult[]> {
  const { data } = await apiClient.get<SearchResult[]>('/workbook/search', { params: { q } });
  return data;
}

// Recent
export async function fetchRecent(): Promise<Page[]> {
  const { data } = await apiClient.get<Page[]>('/workbook/recent');
  return data;
}

export async function fetchRecentlyVisited(): Promise<Page[]> {
  const { data } = await apiClient.get<Page[]>('/workbook/recently-visited');
  return data;
}

// Page view tracking
export async function trackPageView(id: number): Promise<void> {
  await apiClient.post(`/workbook/pages/${id}/view`);
}

// Attachments
export interface Attachment {
  id: number;
  page_id: number;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  uploaded_at: string;
  uploaded_by: string;
}

export async function fetchAttachments(pageId: number): Promise<Attachment[]> {
  const { data } = await apiClient.get<Attachment[]>(`/workbook/pages/${pageId}/attachments`);
  return data;
}

export async function uploadAttachment(pageId: number, file: File): Promise<Attachment> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await apiClient.post<Attachment>(`/workbook/pages/${pageId}/attachments`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function deleteAttachment(id: number): Promise<void> {
  await apiClient.delete(`/workbook/attachments/${id}`);
}

export function getAttachmentDownloadUrl(id: number): string {
  return `/api/workbook/attachments/${id}/download`;
}

// Export
export interface ExportParams {
  format: 'csv' | 'pdf';
  section_id?: number | null;
  page_id?: number | null;
}

export async function exportWorkbook(params: ExportParams): Promise<void> {
  const query: Record<string, string> = { format: params.format };
  if (params.section_id != null) query.section_id = String(params.section_id);
  if (params.page_id != null) query.page_id = String(params.page_id);

  const response = await apiClient.get('/workbook/export', {
    params: query,
    responseType: 'blob',
  });

  // Dateiname aus Content-Disposition auslesen (Fallback: generisch)
  const disposition = (response.headers['content-disposition'] as string | undefined) ?? '';
  const match = disposition.match(/filename="?([^";]+)"?/);
  const filename = match?.[1] ?? `arbeitsmappe-export.${params.format}`;

  const blob = new Blob([response.data as BlobPart], {
    type: params.format === 'csv' ? 'text/csv;charset=utf-8;' : 'application/pdf',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
