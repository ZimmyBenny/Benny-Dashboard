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
}): Promise<Page[]> {
  const query: Record<string, string> = {};
  if (params?.section_id !== undefined) query.section_id = String(params.section_id);
  if (params?.pinned !== undefined) query.pinned = String(params.pinned);
  if (params?.archived !== undefined) query.archived = String(params.archived);
  const { data } = await apiClient.get<Page[]>('/workbook/pages', { params: query });
  return data;
}

export async function createPage(data: {
  section_id?: number | null;
  title?: string;
  template_id?: number | null;
  tags?: string;
}): Promise<Page> {
  const { data: result } = await apiClient.post<Page>('/workbook/pages', data);
  return result;
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
