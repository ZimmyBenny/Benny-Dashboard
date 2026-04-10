import apiClient from './client';

export interface QuickLink {
  id: number;
  label: string;
  url: string;
  sort_order: number;
  visible: boolean;
  created_at: string;
}

export const fetchQuickLinks = () =>
  apiClient.get<QuickLink[]>('/quick-links').then(r => r.data);

export const fetchVisibleQuickLinks = () =>
  apiClient.get<QuickLink[]>('/quick-links?visible=true').then(r => r.data);

export const createQuickLink = (data: { label: string; url: string }) =>
  apiClient.post<QuickLink>('/quick-links', data).then(r => r.data);

export const updateQuickLink = (id: number, data: Partial<Pick<QuickLink, 'label' | 'url' | 'visible'>>) =>
  apiClient.put<QuickLink>(`/quick-links/${id}`, data).then(r => r.data);

export const deleteQuickLink = (id: number) =>
  apiClient.delete(`/quick-links/${id}`);

export const reorderQuickLinks = (ids: number[]) =>
  apiClient.put<QuickLink[]>('/quick-links/reorder', { ids }).then(r => r.data);
