import apiClient from './client';

export type AmazonProductStatus = 'interessant' | 'aktiv' | 'bestehend' | 'verworfen';

export interface AmazonProduct {
  id: number;
  name: string;
  status: AmazonProductStatus;
  image_path: string | null;
  created_at: number; // unix seconds
  updated_at: number;
}

export async function fetchAmazonProducts(includeDiscarded: boolean): Promise<AmazonProduct[]> {
  const r = await apiClient.get<AmazonProduct[]>('/amazon/products', {
    params: { include_discarded: includeDiscarded ? 'true' : 'false' },
  });
  return r.data;
}

export async function createAmazonProduct(name: string): Promise<AmazonProduct> {
  const r = await apiClient.post<AmazonProduct>('/amazon/products', { name });
  return r.data;
}

export async function updateAmazonProduct(
  id: number,
  patch: Partial<{ name: string; status: AmazonProductStatus }>,
): Promise<AmazonProduct> {
  const r = await apiClient.patch<AmazonProduct>(`/amazon/products/${id}`, patch);
  return r.data;
}

export async function deleteAmazonProduct(id: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${id}`);
}

export async function uploadAmazonProductImage(id: number, file: File): Promise<{ image_path: string }> {
  const fd = new FormData();
  fd.append('file', file);
  const r = await apiClient.post<{ image_path: string }>(`/amazon/products/${id}/image`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return r.data;
}

export async function deleteAmazonProductImage(id: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${id}/image`);
}

// Authentifizierte Bild-URL via fetch+blob fuer Verwendung in <img src>.
// Hintergrund: GET /:id/image braucht den Bearer-Token, also bauen wir eine Object-URL.
export async function getAmazonProductImageObjectUrl(id: number): Promise<string> {
  const r = await apiClient.get(`/amazon/products/${id}/image`, { responseType: 'blob' });
  return URL.createObjectURL(r.data as Blob);
}
