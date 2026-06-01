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

// ── Sourcing ──────────────────────────────────────────────────────────────────

export type SourcingStatus = 'offen' | 'in_bearbeitung' | 'erledigt';
export type SampleQuality = 'sehr_gut' | 'gut' | 'mittel' | 'schlecht';
export type SampleStatus = 'angefragt' | 'bestellt' | 'erhalten' | 'abgelehnt';

export const SOURCING_CP_KEYS = [
  'cp_hersteller_gefiltert',
  'cp_anforderungen_kommuniziert',
  'cp_erste_preise_erhalten',
  'cp_usp_geprueft',
  'cp_samples_angefragt',
  'cp_sample_analyse',
  'cp_vergleichstabelle',
  'cp_finale_verhandlung',
  'cp_zahlungsziel',
] as const;
export type SourcingCpKey = typeof SOURCING_CP_KEYS[number];

export interface Sourcing {
  product_id: number;
  status: SourcingStatus;
  is_expanded: 0 | 1;
  cp_hersteller_gefiltert: 0 | 1;
  cp_anforderungen_kommuniziert: 0 | 1;
  cp_erste_preise_erhalten: 0 | 1;
  cp_usp_geprueft: 0 | 1;
  cp_samples_angefragt: 0 | 1;
  cp_sample_analyse: 0 | 1;
  cp_vergleichstabelle: 0 | 1;
  cp_finale_verhandlung: 0 | 1;
  cp_zahlungsziel: 0 | 1;
  updated_at: number;
}

export interface SourcingSample {
  id: number;
  product_id: number;
  sort_order: number;
  is_winner: 0 | 1;
  hersteller: string | null;
  sample_kosten: string | null;
  besonderheiten: string | null;
  lieferzeit: string | null;
  qualitaet: SampleQuality | null;
  bewertung: number | null;
  status: SampleStatus | null;
  notizen: string | null;
  created_at: number;
  updated_at: number;
}

export interface SourcingPayload {
  sourcing: Sourcing;
  samples: SourcingSample[];
}

export type SourcingPatch = Partial<
  Pick<Sourcing, 'status' | 'is_expanded'>
  & Record<SourcingCpKey, 0 | 1>
>;

export type SamplePatch = Partial<{
  is_winner: 0 | 1;
  hersteller: string | null;
  sample_kosten: string | null;
  besonderheiten: string | null;
  lieferzeit: string | null;
  qualitaet: SampleQuality | null;
  bewertung: number | null;
  status: SampleStatus | null;
  notizen: string | null;
  sort_order: number;
}>;

export async function fetchSourcing(productId: number): Promise<SourcingPayload> {
  const r = await apiClient.get<SourcingPayload>(`/amazon/products/${productId}/sourcing`);
  return r.data;
}

export async function updateSourcing(productId: number, patch: SourcingPatch): Promise<Sourcing> {
  const r = await apiClient.patch<{ sourcing: Sourcing }>(`/amazon/products/${productId}/sourcing`, patch);
  return r.data.sourcing;
}

export async function createSample(productId: number): Promise<SourcingSample> {
  const r = await apiClient.post<{ sample: SourcingSample }>(
    `/amazon/products/${productId}/sourcing/samples`,
    {},
  );
  return r.data.sample;
}

export async function updateSample(
  productId: number,
  sampleId: number,
  patch: SamplePatch,
): Promise<SourcingSample> {
  const r = await apiClient.patch<{ sample: SourcingSample }>(
    `/amazon/products/${productId}/sourcing/samples/${sampleId}`,
    patch,
  );
  return r.data.sample;
}

export async function deleteSample(productId: number, sampleId: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${productId}/sourcing/samples/${sampleId}`);
}
