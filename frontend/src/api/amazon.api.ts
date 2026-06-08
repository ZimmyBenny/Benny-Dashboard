import apiClient from './client';

export type AmazonProductStatus = 'interessant' | 'aktiv' | 'bestehend' | 'verworfen';

export interface AmazonProduct {
  id: number;
  name: string;
  status: AmazonProductStatus;
  image_path: string | null;
  notes: string | null;
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
  patch: Partial<{ name: string; status: AmazonProductStatus; notes: string | null }>,
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
  sample_ordered: 0 | 1;
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
  sample_ordered: 0 | 1;
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

// ── Brand-Sektion ─────────────────────────────────────────────────────────────

export type BrandStatus = 'offen' | 'in_bearbeitung' | 'erledigt';
export type ResearchStatus = 'frei' | 'belegt' | 'unklar';

export interface BrandName {
  product_id: number;
  status: BrandStatus;
  is_expanded: 0 | 1;
  notes: string | null;
  updated_at: number;
}

export interface BrandCandidate {
  id: number;
  product_id: number;
  sort_order: number;
  name: string;
  is_interesting: 0 | 1;
  is_maybe: 0 | 1;
  is_yes: 0 | 1;
  is_no: 0 | 1;
  is_favorite: 0 | 1;
  is_archived: 0 | 1;
  remarks: string | null;
  trademark_status: ResearchStatus | null;
  domain_com_status: ResearchStatus | null;
  domain_de_status: ResearchStatus | null;
  social_status: ResearchStatus | null;
  research_url: string | null;
  research_notes: string | null;
  ranking: number | null;
  created_at: number;
  updated_at: number;
}

export interface BrandPayload {
  brand: BrandName;
  names: BrandCandidate[];
}

export type BrandPatch = Partial<Pick<BrandName, 'status' | 'is_expanded' | 'notes'>>;

export type CandidatePatch = Partial<{
  name: string;
  is_interesting: 0 | 1;
  is_maybe: 0 | 1;
  is_yes: 0 | 1;
  is_no: 0 | 1;
  is_favorite: 0 | 1;
  is_archived: 0 | 1;
  remarks: string | null;
  trademark_status: ResearchStatus | null;
  domain_com_status: ResearchStatus | null;
  domain_de_status: ResearchStatus | null;
  social_status: ResearchStatus | null;
  research_url: string | null;
  research_notes: string | null;
  ranking: number | null;
  sort_order: number;
}>;

export async function fetchBrand(productId: number): Promise<BrandPayload> {
  const r = await apiClient.get<BrandPayload>(`/amazon/products/${productId}/brand`);
  return r.data;
}

export async function updateBrand(productId: number, patch: BrandPatch): Promise<BrandName> {
  const r = await apiClient.patch<{ brand: BrandName }>(`/amazon/products/${productId}/brand`, patch);
  return r.data.brand;
}

export async function createCandidate(productId: number, name: string): Promise<BrandCandidate> {
  const r = await apiClient.post<{ name: BrandCandidate }>(
    `/amazon/products/${productId}/brand/names`,
    { name },
  );
  return r.data.name;
}

export async function updateCandidate(
  productId: number,
  candidateId: number,
  patch: CandidatePatch,
): Promise<BrandCandidate> {
  const r = await apiClient.patch<{ name: BrandCandidate }>(
    `/amazon/products/${productId}/brand/names/${candidateId}`,
    patch,
  );
  return r.data.name;
}

export async function deleteCandidate(productId: number, candidateId: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${productId}/brand/names/${candidateId}`);
}

// ── Checkliste ────────────────────────────────────────────────────────────────

export interface ChecklistItem {
  id: number;
  section_id: number;
  sort_order: number;
  description: string;
  remark: string | null;
  link_url: string | null;
  link_label: string | null;
  is_done: 0 | 1;
  created_at: number;
  updated_at: number;
}

export interface ChecklistSection {
  id: number;
  sort_order: number;
  title: string;
  items: ChecklistItem[];
  created_at: number;
  updated_at: number;
}

export interface ChecklistPayload {
  sections: ChecklistSection[];
}

export type ChecklistSectionPatch = Partial<{ title: string; sort_order: number }>;
export type ChecklistItemPatch = Partial<{
  description: string;
  remark: string | null;
  link_url: string | null;
  link_label: string | null;
  sort_order: number;
  is_done: 0 | 1;
}>;
export interface ChecklistItemCreate {
  description: string;
  remark?: string | null;
  link_url?: string | null;
  link_label?: string | null;
}

// Master
export async function fetchChecklistMaster(): Promise<ChecklistPayload> {
  const r = await apiClient.get<ChecklistPayload>('/amazon/checklist/master');
  return r.data;
}
export async function createMasterSection(title: string): Promise<ChecklistSection> {
  const r = await apiClient.post<{ section: ChecklistSection }>('/amazon/checklist/master/sections', { title });
  return r.data.section;
}
export async function updateMasterSection(id: number, patch: ChecklistSectionPatch): Promise<ChecklistSection> {
  const r = await apiClient.patch<{ section: ChecklistSection }>(`/amazon/checklist/master/sections/${id}`, patch);
  return r.data.section;
}
export async function deleteMasterSection(id: number): Promise<void> {
  await apiClient.delete(`/amazon/checklist/master/sections/${id}`);
}
export async function createMasterItem(sectionId: number, input: ChecklistItemCreate): Promise<ChecklistItem> {
  const r = await apiClient.post<{ item: ChecklistItem }>(`/amazon/checklist/master/sections/${sectionId}/items`, input);
  return r.data.item;
}
export async function updateMasterItem(id: number, patch: ChecklistItemPatch): Promise<ChecklistItem> {
  const r = await apiClient.patch<{ item: ChecklistItem }>(`/amazon/checklist/master/items/${id}`, patch);
  return r.data.item;
}
export async function deleteMasterItem(id: number): Promise<void> {
  await apiClient.delete(`/amazon/checklist/master/items/${id}`);
}

// Produkt
export async function fetchChecklistProduct(productId: number): Promise<ChecklistPayload> {
  const r = await apiClient.get<ChecklistPayload>(`/amazon/products/${productId}/checklist`);
  return r.data;
}
export async function createProductSection(productId: number, title: string): Promise<ChecklistSection> {
  const r = await apiClient.post<{ section: ChecklistSection }>(`/amazon/products/${productId}/checklist/sections`, { title });
  return r.data.section;
}
export async function updateProductSection(productId: number, sectionId: number, patch: ChecklistSectionPatch): Promise<ChecklistSection> {
  const r = await apiClient.patch<{ section: ChecklistSection }>(`/amazon/products/${productId}/checklist/sections/${sectionId}`, patch);
  return r.data.section;
}
export async function deleteProductSection(productId: number, sectionId: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${productId}/checklist/sections/${sectionId}`);
}
export async function createProductItem(productId: number, sectionId: number, input: ChecklistItemCreate): Promise<ChecklistItem> {
  const r = await apiClient.post<{ item: ChecklistItem }>(`/amazon/products/${productId}/checklist/sections/${sectionId}/items`, input);
  return r.data.item;
}
export async function updateProductItem(productId: number, itemId: number, patch: ChecklistItemPatch): Promise<ChecklistItem> {
  const r = await apiClient.patch<{ item: ChecklistItem }>(`/amazon/products/${productId}/checklist/items/${itemId}`, patch);
  return r.data.item;
}
export async function deleteProductItem(productId: number, itemId: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${productId}/checklist/items/${itemId}`);
}

// ── USP (Phase 1) ─────────────────────────────────────────────────────────────
export interface UspMeta { product_id: number; marke: string | null; hauptfokus: string | null; logo_path: string | null; status: SourcingStatus; updated_at: number; }
export interface UspPointImage { id: number; point_id: number; sort_order: number; file_path: string; created_at: number; }
export interface UspPointQuestion { id: number; point_id: number; sort_order: number; text: string; created_at: number; updated_at: number; }
export interface UspPoint { id: number; product_id: number; sort_order: number; title: string; body: string | null; created_at: number; updated_at: number; images: UspPointImage[]; questions: UspPointQuestion[]; }
export interface UspManufacturer { id: number; product_id: number; sort_order: number; name: string; ansprechpartner: string | null; datum: string | null; notes: string | null; created_at: number; updated_at: number; }
export type UspFeasibilityStatus = 'offen' | 'umsetzbar' | 'teilweise' | 'nicht';
export interface UspFeasibility { id: number; point_id: number; manufacturer_id: number; status: UspFeasibilityStatus; note: string | null; include_in_pdf: number; updated_at: number; }
export interface UspPayload { meta: UspMeta; points: UspPoint[]; manufacturers: UspManufacturer[]; feasibility: UspFeasibility[]; }
export type UspMetaPatch = Partial<Pick<UspMeta, 'marke' | 'hauptfokus' | 'status'>>;
export type UspPointPatch = Partial<Pick<UspPoint, 'title' | 'body'>>;
export type UspManufacturerPatch = Partial<Pick<UspManufacturer, 'name' | 'ansprechpartner' | 'datum' | 'notes'>>;

export async function fetchUsp(productId: number): Promise<UspPayload> {
  return (await apiClient.get(`/amazon/products/${productId}/usp`)).data as UspPayload;
}
export async function updateUspMeta(productId: number, patch: UspMetaPatch): Promise<UspMeta> {
  return ((await apiClient.patch(`/amazon/products/${productId}/usp`, patch)).data as { meta: UspMeta }).meta;
}
export async function createUspPoint(productId: number, title?: string): Promise<UspPoint> {
  return ((await apiClient.post(`/amazon/products/${productId}/usp/points`, title !== undefined ? { title } : {})).data as { point: UspPoint }).point;
}
export async function updateUspPoint(productId: number, pointId: number, patch: UspPointPatch): Promise<UspPoint> {
  return ((await apiClient.patch(`/amazon/products/${productId}/usp/points/${pointId}`, patch)).data as { point: UspPoint }).point;
}
export async function deleteUspPoint(productId: number, pointId: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${productId}/usp/points/${pointId}`);
}
export async function reorderUspPoints(productId: number, order: number[]): Promise<void> {
  await apiClient.patch(`/amazon/products/${productId}/usp/points/reorder`, { order });
}
export async function uploadUspPointImage(productId: number, pointId: number, file: File): Promise<UspPointImage> {
  const fd = new FormData(); fd.append('file', file);
  return ((await apiClient.post(`/amazon/products/${productId}/usp/points/${pointId}/images`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })).data as { image: UspPointImage }).image;
}
export async function reorderUspPointImages(productId: number, pointId: number, order: number[]): Promise<void> {
  await apiClient.patch(`/amazon/products/${productId}/usp/points/${pointId}/images/reorder`, { order });
}
export async function deleteUspPointImage(productId: number, pointId: number, imageId: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${productId}/usp/points/${pointId}/images/${imageId}`);
}
export async function getUspImageObjectUrl(productId: number, imageId: number): Promise<string> {
  const r = await apiClient.get(`/amazon/products/${productId}/usp/images/${imageId}`, { responseType: 'blob' });
  return URL.createObjectURL(r.data as Blob);
}
export async function createUspPointQuestion(productId: number, pointId: number, text?: string): Promise<UspPointQuestion> {
  return ((await apiClient.post(`/amazon/products/${productId}/usp/points/${pointId}/questions`, text !== undefined ? { text } : {})).data as { question: UspPointQuestion }).question;
}
export async function updateUspPointQuestion(productId: number, pointId: number, qId: number, text: string): Promise<UspPointQuestion> {
  return ((await apiClient.patch(`/amazon/products/${productId}/usp/points/${pointId}/questions/${qId}`, { text })).data as { question: UspPointQuestion }).question;
}
export async function deleteUspPointQuestion(productId: number, pointId: number, qId: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${productId}/usp/points/${pointId}/questions/${qId}`);
}
export async function uploadUspLogo(productId: number, file: File): Promise<UspMeta> {
  const fd = new FormData(); fd.append('file', file);
  return ((await apiClient.post(`/amazon/products/${productId}/usp/logo`, fd, { headers: { 'Content-Type': 'multipart/form-data' } })).data as { meta: UspMeta }).meta;
}
export async function deleteUspLogo(productId: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${productId}/usp/logo`);
}
export async function getUspLogoObjectUrl(productId: number): Promise<string> {
  const r = await apiClient.get(`/amazon/products/${productId}/usp/logo`, { responseType: 'blob' });
  return URL.createObjectURL(r.data as Blob);
}
export async function createUspManufacturer(productId: number, name?: string): Promise<UspManufacturer> {
  return ((await apiClient.post(`/amazon/products/${productId}/usp/manufacturers`, name !== undefined ? { name } : {})).data as { manufacturer: UspManufacturer }).manufacturer;
}
export async function updateUspManufacturer(productId: number, mId: number, patch: UspManufacturerPatch): Promise<UspManufacturer> {
  return ((await apiClient.patch(`/amazon/products/${productId}/usp/manufacturers/${mId}`, patch)).data as { manufacturer: UspManufacturer }).manufacturer;
}
export async function deleteUspManufacturer(productId: number, mId: number): Promise<void> {
  await apiClient.delete(`/amazon/products/${productId}/usp/manufacturers/${mId}`);
}
export async function reorderUspManufacturers(productId: number, order: number[]): Promise<void> {
  await apiClient.patch(`/amazon/products/${productId}/usp/manufacturers/reorder`, { order });
}
export async function setUspFeasibility(
  productId: number,
  input: { point_id: number; manufacturer_id: number; status?: UspFeasibilityStatus; note?: string | null; include_in_pdf?: number },
): Promise<UspFeasibility> {
  return ((await apiClient.put(`/amazon/products/${productId}/usp/feasibility`, input)).data as { feasibility: UspFeasibility }).feasibility;
}
