import apiClient from './client';

export interface SteuerFile { id: number; item_id: number; sort_order: number; file_path: string; original_name: string | null; mime: string | null; created_at: number; }
export interface SteuerItem { id: number; category_id: number; sort_order: number; title: string; is_done: number; note: string | null; created_at: number; updated_at: number; files: SteuerFile[]; }
export interface SteuerCategory { id: number; jahr: number; sort_order: number; name: string; created_at: number; updated_at: number; items: SteuerItem[]; }
export interface SteuerPayload { jahr: number; categories: SteuerCategory[]; }
export type SteuerItemPatch = Partial<{ title: string; is_done: number; note: string | null }>;

export async function fetchSteuerJahre(): Promise<number[]> {
  return ((await apiClient.get('/steuer/jahre')).data as { jahre: number[] }).jahre;
}
export async function fetchSteuer(jahr: number): Promise<SteuerPayload> {
  return (await apiClient.get(`/steuer/${jahr}`)).data as SteuerPayload;
}
export async function createSteuerCategory(jahr: number, name?: string): Promise<SteuerCategory> {
  return ((await apiClient.post(`/steuer/${jahr}/categories`, name !== undefined ? { name } : {})).data as { category: SteuerCategory }).category;
}
export async function updateSteuerCategory(id: number, name: string): Promise<SteuerCategory> {
  return ((await apiClient.patch(`/steuer/categories/${id}`, { name })).data as { category: SteuerCategory }).category;
}
export async function deleteSteuerCategory(id: number): Promise<void> { await apiClient.delete(`/steuer/categories/${id}`); }
export async function reorderSteuerCategories(jahr: number, order: number[]): Promise<void> { await apiClient.patch(`/steuer/${jahr}/categories/reorder`, { order }); }
export async function createSteuerItem(categoryId: number, title?: string): Promise<SteuerItem> {
  return ((await apiClient.post(`/steuer/categories/${categoryId}/items`, title !== undefined ? { title } : {})).data as { item: SteuerItem }).item;
}
export async function updateSteuerItem(id: number, patch: SteuerItemPatch): Promise<SteuerItem> {
  return ((await apiClient.patch(`/steuer/items/${id}`, patch)).data as { item: SteuerItem }).item;
}
export async function deleteSteuerItem(id: number): Promise<void> { await apiClient.delete(`/steuer/items/${id}`); }
export async function reorderSteuerItems(categoryId: number, order: number[]): Promise<void> { await apiClient.patch(`/steuer/categories/${categoryId}/items/reorder`, { order }); }
export async function uploadSteuerFile(itemId: number, file: File): Promise<SteuerFile> {
  const fd = new FormData(); fd.append('file', file);
  return ((await apiClient.post(`/steuer/items/${itemId}/files`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })).data as { file: SteuerFile }).file;
}
export async function getSteuerFileObjectUrl(itemId: number, fId: number): Promise<string> {
  const r = await apiClient.get(`/steuer/items/${itemId}/files/${fId}`, { responseType: 'blob' });
  return URL.createObjectURL(r.data as Blob);
}
export async function deleteSteuerFile(itemId: number, fId: number): Promise<void> { await apiClient.delete(`/steuer/items/${itemId}/files/${fId}`); }
export async function copySteuerYear(fromJahr: number, toJahr: number): Promise<SteuerCategory[]> {
  return ((await apiClient.post('/steuer/copy-year', { from_jahr: fromJahr, to_jahr: toJahr })).data as { categories: SteuerCategory[] }).categories;
}
export async function exportSteuerPdf(jahr: number, itemIds: number[] | 'all'): Promise<Blob> {
  const r = await apiClient.post(`/steuer/${jahr}/export`, { item_ids: itemIds }, { responseType: 'blob' });
  return r.data as Blob;
}
export async function exportSteuerZip(jahr: number, itemIds: number[] | 'all'): Promise<Blob> {
  const r = await apiClient.post(`/steuer/${jahr}/export-zip`, { item_ids: itemIds }, { responseType: 'blob' });
  return r.data as Blob;
}
