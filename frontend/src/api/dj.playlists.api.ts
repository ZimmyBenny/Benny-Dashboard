/**
 * Frontend API-Wrapper fuer das DJ-Playlisten-Modul.
 *
 * Endpoints (siehe backend/src/routes/dj.playlists.routes.ts):
 *  - GET    /api/dj/playlists                 Liste (Join mit Kategorie/DJ + Datei-Info)
 *  - POST   /api/dj/playlists                  Upload (multipart, EINE Datei)
 *  - PATCH  /api/dj/playlists/:id              title/category_id/dj_id/year aendern
 *  - DELETE /api/dj/playlists/:id              Loeschen (Datei + Zeile)
 *  - GET/POST/PATCH/DELETE /api/dj/playlist-categories   Kategorien-CRUD
 *  - GET/POST/PATCH/DELETE /api/dj/playlist-djs          DJ-CRUD
 */
import apiClient from './client';

export interface Playlist {
  id: number;
  title: string;
  category_id: number | null;
  category_name: string | null;
  dj_id: number | null;
  dj_name: string | null;
  year: number | null;
  doc_file_id: number;
  filename: string;
  mime_type: string | null;
  size_bytes: number;
  created_at: string;
  updated_at: string;
}

export interface PlaylistCategory {
  id: number;
  name: string;
  sort_order: number;
  created_at: string;
}

export interface PlaylistDj {
  id: number;
  name: string;
  sort_order: number;
  created_at: string;
}

export type PlaylistFileType = 'Excel' | 'CSV' | 'PDF' | 'HTML' | 'Datei';

/** Leitet den Anzeige-Dateityp aus der Extension ab. */
export function playlistFileType(filename: string): PlaylistFileType {
  const ext = filename.toLowerCase().slice(filename.lastIndexOf('.'));
  if (ext === '.xlsx' || ext === '.xls') return 'Excel';
  if (ext === '.csv') return 'CSV';
  if (ext === '.pdf') return 'PDF';
  if (ext === '.html' || ext === '.htm') return 'HTML';
  return 'Datei';
}

export const fetchPlaylists = (): Promise<Playlist[]> =>
  apiClient.get('/dj/playlists').then((r) => r.data);

export const uploadPlaylist = (
  file: File,
  title: string,
  categoryId: number | null,
  djId: number | null,
  year: number | null,
): Promise<Playlist> => {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('title', title);
  fd.append('category_id', categoryId !== null ? String(categoryId) : '');
  fd.append('dj_id', djId !== null ? String(djId) : '');
  fd.append('year', year !== null ? String(year) : '');
  return apiClient
    .post('/dj/playlists', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
    .then((r) => r.data);
};

export const updatePlaylist = (
  id: number,
  data: { title?: string; category_id?: number | null; dj_id?: number | null; year?: number | null },
): Promise<Playlist> => apiClient.patch(`/dj/playlists/${id}`, data).then((r) => r.data);

export const deletePlaylist = (id: number): Promise<{ ok: true }> =>
  apiClient.delete(`/dj/playlists/${id}`).then((r) => r.data);

export const fetchPlaylistCategories = (): Promise<PlaylistCategory[]> =>
  apiClient.get('/dj/playlist-categories').then((r) => r.data);

export const createPlaylistCategory = (name: string): Promise<PlaylistCategory> =>
  apiClient.post('/dj/playlist-categories', { name }).then((r) => r.data);

export const updatePlaylistCategory = (
  id: number,
  data: { name?: string; sort_order?: number },
): Promise<PlaylistCategory> =>
  apiClient.patch(`/dj/playlist-categories/${id}`, data).then((r) => r.data);

export const deletePlaylistCategory = (id: number): Promise<{ ok: true }> =>
  apiClient.delete(`/dj/playlist-categories/${id}`).then((r) => r.data);

export const fetchPlaylistDjs = (): Promise<PlaylistDj[]> =>
  apiClient.get('/dj/playlist-djs').then((r) => r.data);

export const createPlaylistDj = (name: string): Promise<PlaylistDj> =>
  apiClient.post('/dj/playlist-djs', { name }).then((r) => r.data);

export const updatePlaylistDj = (
  id: number,
  data: { name?: string; sort_order?: number },
): Promise<PlaylistDj> => apiClient.patch(`/dj/playlist-djs/${id}`, data).then((r) => r.data);

export const deletePlaylistDj = (id: number): Promise<{ ok: true }> =>
  apiClient.delete(`/dj/playlist-djs/${id}`).then((r) => r.data);
