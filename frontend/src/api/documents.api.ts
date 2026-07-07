/**
 * Frontend API-Wrapper fuer das Dokumente-Modul.
 *
 * Endpoints (siehe backend/src/routes/documents.routes.ts):
 *  - GET    /api/dokumente/tree                Kompletter Ordnerbaum + Dateizaehler
 *  - GET    /api/dokumente/folders/:id         Inhalt eines Ordners
 *  - POST   /api/dokumente/folders             Ordner anlegen
 *  - PATCH  /api/dokumente/folders/:id         Umbenennen / verschieben
 *  - DELETE /api/dokumente/folders/:id         Loeschen (soft)
 *  - POST   /api/dokumente/files               Multi-Upload
 *  - GET    /api/dokumente/files/:id/blob      Datei ausliefern (Vorschau/Download)
 *  - PATCH  /api/dokumente/files/:id           Umbenennen / verschieben
 *  - DELETE /api/dokumente/files/:id           Loeschen (soft)
 *  - GET    /api/dokumente/usage               Speicher-Nutzung
 *  - POST   /api/dokumente/mirror-rebuild      Spiegel neu aufbauen
 *  - GET/PATCH /api/dokumente/settings         Modul-Settings
 *  - GET    /api/dokumente/search              Ordner-/Datei-Suche (optional area_slug)
 *  - GET    /api/dokumente/folders/by-product/:productId  Mit Amazon-Produkt verknuepfte Ordner
 */
import apiClient from './client';

export interface DocFolder {
  id: number;
  parent_id: number | null;
  name: string;
  is_area_root: number;
  area_slug: string | null;
  created_at: string;
  file_count: number;
  product_id?: number | null;
  product_name?: string | null;
}

export interface DocFile {
  id: number;
  folder_id: number;
  filename: string;
  size_bytes: number;
  mime_type: string | null;
  created_at: string;
}

export interface DocUsage {
  usedBytes: number;
  budgetMb: number;
}

export interface DocSettings {
  dokumente_budget_mb: string;
  dokumente_mirror_path: string;
  dokumente_storage_path: string;
}

export const fetchDocTree = (): Promise<DocFolder[]> =>
  apiClient.get('/dokumente/tree').then((r) => r.data);

export const fetchFolderContents = (
  id: number,
): Promise<{ folders: DocFolder[]; files: DocFile[] }> =>
  apiClient.get(`/dokumente/folders/${id}`).then((r) => r.data);

export const createFolder = (parent_id: number | null, name: string): Promise<DocFolder> =>
  apiClient.post('/dokumente/folders', { parent_id, name }).then((r) => r.data);

export const updateFolder = (
  id: number,
  data: { name?: string; parent_id?: number; product_id?: number | null },
): Promise<DocFolder> => apiClient.patch(`/dokumente/folders/${id}`, data).then((r) => r.data);

export const deleteFolder = (
  id: number,
): Promise<{ ok: true; files: number; folders: number }> =>
  apiClient.delete(`/dokumente/folders/${id}`).then((r) => r.data);

export const uploadDocFiles = (
  folder_id: number,
  files: File[],
): Promise<{ created: Array<{ id: number; filename: string }> }> => {
  const fd = new FormData();
  fd.append('folder_id', String(folder_id));
  files.forEach((f) => fd.append('file', f));
  return apiClient
    .post('/dokumente/files', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    .then((r) => r.data);
};

export const updateFile = (
  id: number,
  data: { filename?: string; folder_id?: number },
): Promise<DocFile> => apiClient.patch(`/dokumente/files/${id}`, data).then((r) => r.data);

export const deleteFile = (id: number): Promise<{ ok: true }> =>
  apiClient.delete(`/dokumente/files/${id}`).then((r) => r.data);

export const fetchDocUsage = (): Promise<DocUsage> =>
  apiClient.get('/dokumente/usage').then((r) => r.data);

export const rebuildMirror = (): Promise<{ ok: true }> =>
  apiClient.post('/dokumente/mirror-rebuild').then((r) => r.data);

export const fetchDocSettings = (): Promise<DocSettings> =>
  apiClient.get('/dokumente/settings').then((r) => r.data);

export const updateDocSettings = (
  updates: Partial<DocSettings>,
): Promise<{ ok: true }> => apiClient.patch('/dokumente/settings', updates).then((r) => r.data);

/** GET /api/dokumente/files/:id/blob mit responseType 'blob' — Auth-Blob-Muster. */
export const fetchDocFileBlobUrl = (id: number): Promise<string> =>
  apiClient
    .get(`/dokumente/files/${id}/blob`, { responseType: 'blob' })
    .then((r) => URL.createObjectURL(r.data as Blob));

/**
 * POST /api/dokumente/files/zip — markierte Dateien als ZIP herunterladen.
 * Antwort als Blob (Auth via apiClient), loest den Download per <a download> aus.
 */
export const downloadDocFilesZip = async (ids: number[], filename: string): Promise<void> => {
  const res = await apiClient.post(
    '/dokumente/files/zip',
    { ids, filename },
    { responseType: 'blob' },
  );
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export interface DocSearchFolder {
  id: number;
  name: string;
  path: string[];
}

export interface DocSearchFile {
  id: number;
  folder_id: number;
  filename: string;
  size_bytes: number;
  mime_type: string | null;
  created_at: string;
  path: string[];
}

export interface DocSearchResult {
  folders: DocSearchFolder[];
  files: DocSearchFile[];
}

export const searchDocuments = (q: string, areaSlug?: string): Promise<DocSearchResult> =>
  apiClient
    .get('/dokumente/search', { params: { q, ...(areaSlug ? { area_slug: areaSlug } : {}) } })
    .then((r) => r.data);

export interface DocFolderByProduct {
  id: number;
  name: string;
  area_slug: string | null;
  path: string[];
}

export const fetchFoldersByProduct = (productId: number): Promise<DocFolderByProduct[]> =>
  apiClient.get(`/dokumente/folders/by-product/${productId}`).then((r) => r.data);
